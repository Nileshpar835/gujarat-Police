from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import cameras, departments, watchlist, detections, vehicles, alerts, auth, audit

logger = logging.getLogger("backend-main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.database import AsyncSessionLocal
        from app.routers.cameras import sync_catalogue_internal
        async with AsyncSessionLocal() as db:
            result = await sync_catalogue_internal(db)
            logger.info("Startup catalogue sync completed: %s", result)
    except Exception as exc:
        logger.warning("Startup catalogue sync skipped/failed: %s", exc)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "Registry & GIS foundation (Model 1) + Federation/analytics services "
        "for the Gujarat CCTV Hackathon 2026 platform."
    ),
    lifespan=lifespan,
)

# NOTE: for the hackathon demo this is permissive; restrict to the dashboard's
# actual origin before any real deployment (see HLD Section 13 - Security).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(departments.router, prefix=settings.api_prefix)
app.include_router(cameras.router, prefix=settings.api_prefix)
app.include_router(watchlist.router, prefix=settings.api_prefix)
app.include_router(detections.router, prefix=settings.api_prefix)
app.include_router(vehicles.router, prefix=settings.api_prefix)
app.include_router(alerts.router, prefix=settings.api_prefix)
app.include_router(audit.router, prefix=settings.api_prefix)


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name}


@app.get(f"{settings.api_prefix}/health")
async def api_health():
    return {"status": "ok", "service": settings.app_name}

