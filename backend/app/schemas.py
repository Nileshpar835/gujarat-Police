import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


# ---------------- Department ----------------
class DepartmentCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    contact_email: Optional[str] = None


class DepartmentOut(DepartmentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime


# ---------------- Location ----------------
class LocationCreate(BaseModel):
    name: str
    district: Optional[str] = None
    address: Optional[str] = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    district: Optional[str] = None
    latitude: float
    longitude: float


# ---------------- Camera ----------------
class CameraCreate(BaseModel):
    camera_code: str
    name: str
    department_id: uuid.UUID
    vms_system_id: Optional[uuid.UUID] = None
    protocol: str = Field(..., pattern="^(rtsp|onvif|vendor_api)$")
    stream_url: Optional[str] = None
    onvif_endpoint: Optional[str] = None
    camera_type: Optional[str] = None
    resolution: Optional[str] = None
    fps: Optional[int] = None
    codec: Optional[str] = None
    is_public_domain: bool = True
    # inline location — a camera always needs a place on the map
    location: LocationCreate


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    camera_code: str
    name: str
    department_id: uuid.UUID
    protocol: str
    stream_url: Optional[str] = None
    status: str
    resolution: Optional[str] = None
    fps: Optional[int] = None
    is_public_domain: bool
    onboarded_at: datetime


class CameraUpdate(BaseModel):
    stream_url: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive|maintenance|decommissioned)$")
    codec: Optional[str] = None
    resolution: Optional[str] = None
    fps: Optional[int] = None


class CameraHealthOut(BaseModel):
    is_reachable: bool
    latency_ms: Optional[int] = None
    error_message: Optional[str] = None
    checked_at: datetime


# ---------------- Watchlist ----------------
class WatchlistEntryCreate(BaseModel):
    watchlist_id: uuid.UUID
    entity_type: str = Field(..., pattern="^(vehicle|person)$")
    registration_number: Optional[str] = None
    vehicle_type: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    person_name: Optional[str] = None
    identifying_details: Optional[str] = None
    priority: str = Field(default="medium", pattern="^(critical|high|medium|low)$")
    notes: Optional[str] = None
    expiry_date: Optional[str] = None


class WatchlistEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    watchlist_id: uuid.UUID
    entity_type: str
    registration_number: Optional[str] = None
    status: str
    priority: str
    created_date: str


# ---------------- Alert ----------------
class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_type: str
    camera_id: Optional[uuid.UUID] = None
    detection_id: Optional[uuid.UUID] = None
    entity_type: Optional[str] = None
    entity_id: Optional[uuid.UUID] = None
    detected_value: Optional[str] = None
    watchlist_entry_id: Optional[uuid.UUID] = None
    match_confidence: Optional[float] = None
    severity: str
    location_id: Optional[uuid.UUID] = None
    evidence_uri: Optional[str] = None
    status: str
    acknowledged_by: Optional[uuid.UUID] = None
    acknowledged_at: Optional[datetime] = None
    triggered_at: datetime
