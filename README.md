# Gujarat CCTV Hackathon 2026 — Registry & Federation Backend

Implements the **Registry & GIS (Model 1) + Federation Middleware (Model 3)**
hybrid architecture from the HLD: camera onboarding, GIS-ready camera data,
adapter-based RTSP/ONVIF integration, ANPR detection ingestion, watchlist
matching, alert generation, and vehicle route reconstruction.

## What's implemented in this milestone

- **Database schema** (`database/schema.sql`) — full entity set from HLD Section 12
- **Camera Registry & GIS API** — onboard, bulk-import (CSV), list, GIS-ready endpoint, health checks
- **Adapter layer** — `CameraAdapter` interface + `RTSPAdapter` + `ONVIFAdapter`, pluggable via `adapters/registry.py`
- **ANPR ingestion & watchlist matching pipeline** — normalize → dedup → confidence-gate → match → alert → vehicle history
- **Vehicle route reconstruction API** — timestamped, location-wise movement history for a plate
- **Watchlist management API** (watchlists + entries)
- **Alerts API** — list, filter, acknowledge
- **AI Analytics Pipeline** (`ai-worker/`) — polls the backend for active cameras, runs YOLOv8 vehicle
  detection + Tesseract-based ANPR per sampled frame (5 FPS by default, not full stream rate), and
  submits detections to `POST /detections/anpr`. Verified end-to-end: vehicle detection tested against
  a real image (correctly detected a bus at 0.87 confidence), OCR tested against synthetic plates, and
  the full worker→backend→alert chain confirmed to fire a watchlist alert correctly.
- **Command Dashboard** (`dashboard/`) — React + Leaflet. Camera list with live status, GIS map with
  camera markers, real-time-ish alert panel (5s polling) with acknowledge, vehicle search that
  reconstructs and displays the full route on the map with a timestamped stop-by-stop panel, and a
  live-video modal (click any active camera) that plays its Stream Gateway HLS feed via hls.js.
  Verified in an actual browser against the live backend: onboarded cameras and real alerts render
  correctly, and tracing `GJ01AB1234` correctly displayed all 4 real sightings in chronological order
  with first/last stops color-coded on the map. No mock data anywhere — every element is wired to a
  real API call, per the hackathon's explicit "no mock-only dashboards" requirement.
- **Stream Gateway** (`stream-gateway/`) — MediaMTX relays camera RTSP into HLS/WebRTC, decoupled from
  the AI analytics path per HLD Section 10. `gateway_sync.py` polls the backend for active cameras and
  dynamically registers/removes MediaMTX paths to match — no vendor-specific code here, it only needs
  each camera's already-resolved `stream_url`. See "Known limitation" below for the current verification
  status of live video playback.

### Known limitation — plate localisation (be aware of this for the demo)

The AI worker does **not** use a dedicated license-plate detector model. It crops a heuristic region
(lower-middle ~40% of each detected vehicle's bounding box) and runs OCR on that crop. This works
reasonably for head-on/rear traffic-camera angles typical of ANPR gantries, but is noticeably less
accurate than a purpose-trained plate-detection model, especially at oblique angles or with small/distant
vehicles. In testing, clean high-contrast synthetic plates were read with occasional character drops
(e.g. `GJ05CD5678` → `GJOSCD56`). The backend's exact-match watchlist logic means a partial misread will
*not* trigger an alert — this is a real accuracy ceiling on this milestone, not a wiring bug. For the
government-feed demonstration, either fine-tune a plate-detection model (see HLD Section 17 roadmap) or
tune the OCR confidence threshold and preprocessing against your actual camera footage before the test.

- **Authentication & RBAC** — JWT-based login (`POST /auth/login`), bcrypt password hashing, and
  role-scoped access (`admin`, `operator`, `viewer`, `auditor`) enforced on every endpoint. The AI
  worker and Stream Gateway sync service authenticate via a shared `X-API-Key` instead of a user login,
  since they're services, not people. Verified end-to-end: unauthenticated requests correctly get 401,
  a `viewer`-role user can read cameras but is correctly blocked (403) from onboarding one, and the AI
  worker's detection-submission endpoint correctly rejects requests without the API key. The dashboard
  has a real login screen gating access — tested in an actual browser: login → real dashboard data →
  acknowledge an alert (now correctly attributed to the authenticated user, not a client-supplied ID).

- **Audit logging** — `GET /audit-logs` (admin/auditor roles only, read-only — no update/delete endpoint
  exists anywhere for this table). Login attempts (success *and* failure, with reason), camera
  onboarding/bulk-import, watchlist entry creation, and alert acknowledgement all write an audit row in
  the same transaction as the action itself, so there's no window where an action succeeds without a
  trail. Verified end-to-end: a failed login is correctly logged with `user_id: null` and the attempted
  username preserved in `details`; a `viewer` role is correctly blocked (403) from reading the log;
  filtering by `action=watchlist_entry.create` correctly returns only matching rows with full context
  (who, what plate, what priority, from what IP).
- Two real bugs found and fixed while building this by actually running it against Postgres, not just
  reviewing the code: the `ip_address` column is `INET` in the schema but was typed as `String` in the
  SQLAlchemy model (same class of bug as the earlier PostGIS geography/geometry mismatch — caught the
  same way, by executing it); and the Pydantic response schema didn't account for SQLAlchemy
  deserializing `INET` into Python's `IPv4Address` object rather than a plain string.

- **Department-level data scoping** — a user's JWT carries their `department_id` (or none, for
  state-level access), and `operator`/`viewer` roles are now actually confined to their own department's
  cameras/GIS/alerts — `admin`/`auditor`/the AI worker's service account remain unrestricted. Verified
  end-to-end with two real departments and a cross-department attack scenario: a department-scoped
  operator correctly sees only their own department's cameras; explicitly requesting another
  department's `department_id` in the query string is silently overridden server-side (not honoured);
  and fetching another department's camera directly by ID returns 404 — not 403, so it doesn't even
  confirm the camera exists to someone who shouldn't see it.
