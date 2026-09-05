import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from geoalchemy2.functions import ST_X, ST_Y, ST_SetSRID, ST_MakePoint
from sqlalchemy import cast
from geoalchemy2 import Geometry
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Camera, Location, CameraHealth
from app.schemas import CameraCreate, CameraOut, CameraHealthOut, CameraUpdate
from app.adapters.registry import get_adapter
from app.core.deps import require_role, get_current_user, get_current_user_or_service, CurrentUser, resolve_department_scope, UNRESTRICTED_ROLES
from app.core.audit import write_audit_log

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
