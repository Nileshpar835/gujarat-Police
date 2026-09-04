"""
Audit logging helper (HLD Section 13 — "audit logging" is an explicit
security requirement). Call write_audit_log() from any endpoint that
performs a sensitive action: authentication, camera onboarding, watchlist
changes, alert acknowledgement, user management.

Deliberately fire-and-forget within the same DB session/transaction as the
action itself — if the action's commit succeeds, the audit row commits
with it, so there's no window where an action succeeds but leaves no trail.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def write_audit_log(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ip_address: str | None = None,
    details: dict | None = None,
):
    """
    Adds an AuditLog row to the current session WITHOUT committing —
    caller's existing db.commit() (for the action itself) persists this
    too. This keeps the audit entry atomic with the action it records.
    """
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip_address=ip_address,
            details=details,
        )
    )