- **Fuzzy/near-match watchlist fallback** — closes a real gap surfaced during AI-worker testing, where a
  genuine watchlist plate misread by OCR (e.g. a dropped character) produced zero alert under exact-match-only
  logic. Uses a two-stage design: a cheap, index-backed `pg_trgm` trigram similarity search casts a
  deliberately loose net for candidates, then a custom **OCR-confusion-aware edit distance** makes the actual
  accept/reject decision — non-confusable character differences (e.g. a genuinely different vehicle whose
  plate is one digit off) are treated as effectively disqualifying, not just "costly," specifically because
  generic edit distance and generic trigram similarity **cannot reliably tell "OCR error on the right plate"
  apart from "a different real vehicle with a similar plate"** (verified directly — a non-confusable single-digit
  swap scored nearly identically to genuine OCR noise under both approaches before this fix). Fuzzy matches
  always downgrade alert severity one level from the watchlist entry's stated priority. Verified end-to-end
  against the live backend: the real dropped-character case now correctly fires a `high`-severity alert
  (downgraded from `critical`); a genuinely different vehicle one non-confusable digit off from the
  watchlisted plate correctly produces **no** alert; a confusable-character substitution (0/O) correctly
  fires; and exact matches are unregressed.

## Not yet built (next milestones)

- Audit coverage is partial, not comprehensive — user creation is instrumented, but department creation,
  watchlist *creation* (as opposed to entries), and camera health-checks are not yet
- Vehicle/detection endpoints (`/vehicles/*`, `/detections/*`) are not department-scoped — a plate
  detected on one department's camera is visible to any authenticated user, which may be intentional
  (state-level vehicle tracking is the actual test-case requirement) but is worth a deliberate decision
  rather than an oversight before a real deployment

### Known sandbox limitation (not a code issue)

The dashboard's map tiles (CARTO dark basemap, loaded from `basemaps.cartocdn.com`) did not render
during development here because this sandboxed environment's network policy blocks that CDN — confirmed
via browser console (403 responses), not a bug in the app. Camera/alert/route markers render correctly
as vector layers regardless. This will render normally on any machine with standard internet access.

### Stream Gateway — verified vs. not yet verified (read this before demoing)

What was actually proven end-to-end in this environment, using a real synthetic video source (ffmpeg
test pattern) pushed through RTSP into MediaMTX:

- RTSP ingest → HLS packaging works (downloaded and confirmed a real, valid ISO-MP4 segment)
- `gateway_sync.py` correctly discovers active cameras from the live backend and registers/updates real
  MediaMTX paths from their `stream_url` — not hardcoded, tested against the real API
- Two real bugs were found and fixed in `dashboard/vite.config.js`'s dev proxy for `/hls`:
  1. MediaMTX sets a `Secure` session cookie, which browsers refuse to store over plain HTTP — stripped
     via a `proxyRes` hook. In a real deployment behind TLS (see HLD Section 13) this wouldn't come up
     at all, since the cookie would be legitimately over HTTPS.
  2. MediaMTX's redirect `Location` header doesn't account for the `/hls` proxy mount prefix — rewritten
     so the browser's follow-up request stays inside the proxy.
- With both fixes and a browser-compatible H.264 profile (baseline, `yuv420p` — matches what real IP
  cameras normally output), `hls.js` successfully parsed the manifest and began the playback handshake.

