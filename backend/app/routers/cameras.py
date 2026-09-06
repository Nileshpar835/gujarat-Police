import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Response
from geoalchemy2.functions import ST_X, ST_Y, ST_SetSRID, ST_MakePoint
from sqlalchemy import cast
from geoalchemy2 import Geometry
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import quote
import httpx

from app.database import get_db
from app.models import Camera, Location, CameraHealth
from app.models import Camera, Location, CameraHealth, Department
from app.schemas import CameraCreate, CameraOut, CameraHealthOut, CameraUpdate
from app.adapters.registry import get_adapter
from app.core.deps import require_role, get_current_user, get_current_user_or_service, CurrentUser, resolve_department_scope, UNRESTRICTED_ROLES
from app.core.audit import write_audit_log
from app.core.config import settings

router = APIRouter(prefix="/cameras", tags=["cameras"])


@router.post("", response_model=CameraOut, status_code=201)
async def onboard_camera(
    payload: CameraCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator")),
):
    """Onboard a single camera: creates its location + registry entry (Model 1)."""
    existing = await db.execute(select(Camera).where(Camera.camera_code == payload.camera_code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"camera_code '{payload.camera_code}' already exists")

    location = Location(
        name=payload.location.name,
        district=payload.location.district,
        address=payload.location.address,
        geom=ST_SetSRID(ST_MakePoint(payload.location.longitude, payload.location.latitude), 4326),
    )
    db.add(location)
    await db.flush()  # get location.id before creating the camera

    camera = Camera(
        camera_code=payload.camera_code,
        name=payload.name,
        department_id=payload.department_id,
        vms_system_id=payload.vms_system_id,
        location_id=location.id,
        camera_type=payload.camera_type,
        protocol=payload.protocol,
        stream_url=payload.stream_url,
        onvif_endpoint=payload.onvif_endpoint,
        resolution=payload.resolution,
        fps=payload.fps,
        codec=payload.codec,
        is_public_domain=payload.is_public_domain,
        status="inactive",  # flips to 'active' once first health check succeeds
    )
    db.add(camera)
    await db.flush()  # need camera.id before writing the audit row

    await write_audit_log(
        db, user_id=current_user.id, action="camera.onboard",
        resource_type="camera", resource_id=camera.id,
        ip_address=request.client.host if request.client else None,
        details={"camera_code": camera.camera_code, "protocol": camera.protocol},
    )
    await db.commit()
    await db.refresh(camera)
    return camera


@router.post("/bulk-import", status_code=201)
async def bulk_import_cameras(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator")),
):
    """
    Bulk onboarding via CSV, per Model 1's required 'bulk import' feature.
    Expected columns: camera_code,name,department_id,protocol,stream_url,
                       latitude,longitude,location_name,district
    """
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8")))

    created, skipped, errors = [], [], []
    for i, row in enumerate(reader, start=2):  # row 1 is header
        try:
            existing = await db.execute(select(Camera).where(Camera.camera_code == row["camera_code"]))
            if existing.scalar_one_or_none():
                skipped.append(row["camera_code"])
                continue

            location = Location(
                name=row.get("location_name") or row["camera_code"],
                district=row.get("district"),
                geom=ST_SetSRID(ST_MakePoint(float(row["longitude"]), float(row["latitude"])), 4326),
            )
            db.add(location)
            await db.flush()

            camera = Camera(
                camera_code=row["camera_code"],
                name=row["name"],
                department_id=uuid.UUID(row["department_id"]),
                location_id=location.id,
                protocol=row["protocol"],
                stream_url=row.get("stream_url"),
                status="inactive",
            )
            db.add(camera)
            created.append(row["camera_code"])
        except Exception as exc:  # noqa: BLE001 - collect per-row errors, don't abort the whole batch
            errors.append({"row": i, "camera_code": row.get("camera_code"), "error": str(exc)})

    await write_audit_log(
        db, user_id=current_user.id, action="camera.bulk_import",
        resource_type="camera", resource_id=None,
        ip_address=request.client.host if request.client else None,
        details={"created_count": len(created), "skipped_count": len(skipped), "error_count": len(errors)},
    )
    await db.commit()
    return {"created": created, "skipped_existing": skipped, "errors": errors}


@router.get("", response_model=list[CameraOut])
async def list_cameras(
    department_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user_or_service),
):
    query = select(Camera)
    effective_department_id = resolve_department_scope(current_user, department_id)
    if effective_department_id:
        query = query.where(Camera.department_id == effective_department_id)
    if status:
        query = query.where(Camera.status == status)
    result = await db.execute(query)
    cameras = result.scalars().all()
    # Do not send RTSP credentials to the browser. The AI worker and
    # stream-gateway sync use X-API-Key (role=service) and still receive URLs.
    if current_user.role != "service":
        for cam in cameras:
            cam.stream_url = None
    return cameras


