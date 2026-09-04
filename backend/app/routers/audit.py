import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AuditLog
from app.core.deps import require_role, CurrentUser

router = APIRouter(prefix="/audit-logs", tags=["audit"])


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[uuid.UUID] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime

    @field_validator("ip_address", mode="before")
    @classmethod
    def _stringify_ip(cls, v):
        # SQLAlchemy's INET column deserializes to ipaddress.IPv4Address/
        # IPv6Address, not a plain str — coerce here rather than weakening
        # the DB column's type safety.
        return str(v) if v is not None else v


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by exact action, e.g. 'auth.login_failed'"),
    user_id: Optional[uuid.UUID] = None,
    resource_type: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "auditor")),
):
    """
    Read-only audit trail — admin and auditor roles only (per HLD Section
    13's department-scoped role model: 'auditor' exists specifically for
    this). Not exposed to operator/viewer, and there is deliberately no
    delete/update endpoint for this table anywhere in the API.
    """
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if action:
        query = query.where(AuditLog.action == action)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    result = await db.execute(query)
    return result.scalars().all()