**What was not verified: actual pixels rendering on screen.** The automated browser testing available in
this environment (Playwright's bundled headless Chromium) is an open-source build with no licensed H.264
decoder — confirmed directly via `MediaSource.isTypeSupported()` returning `false` for a standard
baseline H.264 codec string, which is a property of that specific browser binary, not of this
application. Real end-user browsers (Chrome, Firefox, Edge, Safari) all ship licensed H.264 support.
**Before relying on this for the actual demo, open the dashboard in a real browser, click an active
camera, and confirm you actually see video** — this is the one link in the chain I could not personally
verify from here.

## Running locally

```bash
cd gujarat-cctv
cp .env.example .env              # set JWT_SECRET_KEY and AI_WORKER_API_KEY to real random values
cp backend/.env.example backend/.env
docker compose up --build
```

- API: http://localhost:8000
- Interactive API docs: http://localhost:8000/docs
- Postgres/PostGIS: localhost:5432 (cctv_user / cctv_pass)

The schema is auto-applied on first container start via
`docker-entrypoint-initdb.d`. To re-apply after schema changes, drop the
`pgdata` volume: `docker compose down -v`.

### First-time setup: create an admin user

User creation is admin-only (`POST /auth/users`), which means there's a bootstrapping problem for the
very first user. Solve it by running the seed script directly against the database once:

```bash
cd backend
export DATABASE_URL="postgresql+asyncpg://cctv_user:cctv_pass@localhost:5432/cctv_platform"
python3 seed_admin.py --username admin --email admin@example.gov.in --password <choose a real password>
```

## Demo walkthrough (matches the HLD Section 18 test-case mapping)

This has been run end-to-end against a real PostgreSQL/PostGIS instance, including the full auth flow —
login → department → camera onboarding → watchlist → ANPR detection → alert → route reconstruction, with
role-based access confirmed (a `viewer` can read but not onboard cameras; the AI worker's endpoint
requires its API key, not a user login).

```bash
# 0. Log in and capture the token (every other call below needs this in an Authorization header)
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=<your password>" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 1. Create a department
curl -X POST localhost:8000/api/v1/departments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Home Department","code":"HOME"}'

# 2. Onboard a camera (use the department id returned above)
curl -X POST localhost:8000/api/v1/cameras \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "camera_code":"AMD-TRF-001","name":"Ashram Road Junction",
    "department_id":"<DEPT_ID>","protocol":"rtsp",
    "stream_url":"rtsp://demo:demo@10.0.0.11:554/stream1",
    "location":{"name":"Ashram Road","district":"Ahmedabad","latitude":23.0272,"longitude":72.5714}
  }'

# 3. Create a watchlist, then add the designated test vehicle to it
curl -X POST localhost:8000/api/v1/watchlists \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Stolen Vehicles - Demo","category":"stolen_vehicle"}'

curl -X POST localhost:8000/api/v1/watchlist/entries \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"watchlist_id":"<WATCHLIST_ID>","entity_type":"vehicle","registration_number":"GJ01AB1234","priority":"critical"}'

# 4. Simulate an ANPR detection matching the watchlist. Note: this uses the
#    AI worker's API key (X-API-Key), NOT the user token above — the worker
#    is a service, not a logged-in person.
curl -X POST localhost:8000/api/v1/detections/anpr \
  -H "X-API-Key: <AI_WORKER_API_KEY from your .env>" -H "Content-Type: application/json" \
  -d '{
    "camera_id":"<CAMERA_ID>","raw_plate_text":"GJ01AB1234",
    "ocr_confidence":0.92,"detected_at":"2026-08-31T10:15:00Z"
  }'
# -> creates the detection, updates vehicle history, and (since it matches
#    the watchlist) creates an Alert — check GET /api/v1/alerts

# 5. Reconstruct the vehicle's route
curl localhost:8000/api/v1/vehicles/GJ01AB1234/route -H "Authorization: Bearer $TOKEN"
```

## Running the AI worker standalone (for testing detection/OCR without live cameras)

```bash
cd ai-worker
pip install -r requirements.txt --break-system-packages
export BACKEND_BASE_URL="http://localhost:8000/api/v1"
python3 main.py
```

It polls `GET /api/v1/cameras?status=active` every 30s and starts one thread per active camera,
each pulling frames from `stream_url` via OpenCV. Mark a camera `active` (it flips automatically once a
health check succeeds, or set it manually for testing) for the worker to pick it up.

## Running the dashboard standalone

```bash
cd dashboard
npm install
npm run dev
```

Opens at http://localhost:5173, proxying `/api` to `http://localhost:8000` (the backend) and `/hls` to
`http://localhost:8888` (the Stream Gateway). Requires the backend to be running (see above) with at
least one onboarded camera to show anything meaningful.

## Running the Stream Gateway standalone

```bash
cd stream-gateway
# Download MediaMTX (or use Docker — see docker-compose.yml)
curl -sL https://github.com/bluenviron/mediamtx/releases/download/v1.20.1/mediamtx_v1.20.1_linux_amd64.tar.gz | tar xz
./mediamtx mediamtx.yml

# In another terminal, run the sync service
pip install -r requirements.txt --break-system-packages
export BACKEND_BASE_URL="http://localhost:8000/api/v1"
export MEDIAMTX_API_URL="http://localhost:9997"
python3 gateway_sync.py
```

It polls the backend every 30s and keeps MediaMTX's registered paths (one per active camera, named by
`camera_code`) in sync — new cameras get a path automatically, cameras that go inactive get theirs
removed. The dashboard's live-video modal expects a path per camera at `http://<gateway>:8888/<camera_code>/index.m3u8`.

