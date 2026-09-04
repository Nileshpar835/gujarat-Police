from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.functions import ST_X, ST_Y
from geoalchemy2 import Geometry
from sqlalchemy import select, cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Vehicle, VehicleDetection, Detection, Camera, Location
from app.core.matching import normalize_plate
from app.core.deps import get_current_user, CurrentUser

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("/{registration_number}/route")
async def get_vehicle_route(
    registration_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Reconstructs the full timestamped, location-wise movement history for a
    vehicle — this is the primary endpoint for the hackathon test case
    ('track a designated vehicle across cameras with timestamped/
    location-based movement history').
    """
    normalized = normalize_plate(registration_number)
    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.registration_number == normalized))
    vehicle = vehicle_result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"No detections found for plate '{normalized}'")

    query = (
        select(
            Detection.id, Detection.detected_at, Detection.detection_confidence,
            Detection.ocr_confidence, Detection.evidence_uri, Detection.vehicle_type,
            Detection.vehicle_color, Camera.id.label("camera_id"), Camera.camera_code,
            Camera.name.label("camera_name"), Location.name.label("location_name"),
            Location.district, ST_Y(cast(Location.geom, Geometry)).label("latitude"),
            ST_X(cast(Location.geom, Geometry)).label("longitude"),
        )
        .select_from(VehicleDetection)
        .join(Detection, VehicleDetection.detection_id == Detection.id)
        .join(Camera, Detection.camera_id == Camera.id)
        .join(Location, Camera.location_id == Location.id)
        .where(VehicleDetection.vehicle_id == vehicle.id)
        .order_by(Detection.detected_at.asc())
    )
    result = await db.execute(query)
    rows = result.all()

    route = [
        {
            "detection_id": str(r.id),
            "timestamp": r.detected_at.isoformat(),
            "camera_id": str(r.camera_id),
            "camera_code": r.camera_code,
            "camera_name": r.camera_name,
            "location_name": r.location_name,
            "district": r.district,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "detection_confidence": float(r.detection_confidence) if r.detection_confidence else None,
            "ocr_confidence": float(r.ocr_confidence) if r.ocr_confidence else None,
            "evidence_uri": r.evidence_uri,
        }
        for r in rows
    ]

    return {
        "registration_number": normalized,
        "vehicle_type": vehicle.vehicle_type,
        "color": vehicle.color,
        "first_seen_at": vehicle.first_seen_at.isoformat() if vehicle.first_seen_at else None,
        "last_seen_at": vehicle.last_seen_at.isoformat() if vehicle.last_seen_at else None,
        "total_detections": len(route),
        "camera_sequence": [r["camera_code"] for r in route],
        "route": route,
    }


@router.get("/search")
async def search_vehicles(
    q: str,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Fuzzy plate search for the dashboard's vehicle search box."""
    normalized = normalize_plate(q)
    result = await db.execute(
        select(Vehicle).where(Vehicle.registration_number.ilike(f"%{normalized}%")).limit(20)
    )
    vehicles = result.scalars().all()
    return [
        {
            "registration_number": v.registration_number,
            "vehicle_type": v.vehicle_type,
            "color": v.color,
            "first_seen_at": v.first_seen_at.isoformat() if v.first_seen_at else None,
            "last_seen_at": v.last_seen_at.isoformat() if v.last_seen_at else None,
        }
        for v in vehicles
    ]