@router.get("/gis", summary="Cameras with lat/long for GIS map rendering")
async def list_cameras_for_gis(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = (
        select(
            Camera.id, Camera.camera_code, Camera.name, Camera.status,
            Camera.department_id, ST_Y(cast(Location.geom, Geometry)).label("latitude"),
            ST_X(cast(Location.geom, Geometry)).label("longitude"), Location.district,
        )
        .join(Location, Camera.location_id == Location.id)
    )
    effective_department_id = resolve_department_scope(current_user, None)
    if effective_department_id:
        query = query.where(Camera.department_id == effective_department_id)
    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "id": str(r.id), "camera_code": r.camera_code, "name": r.name,
            "status": r.status, "department_id": str(r.department_id),
            "latitude": r.latitude, "longitude": r.longitude, "district": r.district,
        }
        for r in rows
    ]


@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(
    camera_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    if current_user.role not in UNRESTRICTED_ROLES and current_user.department_id:
        if camera.department_id != current_user.department_id:
            # 404, not 403 — don't reveal that a camera with this ID exists
            # in a department the caller can't see.
            raise HTTPException(status_code=404, detail="Camera not found")
    if current_user.role != "service":
        camera.stream_url = None
    return camera


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(
    camera_id: uuid.UUID,
    payload: CameraUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator")),
):
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(camera, key, value)
    await db.commit()
    await db.refresh(camera)
    if current_user.role != "service":
        camera.stream_url = None
    return camera


@router.post("/activate-all")
async def activate_all_cameras(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator")),
):
    """
    Marks every registered camera active without an RTSP probe.

    Assumption (not specified by the problem statement): the Sentinel
    catalogue live flag / successful onboarding is sufficient for the
    hackathon PoC so we do not sequentially probe ~50 RTSP endpoints
    (that can take minutes and still flap). The AI worker and MediaMTX
    reconnect independently if a feed is actually down.
    """
    result = await db.execute(select(Camera))
    cameras = result.scalars().all()
    for cam in cameras:
        cam.status = "active"
    await db.commit()
    return {"activated": len(cameras)}


@router.post("/{camera_id}/health-check", response_model=CameraHealthOut)
async def run_health_check(
    camera_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator")),
):
    """
    Runs a live reachability check through the camera's adapter and persists
    the result. In production this endpoint is also called on a schedule by
    a background health-monitor worker, not only on demand.
    """
    camera = await db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    connection_config = {"rtsp_url": camera.stream_url} if camera.protocol == "rtsp" else {}
    try:
        adapter = get_adapter(camera.protocol, str(camera.id), connection_config)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = await adapter.get_health()

    health_record = CameraHealth(
        camera_id=camera.id,
        is_reachable=result.is_reachable,
        latency_ms=result.latency_ms,
        error_message=result.error_message,
    )
    db.add(health_record)

    camera.status = "active" if result.is_reachable else "maintenance"
    await db.commit()

    return CameraHealthOut(
        is_reachable=result.is_reachable,
        latency_ms=result.latency_ms,
        error_message=result.error_message,
        checked_at=health_record.checked_at or datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Sentinel Dynamic Catalogue & WHEP Signaling Proxy
# ---------------------------------------------------------------------------

_KNOWN_COORDS = {
    "cam01": (23.0395, 72.5569), "cam02": (23.0225, 72.5714), "cam03": (23.0262, 72.5762),
    "cam04": (23.1083, 72.5826), "cam05": (23.0314, 72.5631), "cam06": (23.0359, 72.5560),
    "cam07": (23.0421, 72.5564), "cam08": (23.0074, 72.5739), "cam09": (22.9953, 72.6019),
    "cam10": (22.9614, 72.6356), "cam11": (22.9908, 72.4997), "cam12": (23.0498, 72.5076),
    "cam13": (23.0289, 72.5053), "cam14": (23.0348, 72.4689), "cam15": (23.1058, 72.5934),
    "cam16": (23.2156, 72.6369), "cam17": (23.2220, 72.6540), "cam18": (21.2010, 72.8450),
    "cam19": (21.2247, 72.7945), "cam20": (21.1784, 72.8578), "cam21": (22.3189, 73.1765),
    "cam22": (22.3097, 73.1794), "cam23": (22.3162, 73.1630), "cam24": (22.2920, 70.7796),
    "cam25": (22.2965, 70.7889), "cam26": (21.7645, 72.1519), "cam27": (22.4673, 70.0577),
    "cam28": (22.5645, 72.9289), "cam29": (22.6933, 72.8640), "cam30": (23.5879, 72.3693),
}


def _lookup_coords(cam_id: str) -> tuple[float, float]:
    key = cam_id.replace("SENTINEL-", "").lower()
    return _KNOWN_COORDS.get(key, (23.0225, 72.5714))


def _guess_district(name: str) -> str:
    n = (name or "").lower()
    if any(x in n for x in ["ahmedabad", "paldi", "maninagar", "vatva", "navrangpura", "sg highway",
                              "cg road", "ashram", "relief", "prahladnagar", "bopal", "janpath",
                              "chiman", "sarkhej", "chandkheda", "sardar patel"]):
        return "Ahmedabad"
    if any(x in n for x in ["gandhinagar", "sector"]):
        return "Gandhinagar"
    if any(x in n for x in ["surat", "adajan", "udhna"]):
        return "Surat"
    if any(x in n for x in ["vadodara", "baroda", "alkapuri", "akota", "rc dutt"]):
        return "Vadodara"
    if any(x in n for x in ["rajkot", "kalawad", "ring road"]):
        return "Rajkot"
    if any(x in n for x in ["bhavnagar"]):
        return "Bhavnagar"
    if any(x in n for x in ["jamnagar"]):
        return "Jamnagar"
    if any(x in n for x in ["anand"]):
        return "Anand"
    if any(x in n for x in ["nadiad"]):
        return "Kheda"
    if any(x in n for x in ["mehsana"]):
        return "Mehsana"
    return "Gujarat"


async def fetch_sentinel_catalogue_remote() -> list[dict]:
    cdn = settings.sentinel_cdn.rstrip("/")
    user = settings.sentinel_username
    pwd = settings.sentinel_password
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

    async with httpx.AsyncClient(headers=headers, timeout=15.0, follow_redirects=True) as client:
        if user and pwd:
            try:
                await client.post(f"{cdn}/auth/login", data={"email": user, "password": pwd})
            except Exception:
                pass

        urls = [
            f"{cdn}/cameras.json",
            "https://cctv.corp8.cloud/cameras.json",
            f"http://{settings.sentinel_host}/api/ingest",
        ]
        data = None
        for url in urls:
            try:
                r = await client.get(url)
                if r.status_code == 200:
                    data = r.json()
                    break
            except Exception:
                continue

        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for k in ("cameras", "items", "data", "results", "streams"):
                if isinstance(data.get(k), list):
                    return data[k]
        return []


async def sync_catalogue_internal(db: AsyncSession) -> dict:
    dept_res = await db.execute(select(Department))
    dept = dept_res.scalars().first()
    if not dept:
        dept = Department(
            name="Gujarat Police",
            code="GUJ_POL",
            description="Gujarat Police Home Department — CCTV Command Centre",
            contact_email="cctv@gujaratpolice.gov.in",
        )
        db.add(dept)
        await db.flush()

    dept_id = dept.id
    raw_cameras = await fetch_sentinel_catalogue_remote()
    if not raw_cameras:
        return {"synced": 0, "message": "No cameras returned by upstream catalogue"}

    cams_res = await db.execute(select(Camera))
    existing_cams = {c.camera_code: c for c in cams_res.scalars().all()}

    user = settings.sentinel_username
    pwd = settings.sentinel_password

    synced_count = 0
    for entry in raw_cameras:
        cam_id = str(entry.get("id") or entry.get("camera_id") or entry.get("stream_id") or "")
        if not cam_id:
            continue
        code = f"SENTINEL-{cam_id}" if not cam_id.startswith("SENTINEL-") else cam_id
        short_id = cam_id.replace("SENTINEL-", "").lower()
        name = entry.get("name") or f"Sentinel Camera {short_id.upper()}"

        if user and pwd:
            rtsp_url = f"rtsp://{quote(user, safe='')}:{quote(pwd, safe='')}@{settings.sentinel_host}:8554/stream/{short_id}"
        else:
            rtsp_url = f"rtsp://{settings.sentinel_host}:8554/stream/{short_id}"

        lat, lng = _lookup_coords(short_id)
        district = _guess_district(name)

        if code in existing_cams:
            cam = existing_cams[code]
            cam.name = name
            cam.stream_url = rtsp_url
            cam.status = "active"
            synced_count += 1
        else:
            location = Location(
                name=name,
                district=district,
                geom=ST_SetSRID(ST_MakePoint(lng, lat), 4326),
            )
            db.add(location)
            await db.flush()

            new_cam = Camera(
                camera_code=code,
                name=name,
                department_id=dept_id,
                location_id=location.id,
                camera_type="fixed",
                protocol="rtsp",
                stream_url=rtsp_url,
                resolution="1920x1080",
                fps=25,
                codec="h264",
                is_public_domain=True,
                status="active",
            )
            db.add(new_cam)
            synced_count += 1

    await db.commit()
    return {"synced": synced_count, "total_catalogue": len(raw_cameras)}


@router.post("/sync-catalogue")
async def sync_catalogue_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user_or_service),
):
    """Fetches the live cameras.json catalogue and synchronizes the camera database."""
    result = await sync_catalogue_internal(db)
    return result