## Bulk camera onboarding

```bash
curl -X POST localhost:8000/api/v1/cameras/bulk-import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@database/sample_camera_import.csv"
```
(Replace `REPLACE_WITH_DEPARTMENT_UUID` in the sample CSV with a real department id first.)

## Sentinel Camera Grid integration (official test-case sandbox)

The hackathon's technical evaluation runs against the Sentinel Camera Grid sandbox
(live.sentinelgujarat.in — registration required, not something this codebase can access without your
own credentials). Its integration reference imposes specific client-side requirements; here's how this
codebase complies with each, and where you still need to verify against real sandbox access:

| Requirement | Status |
|---|---|
| Force RTSP over TCP | Done — `backend/app/adapters/rtsp_onvif.py` and `ai-worker/camera_worker.py` both force `rtsp_transport=tcp` via `OPENCV_FFMPEG_CAPTURE_OPTIONS`; `stream-gateway/mediamtx.yml` sets `rtspTransport: tcp` as the pull-side default, and `gateway_sync.py` sets it explicitly per-path too |
| Don't trust declared FPS for timing | Not applicable yet — nothing in this pipeline derives motion/speed/dwell-time from frame timing; `config.sample_fps` is our own target sampling rate, not read from the source |
| Drive timing from PTS, not arrival time | Partially — `detected_at` is wall-clock (correct for "when was this plate actually seen," which is what alerts/investigation need), but if multi-frame tracking is ever added, it must use `cap.get(cv2.CAP_PROP_POS_MSEC)`, not arrival time — flagged explicitly in `camera_worker.py`'s docstring |
| Reconnect with exponential backoff (2s→30s) | Done — `camera_worker.py` implements this for both the initial connect and mid-stream reconnects, replacing an earlier flat 5s retry |
| Decoder warnings on join aren't fatal | Already true by construction — OpenCV only signals failure via `ok=False` from `cap.read()`; FFmpeg's stderr chatter during keyframe wait was never treated as fatal |
| Handle mixed H.264/H.265, mixed resolutions | Handled generically — nothing in the AI pipeline or gateway assumes a fixed codec/resolution; per-camera `codec`/`resolution` are stored but not required to match across cameras |
| Read camera list from `/api/ingest`, never hard-code | `backend/sentinel_onboard.py` — fetches the catalogue and onboards via our real API. **The exact JSON field names are a best guess** (sandbox access requires per-participant registration this environment doesn't have) — verify against a real response and adjust `_extract_camera_fields` before relying on it |
| Sane behaviour across a scene discontinuity (loop-point cut) | Not applicable — this pipeline has no persistent per-camera state (no background models, no re-ID galleries, no track IDs) to lose across a cut; each frame's ANPR result is independent |
| Consume only — no publish, no gateway control API calls | True throughout — `sentinel_onboard.py` only reads `/api/ingest` and calls our own backend; nothing in this codebase calls a gateway control API that isn't our own MediaMTX instance |
| Pace load — only open cameras being processed | True by construction — `CameraWorker` threads exist only for cameras the registry marks active, and `stop()` releases the capture |

**Before the real government-feed demo:** run `sentinel_onboard.py` against your actual registered
sandbox host, inspect one real `/api/ingest` response, and confirm `_extract_camera_fields`'s field
names match — they're documented as a best-effort guess in the script's own docstring, not confirmed
against real sandbox output.

```bash
cd backend
python3 sentinel_onboard.py \
  --sentinel-host <your-registered-sandbox-host> \
  --backend-url http://localhost:8000/api/v1 \
  --admin-username admin --admin-password <your admin password> \
  --department-id <a real department UUID>
```

Tested end-to-end against a mock catalogue server standing in for the real sandbox: correctly onboards
well-formed entries, skips malformed ones without aborting the batch, and is idempotent — re-running
against an already-onboarded catalogue skips existing cameras rather than duplicating or erroring.

## Adding a new vendor/VMS adapter

1. Implement `CameraAdapter` (see `app/adapters/base.py`) in a new file under `app/adapters/`.
2. Register it in `app/adapters/registry.py`.
3. Set `cameras.protocol` / `vms_systems.adapter_type` to the new key.

No other service needs to change — this is the interoperability guarantee described in HLD Section 6.
