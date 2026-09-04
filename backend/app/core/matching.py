"""
ANPR normalisation + watchlist matching logic.

Implements the safeguards described in the HLD (Section 8) so that not
every raw OCR read is treated as a confirmed watchlist hit:
  - plate normalisation (common OCR character confusions)
  - OCR confidence gating
  - exact-match vs fuzzy-match scoring
"""

import re

# Common OCR confusions on Indian plates (upper-case, alphanumeric)
_CONFUSION_MAP = str.maketrans({
    "O": "0", "I": "1", "B": "8", "S": "5", "Z": "2",
})

MIN_OCR_CONFIDENCE_TO_MATCH = 0.60  # below this, don't even attempt a watchlist lookup
EXACT_MATCH_CONFIDENCE = 1.0
FUZZY_MATCH_MIN_SIMILARITY = 0.85  # confusion-aware similarity threshold — see below

# Fuzzy matching combines two independent sources of uncertainty — imperfect
# OCR and imperfect string similarity — so it requires a stricter OCR floor
# than an exact match does.
FUZZY_MATCH_MIN_OCR_CONFIDENCE = 0.75

# Trigram similarity on very short strings is noisy. Indian plates
# normalise to 9-10 characters; require most of that before even
# considering a fuzzy match.
MIN_PLATE_LENGTH_FOR_FUZZY_MATCH = 7

# How many candidates the cheap SQL trigram pre-filter pulls before the
# precise (but DB-index-unfriendly) confusion-aware scoring runs on them.
FUZZY_CANDIDATE_POOL_SIZE = 20
FUZZY_CANDIDATE_MIN_TRIGRAM_SIMILARITY = 0.3  # deliberately loose — just a candidate net

# Character pairs OCR genuinely confuses on plates (shape-similar
# glyphs). This set is the entire reason fuzzy matching is safe to run at
# all: importantly, a character SUBSTITUTION that is NOT in this set is
# treated as effectively disqualifying, not just "costly" — because a
# single non-confusable character difference (e.g. one digit swapped) is
# far more likely to mean "this is a different real vehicle with a
# similar plate" than "OCR misread this exact plate". Conflating those
# two cases is a real false-positive risk on a system that generates
# law-enforcement alerts, so this function deliberately does NOT use
# generic edit distance or generic trigram similarity as the final gate
# (see find_watchlist_match in detections.py for why trigram similarity
# is used only as a cheap upstream candidate filter, never as the
# accept/reject decision).
_CONFUSABLE_PAIRS = {
    frozenset({"O", "0"}), frozenset({"I", "1"}), frozenset({"S", "5"}),
    frozenset({"B", "8"}), frozenset({"Z", "2"}), frozenset({"G", "6"}),
}
_CONFUSABLE_SUBSTITUTION_COST = 0.3
_NON_CONFUSABLE_SUBSTITUTION_COST = 100.0  # effectively disqualifying


def normalize_plate(raw_text: str) -> str:
    """
    Normalises a raw OCR plate string: strips whitespace/punctuation,
    upper-cases, and does NOT blindly apply character-confusion correction
    (that is applied only as a *secondary* fuzzy pass in the DB query,
    since blindly correcting could itself introduce false matches).
    """
    if not raw_text:
        return ""
    cleaned = re.sub(r"[^A-Za-z0-9]", "", raw_text).upper()
    return cleaned


def should_attempt_match(ocr_confidence: float | None) -> bool:
    """Gate: don't run a watchlist lookup for very low-confidence OCR reads."""
    if ocr_confidence is None:
        return False
    return ocr_confidence >= MIN_OCR_CONFIDENCE_TO_MATCH


def should_attempt_fuzzy_match(ocr_confidence: float | None, normalized_plate: str) -> bool:
    """
    Stricter gate than should_attempt_match: fuzzy matching is only
    attempted when OCR confidence clears the higher bar AND the plate is
    long enough for similarity scoring to be meaningful rather than noise.
    """
    if ocr_confidence is None or ocr_confidence < FUZZY_MATCH_MIN_OCR_CONFIDENCE:
        return False
    if len(normalized_plate) < MIN_PLATE_LENGTH_FOR_FUZZY_MATCH:
        return False
    return True


def _substitution_cost(a: str, b: str) -> float:
    if a == b:
        return 0.0
    if frozenset({a, b}) in _CONFUSABLE_PAIRS:
        return _CONFUSABLE_SUBSTITUTION_COST
    return _NON_CONFUSABLE_SUBSTITUTION_COST


def confusion_aware_similarity(a: str, b: str) -> float:
    """
    Edit-distance-based similarity where only documented OCR character
    confusions are cheap to substitute — any other character difference
    is effectively disqualifying. A single dropped/added character (common
    when a plate is clipped by the camera frame or motion-blurred at one
    end) is allowed at normal cost, same as generic Levenshtein.

    This intentionally does NOT reduce to "how many characters differ" —
    a plate that differs by one non-confusable digit scores low here even
    though it's only one edit away, because that's much more likely to be
    a different real vehicle than an OCR error on the right one. See the
    module-level comment on _CONFUSABLE_PAIRS for the full reasoning.
    """
    n, m = len(a), len(b)
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = float(i)
    for j in range(m + 1):
        dp[0][j] = float(j)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            dp[i][j] = min(
                dp[i - 1][j] + 1,  # deletion
                dp[i][j - 1] + 1,  # insertion
                dp[i - 1][j - 1] + _substitution_cost(a[i - 1], b[j - 1]),  # substitution
            )
    distance = dp[n][m]
    return 1 - (distance / max(n, m, 1))


def severity_for(priority: str, match_confidence: float) -> str:
    """
    Combines watchlist entry priority with match confidence to decide alert
    severity. A high-priority entry with only a fuzzy match is downgraded
    one level rather than auto-escalated to Critical.
    """
    if match_confidence >= EXACT_MATCH_CONFIDENCE:
        return priority  # trust the entry's own priority on an exact match
    downgrade = {"critical": "high", "high": "medium", "medium": "low", "low": "low"}
    return downgrade.get(priority, "medium")
