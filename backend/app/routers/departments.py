import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Department
from app.schemas import DepartmentCreate, DepartmentOut
from app.core.deps import require_role, get_current_user, CurrentUser

router = APIRouter(prefix="/departments", tags=["departments"])


@router.post("", response_model=DepartmentOut, status_code=201)
async def create_department(
    payload: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
):
    existing = await db.execute(select(Department).where(Department.code == payload.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Department code '{payload.code}' already exists")
    dept = Department(**payload.model_dump())
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


@router.get("", response_model=list[DepartmentOut])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(select(Department))
    return result.scalars().all()


@router.get("/{department_id}", response_model=DepartmentOut)
async def get_department(
    department_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    dept = await db.get(Department, department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept
