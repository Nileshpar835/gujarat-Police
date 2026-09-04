import uuid

import jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.core.security import decode_access_token
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


class CurrentUser:
    """Lightweight principal built from the JWT — avoids a DB round-trip on every request."""

    def __init__(self, id: uuid.UUID, role: str, department_id: uuid.UUID | None):
        self.id = id
        self.role = role
        self.department_id = department_id


async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> CurrentUser:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired", headers={"WWW-Authenticate": "Bearer"})
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token", headers={"WWW-Authenticate": "Bearer"})

    return CurrentUser(
        id=uuid.UUID(payload["sub"]),
        role=payload["role"],
        department_id=uuid.UUID(payload["department_id"]) if payload.get("department_id") else None,
    )


def require_role(*allowed_roles: str):
    """
    Dependency factory: require_role("admin", "operator") only allows those
    roles through. Matches the RBAC model in HLD Section 13 (department-
    scoped roles: viewer, operator, admin, auditor).
    """

    async def checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{current_user.role}' is not permitted to perform this action "
                        f"(requires one of: {', '.join(allowed_roles)})",
            )
        return current_user

    return checker


async def require_ai_worker_key(api_key: str | None = Security(api_key_header)):
    """
    Service-to-service auth for the AI worker's detection-submission endpoint.
    The worker is not a human user with a role, so it authenticates via a
    shared secret (X-API-Key) rather than a JWT login — this is the
    "service-to-service authentication" requirement from HLD Section 13.
    """
    if not api_key or api_key != settings.ai_worker_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing AI worker API key")


async def get_current_user_or_service(
    token: str | None = Depends(oauth2_scheme),
    api_key: str | None = Security(api_key_header),
) -> CurrentUser:
    """
    For endpoints needed by both dashboard users (JWT) and the AI worker
    (API key) — e.g. listing active cameras. Tries the API key first since
    it's cheaper to check, falls back to JWT.
    """
    if api_key and api_key == settings.ai_worker_api_key:
        return CurrentUser(id=uuid.UUID(int=0), role="service", department_id=None)
    return await get_current_user(token)


# Roles that see across all departments regardless of their own JWT's
# department_id claim. Everyone else is department-scoped IF their JWT
# carries a department_id — state-level operator/viewer accounts (no
# department_id set) remain unrestricted too, matching "department_id
# UUID REFERENCES departments(id) -- NULL = state-level access" in schema.sql.
UNRESTRICTED_ROLES = {"admin", "auditor", "service"}


def resolve_department_scope(current_user: CurrentUser, requested_department_id: uuid.UUID | None) -> uuid.UUID | None:
    """
    Returns the department_id that should actually constrain a query, given
    who's asking. A department-scoped operator/viewer cannot escape their
    own department by passing a different department_id filter — their own
    department_id always wins over whatever was requested.
    """
    if current_user.role in UNRESTRICTED_ROLES or current_user.department_id is None:
        return requested_department_id
    return current_user.department_id
