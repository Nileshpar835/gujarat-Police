import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Detection, Vehicle, VehicleDetection, WatchlistEntry, Alert, Camera
from app.core.matching import (
    normalize_plate, should_attempt_match, should_attempt_fuzzy_match,
    severity_for, EXACT_MATCH_CONFIDENCE, FUZZY_MATCH_MIN_SIMILARITY,
    FUZZY_CANDIDATE_POOL_SIZE, FUZZY_CANDIDATE_MIN_TRIGRAM_SIMILARITY,
    confusion_aware_similarity,
)
from app.core.deps import require_ai_worker_key, get_current_user, CurrentUser

router = APIRouter(prefix="/detections", tags=["detections"])

# Two detections of the same plate at the same camera within this window
# collapse into a single logical event (temporal de-duplication, Section 8).
DEDUP_WINDOW_SECONDS = 30


class ANPRDetectionIn(BaseModel):
    camera_id: uuid.UUID
    raw_plate_text: str
    ocr_confidence: float
    detection_confidence: float | None = None
    vehicle_type: str | None = None
    vehicle_color: str | None = None
    bounding_box: dict | None = None
    evidence_uri: str | None = None
    video_timestamp_ref: str | None = None
    detected_at: datetime


class ANPRDetectionResult(BaseModel):
    detection_id: uuid.UUID
    normalized_plate: str
    deduplicated: bool
    watchlist_match: bool
    match_type: str | None = None  # "exact" | "fuzzy" | None
    alert_id: uuid.UUID | None = None


