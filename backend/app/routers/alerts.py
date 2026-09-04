import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Alert, Camera
from app.schemas import AlertOut
from app.core.deps import require_role, get_current_user, CurrentUser, resolve_department_scope, UNRESTRICTED_ROLES
from app.core.audit import write_audit_log

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = select(Alert).order_by(Alert.triggered_at.desc()).limit(limit)
    if status:
        query = query.where(Alert.status == status)
    if severity:
        query = query.where(Alert.severity == severity)

    # An alert's own row has no department_id directly — it's derived from
    # the camera that generated it, so scoping requires a join rather than
    # a plain column filter.
    effective_department_id = resolve_department_scope(current_user, None)
    if effective_department_id:
        query = query.join(Camera, Alert.camera_id == Camera.id).where(
            Camera.department_id == effective_department_id
        )

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator")),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if current_user.role not in UNRESTRICTED_ROLES and current_user.department_id and alert.camera_id:
        camera = await db.get(Camera, alert.camera_id)
        if camera and camera.department_id != current_user.department_id:
            raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "acknowledged"
    # Taken from the authenticated principal, not a client-supplied param —
    # the old version accepted user_id as a query arg, which meant anyone
    # could attribute an acknowledgement to any user.
    alert.acknowledged_by = current_user.id
    from datetime import datetime, timezone
    alert.acknowledged_at = datetime.now(timezone.utc)

    await write_audit_log(
        db, user_id=current_user.id, action="alert.acknowledge",
        resource_type="alert", resource_id=alert.id,
        ip_address=request.client.host if request.client else None,
        details={"detected_value": alert.detected_value, "severity": alert.severity},
    )
    await db.commit()
    await db.refresh(alert)
    return alert
