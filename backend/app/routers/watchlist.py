import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Watchlist, WatchlistEntry
from app.schemas import WatchlistEntryCreate, WatchlistEntryOut
from app.core.matching import normalize_plate
from app.core.deps import require_role, get_current_user, CurrentUser
from app.core.audit import write_audit_log

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


class WatchlistCreate(BaseModel):
    name: str
    category: str
    source_system: str | None = "representative_demo"
    owner_department_id: uuid.UUID | None = None


class WatchlistOut(BaseModel):
    id: uuid.UUID
    name: str
    category: str
    source_system: str | None = None


@router.post("s", response_model=WatchlistOut, status_code=201)
async def create_watchlist(
    payload: WatchlistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator")),
):
    watchlist = Watchlist(**payload.model_dump())
    db.add(watchlist)
    await db.commit()
    await db.refresh(watchlist)
    return watchlist


@router.get("s", response_model=list[WatchlistOut])
async def list_watchlists(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(select(Watchlist))
    return result.scalars().all()


@router.post("/entries", response_model=WatchlistEntryOut, status_code=201)
async def create_watchlist_entry(
    payload: WatchlistEntryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator")),
):
    watchlist = await db.get(Watchlist, payload.watchlist_id)
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    data = payload.model_dump()
    if data.get("registration_number"):
        data["registration_number"] = normalize_plate(data["registration_number"])

    entry = WatchlistEntry(**data)
    db.add(entry)
    await db.flush()  # need entry.id before writing the audit row

    # High-value audit target: this is the action that determines who gets
    # flagged as an alert on a real camera hit, so who added/changed a
    # watchlist entry (and when) is exactly what an auditor needs to trace.
    await write_audit_log(
        db, user_id=current_user.id, action="watchlist_entry.create",
        resource_type="watchlist_entry", resource_id=entry.id,
        ip_address=request.client.host if request.client else None,
        details={
            "watchlist_id": str(entry.watchlist_id),
            "entity_type": entry.entity_type,
            "registration_number": entry.registration_number,
            "priority": entry.priority,
        },
    )
    await db.commit()
    await db.refresh(entry)
    return WatchlistEntryOut(
        id=entry.id, watchlist_id=entry.watchlist_id, entity_type=entry.entity_type,
        registration_number=entry.registration_number, status=entry.status,
        priority=entry.priority, created_date=str(entry.created_date),
    )


@router.get("/entries", response_model=list[WatchlistEntryOut])
async def search_watchlist_entries(
    registration_number: str | None = Query(None),
    status: str | None = Query("active"),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = select(WatchlistEntry)
    if registration_number:
        query = query.where(WatchlistEntry.registration_number == normalize_plate(registration_number))
    if status:
        query = query.where(WatchlistEntry.status == status)
    result = await db.execute(query)
    entries = result.scalars().all()
    return [
        WatchlistEntryOut(
            id=e.id, watchlist_id=e.watchlist_id, entity_type=e.entity_type,
            registration_number=e.registration_number, status=e.status,
            priority=e.priority, created_date=str(e.created_date),
        )
        for e in entries
    ]