@router.post("/anpr", response_model=ANPRDetectionResult, status_code=201, dependencies=[Depends(require_ai_worker_key)])
async def ingest_anpr_detection(payload: ANPRDetectionIn, db: AsyncSession = Depends(get_db)):
    """
    Entry point called by the AI Analytics Pipeline for every ANPR read.
    Implements: normalize -> dedup -> confidence gate -> watchlist search ->
    match scoring -> alert generation -> vehicle history update.
    """
    camera = await db.get(Camera, payload.camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    normalized = normalize_plate(payload.raw_plate_text)

    # --- temporal de-duplication ---
    window_start = payload.detected_at - timedelta(seconds=DEDUP_WINDOW_SECONDS)
    recent = await db.execute(
        select(Detection).where(
            Detection.camera_id == payload.camera_id,
            Detection.normalized_value == normalized,
            Detection.detected_at >= window_start,
            Detection.detected_at <= payload.detected_at,
        )
    )
    is_duplicate = recent.scalar_one_or_none() is not None

    detection = Detection(
        camera_id=payload.camera_id,
        detection_type="anpr",
        raw_value=payload.raw_plate_text,
        normalized_value=normalized,
        detection_confidence=payload.detection_confidence,
        ocr_confidence=payload.ocr_confidence,
        vehicle_type=payload.vehicle_type,
        vehicle_color=payload.vehicle_color,
        bounding_box=payload.bounding_box,
        evidence_uri=payload.evidence_uri,
        video_timestamp_ref=payload.video_timestamp_ref,
        detected_at=payload.detected_at,
    )
    db.add(detection)
    await db.flush()

    if is_duplicate:
        # Still recorded for the audit trail, but not re-matched/re-alerted.
        await db.commit()
        return ANPRDetectionResult(
            detection_id=detection.id, normalized_plate=normalized,
            deduplicated=True, watchlist_match=False,
        )

    # --- update / create canonical vehicle + history ---
    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.registration_number == normalized))
    vehicle = vehicle_result.scalar_one_or_none()
    if not vehicle:
        vehicle = Vehicle(
            registration_number=normalized,
            vehicle_type=payload.vehicle_type,
            color=payload.vehicle_color,
            first_seen_at=payload.detected_at,
            last_seen_at=payload.detected_at,
        )
        db.add(vehicle)
        await db.flush()
    else:
        if not vehicle.first_seen_at or payload.detected_at < vehicle.first_seen_at:
            vehicle.first_seen_at = payload.detected_at
        if not vehicle.last_seen_at or payload.detected_at > vehicle.last_seen_at:
            vehicle.last_seen_at = payload.detected_at

    db.add(VehicleDetection(vehicle_id=vehicle.id, detection_id=detection.id, match_confidence=1.0))

    # --- confidence gate + watchlist search + match scoring ---
    alert_id = None
    watchlist_match = False
    match_type = None
    if should_attempt_match(payload.ocr_confidence):
        wl_result = await db.execute(
            select(WatchlistEntry).where(
                WatchlistEntry.registration_number == normalized,
                WatchlistEntry.status == "active",
            )
        )
        entry = wl_result.scalar_one_or_none()
        match_confidence = EXACT_MATCH_CONFIDENCE
        match_type = "exact" if entry else None

        # Exact match failed — fall back to a fuzzy/near-match search.
        # Two stages: pg_trgm trigram similarity (index-backed, cheap even
        # at large watchlist scale) casts a deliberately loose net to pull
        # a small candidate pool, then confusion_aware_similarity — which
        # is NOT index-backed but is far more precise — makes the actual
        # accept/reject decision on that small pool. Trigram similarity
        # alone is not used as the final gate: it can't distinguish a
        # single OCR-confusable character error from a single
        # non-confusable character difference (i.e. a different real
        # vehicle with a similar plate), which confusion_aware_similarity
        # is specifically designed to do. See core/matching.py for the
        # full reasoning and the false-positive risk this avoids.
        if not entry and should_attempt_fuzzy_match(payload.ocr_confidence, normalized):
            trigram_expr = func.similarity(WatchlistEntry.registration_number, normalized)
            candidate_result = await db.execute(
                select(WatchlistEntry)
                .where(
                    WatchlistEntry.status == "active",
                    WatchlistEntry.registration_number.isnot(None),
                    trigram_expr >= FUZZY_CANDIDATE_MIN_TRIGRAM_SIMILARITY,
                )
                .order_by(trigram_expr.desc())
                .limit(FUZZY_CANDIDATE_POOL_SIZE)
            )
            candidates = candidate_result.scalars().all()

            best_entry, best_similarity = None, 0.0
            for candidate in candidates:
                sim = confusion_aware_similarity(normalized, candidate.registration_number)
                if sim > best_similarity:
                    best_entry, best_similarity = candidate, sim

            if best_entry and best_similarity >= FUZZY_MATCH_MIN_SIMILARITY:
                entry = best_entry
                match_confidence = best_similarity
                match_type = "fuzzy"

        if entry:
            watchlist_match = True
            severity = severity_for(entry.priority, match_confidence)

            alert = Alert(
                event_type="watchlist_match",
                camera_id=payload.camera_id,
                detection_id=detection.id,
                entity_type="vehicle",
                entity_id=vehicle.id,
                detected_value=normalized,
                watchlist_entry_id=entry.id,
                match_confidence=match_confidence,
                severity=severity,
                location_id=camera.location_id,
                evidence_uri=payload.evidence_uri,
                status="new",
            )
            db.add(alert)
            await db.flush()
            alert_id = alert.id

    await db.commit()

    return ANPRDetectionResult(
        detection_id=detection.id,
        normalized_plate=normalized,
        deduplicated=False,
        watchlist_match=watchlist_match,
        match_type=match_type,
        alert_id=alert_id,
    )


@router.get("", dependencies=[Depends(get_current_user)])
async def list_detections(
    limit: int = Query(50, ge=1, le=200),
    camera_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Recent ANPR events for the detections tab — searchable history."""
    query = (
        select(
            Detection.id, Detection.raw_value, Detection.normalized_value,
            Detection.ocr_confidence, Detection.detection_confidence,
            Detection.vehicle_type, Detection.detected_at, Detection.video_timestamp_ref,
            Camera.camera_code, Camera.name.label("camera_name"),
        )
        .join(Camera, Detection.camera_id == Camera.id)
        .order_by(Detection.detected_at.desc())
        .limit(limit)
    )
    if camera_id:
        query = query.where(Detection.camera_id == camera_id)
    rows = (await db.execute(query)).all()
    return [
        {
            "id": str(r.id),
            "raw_value": r.raw_value,
            "normalized_value": r.normalized_value,
            "ocr_confidence": float(r.ocr_confidence) if r.ocr_confidence is not None else None,
            "detection_confidence": float(r.detection_confidence) if r.detection_confidence is not None else None,
            "vehicle_type": r.vehicle_type,
            "detected_at": r.detected_at.isoformat() if r.detected_at else None,
            "video_timestamp_ref": r.video_timestamp_ref,
            "camera_code": r.camera_code,
            "camera_name": r.camera_name,
        }
        for r in rows
    ]