@router.get("/catalogue/raw")
async def get_catalogue_raw():
    """Returns the live remote catalogue directly without credentials."""
    cameras = await fetch_sentinel_catalogue_remote()
    return [
        {
            "id": c.get("id"),
            "name": c.get("name"),
            "camera_code": f"SENTINEL-{c.get('id')}",
            "streamPath": f"/stream/{c.get('id')}",
        }
        for c in cameras
        if c.get("id")
    ]


@router.options("/{camera_code}/whep")
async def whep_options(camera_code: str):
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS, GET, POST, PATCH, DELETE",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, If-Match",
            "Access-Control-Expose-Headers": "Accept-Post, Link, Location, ETag, ID",
            "Accept-Post": "application/sdp",
        },
    )


@router.post("/{camera_code}/whep")
async def whep_post(camera_code: str, request: Request):
    """
    WHEP signaling proxy: forwards browser SDP offer to upstream MediaMTX with
    server-side HTTP Basic Auth, returning the SDP answer without exposing credentials.
    """
    cam_id = camera_code.replace("SENTINEL-", "").lower()
    sdp_offer = await request.body()
    if not sdp_offer:
        raise HTTPException(status_code=400, detail="SDP offer body required")

    target_url = f"http://{settings.sentinel_host}:8889/stream/{cam_id}/whep"
    auth = (
        httpx.BasicAuth(settings.sentinel_username, settings.sentinel_password)
        if settings.sentinel_username and settings.sentinel_password
        else None
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                target_url,
                content=sdp_offer,
                headers={"Content-Type": "application/sdp"},
                auth=auth,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"WHEP signaling failed: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    out_headers = {
        "Content-Type": "application/sdp",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Location, Link, Accept-Patch, ETag, ID",
    }
    for h in ("location", "accept-patch", "etag", "id", "link"):
        if h in resp.headers:
            val = resp.headers[h]
            if h == "location":
                session_id = val.rstrip("/").split("/")[-1]
                val = f"/api/v1/cameras/{camera_code}/whep/{session_id}"
            out_headers[h.capitalize()] = val

    return Response(content=resp.content, status_code=201, headers=out_headers)


@router.patch("/{camera_code}/whep/{session_id:path}")
async def whep_patch(camera_code: str, session_id: str, request: Request):
    cam_id = camera_code.replace("SENTINEL-", "").lower()
    patch_body = await request.body()
    target_url = f"http://{settings.sentinel_host}:8889/stream/{cam_id}/whep/{session_id}"
    auth = (
        httpx.BasicAuth(settings.sentinel_username, settings.sentinel_password)
        if settings.sentinel_username and settings.sentinel_password
        else None
    )
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.patch(
                target_url,
                content=patch_body,
                headers={"Content-Type": request.headers.get("content-type", "application/trickle-ice-sdpfrag")},
                auth=auth,
            )
            return Response(status_code=resp.status_code, headers={"Access-Control-Allow-Origin": "*"})
        except Exception:
            return Response(status_code=204, headers={"Access-Control-Allow-Origin": "*"})


@router.delete("/{camera_code}/whep/{session_id:path}")
async def whep_delete(camera_code: str, session_id: str):
    cam_id = camera_code.replace("SENTINEL-", "").lower()
    target_url = f"http://{settings.sentinel_host}:8889/stream/{cam_id}/whep/{session_id}"
    auth = (
        httpx.BasicAuth(settings.sentinel_username, settings.sentinel_password)
        if settings.sentinel_username and settings.sentinel_password
        else None
    )
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.delete(target_url, auth=auth)
            return Response(status_code=resp.status_code, headers={"Access-Control-Allow-Origin": "*"})
        except Exception:
            return Response(status_code=200, headers={"Access-Control-Allow-Origin": "*"})

