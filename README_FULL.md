# Gujarat CCTV Platform — Complete Technical Documentation

> **Government of Gujarat · Home Department · Gujarat Police**
> Project codename: **Sentinel** — A unified video surveillance, ANPR detection, and watchlist alerting platform for the State of Gujarat.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Directory Structure](#3-directory-structure)
4. [System Requirements](#4-system-requirements)
5. [Prerequisites](#5-prerequisites)
6. [Installation & Setup](#6-installation--setup)
7. [Environment Variables](#7-environment-variables)
8. [Docker Compose Services](#8-docker-compose-services)
9. [Database Schema](#9-database-schema)
10. [Database Tables Reference](#10-database-tables-reference)
11. [Backend — FastAPI](#11-backend--fastapi)
12. [Backend Configuration](#12-backend-configuration)
13. [Authentication & Security](#13-authentication--security)
14. [API Endpoints Reference](#14-api-endpoints-reference)
15. [Camera Onboarding Pipeline](#15-camera-onboarding-pipeline)
16. [Camera Health Checking](#16-camera-health-checking)
17. [Streaming Architecture](#17-streaming-architecture)
18. [Stream Gateway (MediaMTX)](#18-stream-gateway-mediamtx)
19. [Gateway Sync Service](#19-gateway-sync-service)
20. [WHEP WebRTC Signaling Proxy](#20-whep-webrtc-signaling-proxy)
21. [HLS Streaming](#21-hls-streaming)
22. [Frontend Dashboard](#22-frontend-dashboard)
23. [Dashboard Vite Proxy Configuration](#23-dashboard-vite-proxy-configuration)
24. [Frontend Components](#24-frontend-components)
25. [Camera Player — Connection Strategy](#25-camera-player--connection-strategy)
26. [Camera Grid — Layout Manager](#26-camera-grid--layout-manager)
27. [Alert Management](#27-alert-management)
28. [Watchlist System](#28-watchlist-system)
29. [ANPR Detection Pipeline](#29-anpr-detection-pipeline)
30. [Plate Normalization & Matching](#30-plate-normalization--matching)
31. [Vehicle Tracking & Route Reconstruction](#31-vehicle-tracking--route-reconstruction)
32. [AI Worker](#32-ai-worker)
33. [AI Worker — Camera Worker](#33-ai-worker--camera-worker)
34. [AI Worker — Detector](#34-ai-worker--detector)
35. [AI Worker — ANPR Module](#35-ai-worker--anpr-module)
36. [AI Worker — Pipeline](#36-ai-worker--pipeline)
37. [AI Worker — Backend Client](#37-ai-worker--backend-client)
38. [Sentinel Catalogue Integration](#38-sentinel-catalogue-integration)
39. [Map & GIS](#39-map--gis)
40. [UI Design System](#40-ui-design-system)
41. [Login & Authentication Flow](#41-login--authentication-flow)
42. [Audit Logging](#42-audit-logging)
43. [Roles & Permissions (RBAC)](#43-roles--permissions-rbac)
44. [Docker Build & Deployment](#44-docker-build--deployment)
45. [Seed Scripts](#45-seed-scripts)
46. [Known Issues & Technical Debt](#46-known-issues--technical-debt)
47. [Troubleshooting](#47-troubleshooting)

---

## 1. Project Overview

Gujarat CCTV Platform is a full-stack video surveillance management system built for Gujarat Police under the Government of Gujarat Home Department. It provides:

- **Live camera monitoring** with WebRTC (WHEP) and HLS fallback for 30 cameras
- **ANPR (Automatic Number Plate Recognition)** with real-time watchlist alerting
- **Fuzzy plate matching** with confusion-aware OCR similarity scoring
- **Interactive map** with Leaflet GIS, camera locations, and vehicle route reconstruction
- **Watchlist management** for stolen/suspect vehicles with priority-based alerting
- **Audit logging** for all administrative actions
- **Role-based access control** (admin, operator, viewer, auditor, service)
- **Multi-department** support with data scoping

**Tech Stack:**

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, hls.js, Leaflet/react-leaflet, Axios |
| Backend | Python 3.11, FastAPI 0.115, SQLAlchemy 2.0 (async), GeoAlchemy2 |
| Database | PostgreSQL 15 + PostGIS 3.4 + pg_trgm |
| AI/ML | YOLOv8 (ultralytics), OpenCV, Tesseract OCR |
| Streaming | MediaMTX (RTSP/HLS/WebRTC), Sentinel CDN |
| Cache | Redis 7 (defined but unused) |
| Orchestration | Docker Compose 7 services |

**Origin:** Built for a hackathon demonstration. ~30 cameras from the Sentinel catalogue (cam01–cam30) covering Gujarat locations.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  FRONTEND (React/Vite)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │   Home   │ │  Camera  │ │   Map    │ │ Detections│ │ Watchlist│ │  Audit Log   │ │
│  │          │ │   Grid   │ │ (Leaflet)│ │  (ANPR)  │ │          │ │              │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│       │             │            │             │             │              │         │
│       └─────────────┴─────┬──────┴─────────────┴─────────────┴──────────────┘         │
│                           │  Axios (JWT Bearer)                                      │
└───────────────────────────┼──────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────────────────────────────────────────┐
         │                        VITE DEV SERVER PROXY                            │
         │   /api/* → backend:8000    /hls/* → mediamtx:8888    /sentinel-whep/*   │
         └──────────────┬──────────────────────────┬───────────────────┬────────────┘
                        │                          │                   │
┌───────────────────────┼──────────────────────────┼───────────────────┼──────────────┐
│                  BACKEND (FastAPI:8000)           │                   │              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┴──────┐ ┌─────────┴────────────┐ │
│  │   Auth   │ │ Cameras  │ │  Alerts  │ │  Detections  │ │  Watchlist/Entries    │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ └──────────┬───────────┘ │
│       │             │            │              │                    │              │
│       └─────────────┴────────────┴──────────────┴────────────────────┘              │
│                           │                                                         │
│                     PostgreSQL (5432)                                               │
└───────────────────────────┼─────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────────────────────┐
│                     PostgreSQL + PostGIS                                             │
│  13 tables: roles, users, departments, vms_systems, locations, cameras,             │
│  camera_health, vehicles, detections, vehicle_detections, watchlists,                │
│  watchlist_entries, audit_logs, alerts                                               │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                     STREAM GATEWAY (MediaMTX)                                       │
│  RTSP:8554  │  HLS:8888  │  WebRTC:8889  │  API:9997  │  UDP:8189                 │
│  Accepts RTSP from Sentinel cameras, serves HLS/WebRTC to frontend                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                     GATEWAY SYNC SERVICE                                            │
│  Polls backend /api/v1/cameras every 60s, syncs RTSP paths to MediaMTX config      │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                     AI WORKER                                                        │
│  camera_worker.py → OpenCV RTSP capture → detector.py (YOLOv8) → anpr.py (Tesseract)│
│  → pipeline.py → backend POST /api/v1/detections/anpr                              │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                     SENTINEL INFRASTRUCTURE (External)                               │
│  RTSP:8554  │  WebRTC/WHEP:8889  │  HLS CDN:8888  │  API:9997                     │
│  Sentinel cameras push RTSP streams; CDN serves HLS with cookie auth               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Data Flow:**

1. Sentinel cameras push RTSP to `103.250.160.189:8554`
2. Gateway sync discovers cameras from backend, adds paths to MediaMTX config
3. MediaMTX transmuxes RTSP → HLS (port 8888) and WebRTC (port 8889)
4. AI worker captures RTSP frames, runs YOLO detection + OCR, posts detections to backend
5. Backend normalizes plates, checks watchlists (exact + fuzzy), creates alerts on match
6. Frontend polls backend every 5s for cameras + alerts, plays streams via WHEP/HLS

---

## 3. Directory Structure

```
gujarat-cctv/
├── .env                          # Environment variables (gitignored)
├── .env.example                  # Template for environment variables
├── docker-compose.yml            # 7-service orchestration
├── README.md                     # Brief setup instructions
├── README_FULL.md                # This file
│
├── backend/                      # FastAPI REST API
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI app, CORS, routers, startup sync
│   │   ├── database.py           # Async SQLAlchemy engine + session
│   │   ├── models.py             # 13 SQLAlchemy ORM models
│   │   ├── schemas.py            # Pydantic request/response schemas
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings (all env vars)
│   │   │   ├── security.py       # bcrypt hashing, JWT create/decode
│   │   │   ├── deps.py           # Auth dependencies, RBAC, department scope
│   │   │   ├── audit.py          # Audit log writer
│   │   │   └── matching.py       # Plate normalization, fuzzy match scoring
│   │   ├── routers/
│   │   │   ├── auth.py           # POST /login, POST /users, GET /me
│   │   │   ├── cameras.py        # CRUD + health check + WHEP proxy + catalogue sync
│   │   │   ├── departments.py    # Department CRUD
│   │   │   ├── watchlist.py      # Watchlist + entry CRUD
│   │   │   ├── detections.py     # ANPR ingestion + detection listing
│   │   │   ├── vehicles.py       # Vehicle search + route reconstruction
│   │   │   ├── alerts.py         # Alert listing + acknowledge
│   │   │   └── audit.py          # Audit log viewer
│   │   └── adapters/
│   │       ├── base.py           # Abstract CameraAdapter base class
│   │       ├── registry.py       # Adapter factory by protocol
│   │       └── rtsp_onvif.py     # RTSP + ONVIF adapter implementations
│   ├── requirements.txt          # 16 Python dependencies
│   ├── Dockerfile                # python:3.11-slim + uvicorn
│   ├── init_db.py                # Schema creation script
│   ├── seed_admin.py             # Admin user seeder
│   ├── seed_watchlist_and_alert.py # Demo watchlist + alert seeder
│   ├── sentinel_onboard.py       # Batch camera onboarding from Sentinel
│   └── setup_cameras.py          # One-shot full setup (dept + admin + cameras)
│
├── stream-gateway/               # MediaMTX + sync service
│   ├── mediamtx.yml              # MediaMTX server configuration
│   ├── gateway_sync.py           # Camera → MediaMTX path sync
│   ├── Dockerfile                # MediaMTX image
│   ├── Dockerfile.sync           # Python sync service
│   └── requirements.txt          # httpx + tenacity + pyyaml
│
├── ai-worker/                    # YOLO detection + ANPR worker
│   ├── main.py                   # Worker entry point
│   ├── camera_worker.py          # RTSP frame capture with backoff
│   ├── detector.py               # YOLOv8 object detection
│   ├── anpr.py                   # Tesseract OCR plate recognition
│   ├── pipeline.py               # Detection → dedup → watchlist check → alert
│   ├── backend_client.py         # HTTP client to backend API
│   ├── config.py                 # Worker configuration constants
│   ├── Dockerfile                # Worker image
│   ├── requirements.txt          # 9 Python dependencies
│   └── .env                      # Worker-specific env overrides
│
├── dashboard/                    # React frontend
│   ├── index.html                # Vite SPA shell
│   ├── package.json              # 8 npm dependencies
│   ├── vite.config.js            # Vite config + proxy rules
│   ├── Dockerfile                # node:20-slim (dev server)
│   └── src/
│       ├── main.jsx              # Entry point
│       ├── App.jsx               # Main app, auth, tab routing
│       ├── api.js                # All API calls (Axios)
│       ├── index.css             # CSS design system variables
│       ├── gujlogo.png           # Gujarat Police logo
│       ├── components/
│       │   ├── Sidebar.jsx       # Navigation sidebar
│       │   ├── Home.jsx          # Dashboard home with stats
│       │   ├── CameraGrid.jsx    # Camera wall grid (1x1 to 5x5)
│       │   ├── CameraPlayer.jsx  # Core video player (WebRTC + HLS)
│       │   ├── CameraViewerModal.jsx # Fullscreen camera overlay
│       │   ├── LiveVideoPlayer.jsx   # Thin CameraPlayer wrapper
│       │   ├── CameraList.jsx    # Camera list with health check
│       │   ├── AlertPanel.jsx    # Live alert feed
│       │   ├── DetectionHistory.jsx  # ANPR search + route viewer
│       │   ├── WatchlistPanel.jsx    # Watchlist management UI
│       │   ├── VehicleSearch.jsx     # Plate search form (unused)
│       │   ├── RouteDetail.jsx       # Vehicle route card overlay
│       │   ├── MapView.jsx           # Leaflet map
│       │   └── LoginScreen.jsx       # Auth login screen
│       └── utils/
│           └── streamUrlBuilder.js   # Stream URL factory
│
└── database/
    ├── schema.sql                # Complete SQL DDL (13 tables)
    └── sample_camera_import.csv  # 30 cameras for bulk import
```

---

## 4. System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Disk | 50 GB | 100+ GB SSD |
| OS | Windows 10/11, Linux, macOS | Linux (Ubuntu 22.04+) |
| Docker | 24.0+ | 25.0+ |
| Docker Compose | v2.20+ | v2.24+ |
| Node.js | 20 LTS | 20 LTS (for dev only) |
| Python | 3.11+ | 3.11+ |

---

## 5. Prerequisites

1. **Docker Desktop** or Docker Engine with Compose V2
2. **Git** for cloning the repository
3. **Network access** to `103.250.160.189` (Sentinel infrastructure)
4. **Ports available**: 5173 (dashboard), 8000 (backend), 5432 (PostgreSQL), 8554 (RTSP), 8888 (HLS), 8889 (WebRTC), 9997 (MediaMTX API), 6379 (Redis)

---

## 6. Installation & Setup

### Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd gujarat-cctv

# 2. Create .env from template
cp .env.example .env
# Edit .env with your secrets (see Section 7)

# 3. Start all services
docker compose up -d --build

# 4. Wait for PostgreSQL to be ready (~10s)
docker compose logs -f db

# 5. Initialize database schema
docker compose exec backend python -c "from app.database import engine, Base; import asyncio; asyncio.run(Base.metadata.create_all(engine))"

# 6. Seed admin user
docker compose exec backend python seed_admin.py --username admin --email admin@example.gov.in --password admin123

# 7. Seed demo watchlist + alert
docker compose exec backend python seed_watchlist_and_alert.py

# 8. Open dashboard
# http://localhost:5173
# Login: admin / admin123
```

### Manual Development Setup

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Dashboard
cd dashboard
npm install
npx vite --port 5173
```

---

## 7. Environment Variables

### Root `.env`

| Variable | Default | Description |
|---|---|---|
| `SENTINEL_HOST` | `103.250.160.189` | Sentinel RTSP/CDN server IP |
| `SENTINEL_USERNAME` | `""` | Sentinel auth username |
| `SENTINEL_PASSWORD` | `""` | Sentinel auth password |
| `SENTINEL_CDN` | `https://cctv.corp8.cloud` | Sentinel HLS CDN base URL |
| `JWT_SECRET_KEY` | `CHANGE_ME...` | HMAC key for JWT signing |
| `AI_WORKER_API_KEY` | `CHANGE_ME...` | Service-to-service API key |
| `ADMIN_PASSWORD` | `admin123` | Default admin password |

### Backend `.env` (or inherited from root)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://cctv_user:cctv_pass@localhost:5432/cctv_platform` | Async PG connection |
| `ENVIRONMENT` | `development` | Runtime environment |
| `CAMERA_HEALTH_CHECK_TIMEOUT_SECONDS` | `5` | RTSP probe timeout |
| `CAMERA_HEALTH_CHECK_RETRIES` | `2` | Probe retry count |

### AI Worker `.env`

| Variable | Default | Description |
|---|---|---|
| `BACKEND_API_URL` | `http://backend:8000` | Backend API base URL |
| `AI_WORKER_API_KEY` | `change_me_to_a_long_random_string` | Must match backend |
| `RTSP_TRANSPORT` | `tcp` | RTSP transport protocol |
| `SAMPLE_FPS` | `5` | Frames per second to sample |
| `FRAME_WIDTH` | `640` | Frame resize width |
| `FRAME_HEIGHT` | `640` | Frame resize height |
| `DETECTION_CONFIDENCE_THRESHOLD` | `0.35` | YOLO confidence threshold |
| `OCR_CONFIDENCE_THRESHOLD` | `0.30` | Tesseract confidence threshold |
| `VEHICLE_CLASSES` | `2,3,5,7` | COCO class IDs (car,truck,bus,motorcycle) |
| `CAMERA_POLL_INTERVAL_SECONDS` | `30` | Seconds between camera polls |
| `MAX_CONCURRENT_CAMERAS` | `15` | Max parallel camera workers |
| `DEDUP_WINDOW_SECONDS` | `30` | Temporal dedup window |

### Dashboard `.env` (Vite)

| Variable | Default | Description |
|---|---|---|
| `VITE_BACKEND_PROXY_TARGET` | `http://localhost:8000` | Backend URL for dev proxy |
| `VITE_STREAM_GATEWAY_PROXY_TARGET` | `http://localhost:8888` | MediaMTX HLS URL |

---

## 8. Docker Compose Services

**File:** `docker-compose.yml`

| Service | Image | Port(s) | Purpose |
|---|---|---|---|
| `db` | `postgis/postgis:15-3.4` | 5432 | PostgreSQL + PostGIS database |
| `redis` | `redis:7-alpine` | 6379 | Redis cache (defined but unused) |
| `backend` | Custom build | 8000 | FastAPI REST API |
| `ai-worker` | Custom build | — | YOLO detection + ANPR worker |
| `stream-gateway` | `bluenviron/mediamtx:latest` | 8554, 8888, 8889, 9997, 8189 | RTSP/HLS/WebRTC stream gateway |
| `gateway-sync` | Custom build | — | Camera → MediaMTX path sync |
| `dashboard` | Custom build | 5173 | React frontend (Vite dev server) |

### Service Dependencies

```
db → backend → ai-worker
              → gateway-sync
              → dashboard
stream-gateway (standalone)
redis (standalone, unused)
```

### Volume Mounts

| Service | Mount | Purpose |
|---|---|---|
| `stream-gateway` | `./stream-gateway/mediamtx.yml:/mediamtx.yml` | Live config updates from sync |
| `backend` | `./backend/app:/app/app` | Hot-reload in dev |

### Health Checks

| Service | Command | Interval |
|---|---|---|
| `db` | `pg_isready -U cctv_user` | 5s |
| `redis` | `redis-cli ping` | 5s |
| `backend` | `curl -f http://localhost:8000/health` | 15s |

---

## 9. Database Schema

**Engine:** PostgreSQL 15 + PostGIS 3.4 + pg_trgm extension

**Total tables:** 13

**Schema file:** `database/schema.sql`

**Initialization:** `backend/init_db.py` runs `Base.metadata.create_all(engine)`

**Default database:** `cctv_platform`
**Default user:** `cctv_user` / `cctv_pass`

### Entity-Relationship Diagram

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│    roles     │     │ departments  │     │ vms_systems  │
└──────┬──────┘     └──────┬───────┘     └──────┬───────┘
       │                   │                    │
       │    ┌──────────────┘                    │
       │    │                                   │
┌──────┴────┴──────────┐              ┌─────────┴────────┐
│       users          │              │     cameras       │
└──────────────────────┘              └─────────┬────────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              │                 │                  │
                    ┌─────────┴────────┐  ┌─────┴──────┐  ┌──────┴───────┐
                    │  camera_health   │  │ detections  │  │   alerts     │
                    └──────────────────┘  └──────┬──────┘  └──────────────┘
                                                 │
                                       ┌─────────┴──────────┐
                                       │ vehicle_detections  │
                                       └─────────┬──────────┘
                                                 │
                                       ┌─────────┴──────────┐
                                       │     vehicles       │
                                       └────────────────────┘

┌──────────────┐     ┌───────────────────┐
│  watchlists  │     │   audit_logs      │
└──────┬───────┘     └───────────────────┘
       │
┌──────┴────────────┐
│ watchlist_entries  │
└───────────────────┘

┌──────────────┐
│  locations   │
└──────┬───────┘
       │
  (referenced by cameras, alerts)
```

---

## 10. Database Tables Reference

### `roles`

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL |
| `description` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Seed data:** `admin`, `operator`, `viewer`, `auditor`

---

### `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `username` | VARCHAR(100) | UNIQUE, NOT NULL |
| `email` | VARCHAR(150) | UNIQUE, NOT NULL |
| `password_hash` | VARCHAR(255) | NOT NULL |
| `role_id` | INT | FK → roles.id |
| `department_id` | UUID | FK → departments.id, nullable |
| `is_active` | BOOLEAN | DEFAULT TRUE |
| `last_login_at` | TIMESTAMPTZ | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

---

### `departments`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `name` | VARCHAR(150) | NOT NULL |
| `code` | VARCHAR(20) | UNIQUE, NOT NULL |
| `description` | TEXT | nullable |
| `contact_email` | VARCHAR(150) | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Relationships:** Has many `cameras`

---

### `vms_systems`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `name` | VARCHAR(150) | NOT NULL |
| `vendor` | VARCHAR(100) | nullable |
| `adapter_type` | VARCHAR(50) | NOT NULL |
| `department_id` | UUID | FK → departments.id |
| `base_url` | VARCHAR(255) | nullable |
| `auth_config_ref` | VARCHAR(255) | nullable |
| `storage_type` | VARCHAR(20) | nullable |
| `retention_days` | INT | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

---

### `locations`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `name` | VARCHAR(150) | NOT NULL |
| `district` | VARCHAR(100) | nullable |
| `address` | TEXT | nullable |
| `geom` | GEOGRAPHY(POINT, 4326) | NOT NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Notes:** PostGIS geography column for spatial queries. Coordinates stored as WGS84 (EPSG:4326).

---

### `cameras`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `camera_code` | VARCHAR(50) | UNIQUE, NOT NULL |
| `name` | VARCHAR(150) | NOT NULL |
| `department_id` | UUID | FK → departments.id |
| `vms_system_id` | UUID | FK → vms_systems.id, nullable |
| `location_id` | UUID | FK → locations.id |
| `camera_type` | VARCHAR(50) | nullable |
| `protocol` | VARCHAR(20) | NOT NULL (rtsp/onvif/vendor_api) |
| `stream_url` | VARCHAR(500) | nullable |
| `onvif_endpoint` | VARCHAR(255) | nullable |
| `resolution` | VARCHAR(20) | nullable |
| `fps` | INT | nullable |
| `codec` | VARCHAR(20) | nullable |
| `status` | VARCHAR(20) | DEFAULT 'inactive' |
| `is_public_domain` | BOOLEAN | DEFAULT TRUE |
| `onboarded_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Status values:** `active`, `inactive`, `maintenance`, `decommissioned`

**Relationships:** Belongs to `Department`, belongs to `Location`

---

### `camera_health`

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `camera_id` | UUID | FK → cameras.id, ON DELETE CASCADE |
| `checked_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `is_reachable` | BOOLEAN | NOT NULL |
| `latency_ms` | INT | nullable |
| `error_message` | TEXT | nullable |

---

### `vehicles`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `registration_number` | VARCHAR(20) | UNIQUE, NOT NULL |
| `vehicle_type` | VARCHAR(30) | nullable |
| `make` | VARCHAR(50) | nullable |
| `model` | VARCHAR(50) | nullable |
| `color` | VARCHAR(30) | nullable |
| `first_seen_at` | TIMESTAMPTZ | nullable |
| `last_seen_at` | TIMESTAMPTZ | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

---

### `detections`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `camera_id` | UUID | FK → cameras.id |
| `detection_type` | VARCHAR(30) | NOT NULL |
| `raw_value` | VARCHAR(255) | nullable |
| `normalized_value` | VARCHAR(255) | nullable |
| `detection_confidence` | NUMERIC(4,3) | nullable |
| `ocr_confidence` | NUMERIC(4,3) | nullable |
| `vehicle_type` | VARCHAR(30) | nullable |
| `vehicle_color` | VARCHAR(30) | nullable |
| `bounding_box` | JSONB | nullable |
| `evidence_uri` | VARCHAR(500) | nullable |
| `video_timestamp_ref` | VARCHAR(100) | nullable |
| `detected_at` | TIMESTAMPTZ | NOT NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Indexes:** Composite `(camera_id, detected_at)`

---

### `vehicle_detections`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `vehicle_id` | UUID | FK → vehicles.id, ON DELETE CASCADE |
| `detection_id` | UUID | FK → detections.id, ON DELETE CASCADE |
| `match_confidence` | NUMERIC(4,3) | NOT NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

---

### `watchlists`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `name` | VARCHAR(150) | NOT NULL |
| `category` | VARCHAR(50) | NOT NULL |
| `source_system` | VARCHAR(50) | nullable |
| `owner_department_id` | UUID | FK → departments.id, nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Categories:** `stolen_vehicle`, `blacklisted_vehicle`, `wanted_person`, `missing_person`, `suspect`

---

### `watchlist_entries`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `watchlist_id` | UUID | FK → watchlists.id, ON DELETE CASCADE |
| `entity_type` | VARCHAR(20) | NOT NULL ('vehicle'/'person') |
| `registration_number` | VARCHAR(20) | nullable |
| `vehicle_type` | VARCHAR(30) | nullable |
| `make` | VARCHAR(50) | nullable |
| `model` | VARCHAR(50) | nullable |
| `color` | VARCHAR(30) | nullable |
| `person_name` | VARCHAR(150) | nullable |
| `identifying_details` | TEXT | nullable |
| `status` | VARCHAR(20) | DEFAULT 'active' |
| `priority` | VARCHAR(20) | DEFAULT 'medium' |
| `notes` | TEXT | nullable |
| `created_date` | DATE | DEFAULT CURRENT_DATE |
| `expiry_date` | DATE | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Priority values:** `critical`, `high`, `medium`, `low`

---

### `audit_logs`

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `user_id` | UUID | FK → users.id, nullable |
| `action` | VARCHAR(100) | NOT NULL |
| `resource_type` | VARCHAR(50) | nullable |
| `resource_id` | VARCHAR(100) | nullable |
| `ip_address` | INET | nullable |
| `details` | JSONB | nullable |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Notes:** Append-only. No update or delete endpoints.

---

### `alerts`

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PRIMARY KEY |
| `event_type` | VARCHAR(50) | NOT NULL |
| `camera_id` | UUID | FK → cameras.id, nullable |
| `detection_id` | UUID | FK → detections.id, nullable |
| `entity_type` | VARCHAR(20) | nullable |
| `entity_id` | UUID | nullable |
| `detected_value` | VARCHAR(255) | nullable |
| `watchlist_entry_id` | UUID | FK → watchlist_entries.id, nullable |
| `match_confidence` | NUMERIC(4,3) | nullable |
| `severity` | VARCHAR(20) | NOT NULL |
| `location_id` | UUID | FK → locations.id, nullable |
| `evidence_uri` | VARCHAR(500) | nullable |
| `status` | VARCHAR(20) | DEFAULT 'new' |
| `acknowledged_by` | UUID | FK → users.id, nullable |
| `acknowledged_at` | TIMESTAMPTZ | nullable |
| `triggered_at` | TIMESTAMPTZ | DEFAULT NOW() |

**Status values:** `new`, `acknowledged`

**Severity values:** `critical`, `high`, `medium`, `low`

**Event types:** `watchlist_match`, `system`

---

## 11. Backend — FastAPI

**Entry point:** `backend/app/main.py`

**Framework:** FastAPI 0.115 with uvicorn

**API prefix:** `/api/v1`

**CORS:** `allow_origins=["*"]` (permissive for development)

### App Startup

On startup (lifespan context manager):
1. Connects to PostgreSQL
2. Runs `sync_catalogue_internal(db)` to sync Sentinel cameras from CDN
3. This populates the `cameras` and `locations` tables from the Sentinel catalogue

### Registered Routers

| Router | Prefix | File |
|---|---|---|
| `auth` | `/api/v1/auth` | `routers/auth.py` |
| `departments` | `/api/v1/departments` | `routers/departments.py` |
| `cameras` | `/api/v1/cameras` | `routers/cameras.py` |
| `watchlist` | `/api/v1/watchlist` | `routers/watchlist.py` |
| `detections` | `/api/v1/detections` | `routers/detections.py` |
| `vehicles` | `/api/v1/vehicles` | `routers/vehicles.py` |
| `alerts` | `/api/v1/alerts` | `routers/alerts.py` |
| `audit` | `/api/v1/audit-logs` | `routers/audit.py` |

### Health Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Root health check |
| GET | `/api/v1/health` | API health check |

---

## 12. Backend Configuration

**File:** `backend/app/core/config.py`

All settings loaded from environment via `pydantic-settings`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `database_url` | str | `postgresql+asyncpg://cctv_user:cctv_pass@localhost:5432/cctv_platform` | Async PG connection string |
| `app_name` | str | `Gujarat CCTV Registry & Federation Service` | Application title |
| `environment` | str | `development` | Runtime environment |
| `api_prefix` | str | `/api/v1` | Global route prefix |
| `camera_health_check_timeout_seconds` | int | `5` | RTSP probe timeout |
| `camera_health_check_retries` | int | `2` | Probe retry count |
| `jwt_secret_key` | str | `CHANGE_ME...` | HMAC signing key |
| `jwt_algorithm` | str | `HS256` | JWT algorithm |
| `jwt_expiry_minutes` | int | `480` (8 hours) | Token lifetime |
| `ai_worker_api_key` | str | `CHANGE_ME...` | Service-to-service API key |
| `sentinel_host` | str | `103.250.160.189` | Sentinel RTSP server |
| `sentinel_username` | str | `""` | Sentinel auth username |
| `sentinel_password` | str | `""` | Sentinel auth password |
| `sentinel_cdn` | str | `https://cctv.corp8.cloud` | Sentinel HLS CDN base |

**Singleton:** `settings = Settings()`

---

## 13. Authentication & Security

### JWT Authentication

**File:** `backend/app/core/security.py`

| Function | Description |
|---|---|
| `hash_password(password)` | bcrypt hash |
| `verify_password(plain, hashed)` | bcrypt verify |
| `create_access_token(subject, role, department_id)` | Build JWT with `{sub, role, department_id, iat, exp}` |
| `decode_access_token(token)` | Decode + verify JWT |

**Token format:** Bearer token in `Authorization` header

**Token lifetime:** 8 hours (480 minutes)

**Storage:** `localStorage` on client side

### Role-Based Access Control

**File:** `backend/app/core/deps.py`

| Role | Permissions |
|---|---|
| `admin` | Full access. Create users, cameras, departments. Acknowledge alerts. |
| `operator` | Onboard cameras, bulk import, health checks, acknowledge alerts. |
| `viewer` | Read-only access to cameras, alerts, detections. |
| `auditor` | Read-only + audit log access. |
| `service` | AI worker service-to-service access (X-API-Key auth). |

**Department scoping:** Non-admin/operator users only see data for their `department_id`. Admins and auditors bypass department scoping (`UNRESTRICTED_ROLES = {"admin", "auditor", "service"}`).

### Service-to-Service Auth

AI worker authenticates via `X-API-Key` header validated against `settings.ai_worker_api_key`.

### Security Concerns (Known)

| Issue | Location | Severity |
|---|---|---|
| CORS `allow_origins=["*"]` | `main.py` | HIGH |
| Hardcoded admin fallback password | `routers/auth.py:50-52` | HIGH |
| JWT in `localStorage` | `LoginScreen.jsx` | MEDIUM |
| No rate limiting on login | `routers/auth.py` | MEDIUM |
| No HTTPS enforcement | All | MEDIUM |

---

## 14. API Endpoints Reference

### Authentication — `/api/v1/auth`

| # | Method | Path | Auth | Role | Description |
|---|---|---|---|---|---|
| 1 | POST | `/api/v1/auth/login` | OAuth2 form | — | Login, returns JWT |
| 2 | POST | `/api/v1/auth/users` | JWT | admin | Create new user |
| 3 | GET | `/api/v1/auth/me` | JWT | any | Get current user info |

**POST /api/v1/auth/login**
- Body: `application/x-www-form-urlencoded` with `username` and `password`
- Response: `{ "access_token": "...", "token_type": "bearer" }`
- Audit: `auth.login_success` / `auth.login_failed`

**POST /api/v1/auth/users**
- Body: `{ "username": "...", "email": "...", "password": "...", "role_name": "viewer", "department_id": "uuid" }`
- Audit: `user.create`

**GET /api/v1/auth/me**
- Response: `{ "id": "uuid", "username": "...", "email": "...", "role_name": "...", "department_id": "uuid" }`

---

### Departments — `/api/v1/departments`

| # | Method | Path | Auth | Role | Description |
|---|---|---|---|---|---|
| 4 | POST | `/api/v1/departments` | JWT | admin | Create department |
| 5 | GET | `/api/v1/departments` | JWT | any | List departments |
| 6 | GET | `/api/v1/departments/{id}` | JWT | any | Get single department |

**POST /api/v1/departments**
- Body: `{ "name": "...", "code": "...", "description": "...", "contact_email": "..." }`
- Response: `DepartmentOut`

**GET /api/v1/departments**
- Response: `DepartmentOut[]`

---

### Cameras — `/api/v1/cameras`

| # | Method | Path | Auth | Role | Description |
|---|---|---|---|---|---|
| 7 | POST | `/api/v1/cameras` | JWT | admin,operator | Onboard camera |
| 8 | POST | `/api/v1/cameras/bulk-import` | JWT | admin,operator | CSV bulk import |
| 9 | GET | `/api/v1/cameras` | JWT/API-key | any | List cameras |
| 10 | GET | `/api/v1/cameras/gis` | JWT | any | Camera lat/lng for map |
| 11 | GET | `/api/v1/cameras/{id}` | JWT | any | Get single camera |
| 12 | PATCH | `/api/v1/cameras/{id}` | JWT | admin,operator | Update camera |
| 13 | POST | `/api/v1/cameras/activate-all` | JWT | admin,operator | Set all to active |
| 14 | POST | `/api/v1/cameras/{id}/health-check` | JWT | admin,operator | RTSP/ONVIF probe |
| 15 | POST | `/api/v1/cameras/sync-catalogue` | JWT/API-key | any | Sync from Sentinel |
| 16 | GET | `/api/v1/cameras/catalogue/raw` | — | — | Raw Sentinel catalogue |
| 17 | OPTIONS | `/api/v1/cameras/{code}/whep` | — | — | CORS preflight |
| 18 | POST | `/api/v1/cameras/{code}/whep` | — | — | WHEP signaling proxy |
| 19 | PATCH | `/api/v1/cameras/{code}/whep/{sid}` | — | — | Trickle-ice |
| 20 | DELETE | `/api/v1/cameras/{code}/whep/{sid}` | — | — | Session teardown |

**POST /api/v1/cameras** — Onboard a single camera
- Body: `{ "camera_code": "cam01", "name": "...", "department_id": "uuid", "protocol": "rtsp", "stream_url": "rtsp://...", "location": { "name": "...", "latitude": 22.3, "longitude": 70.8 } }`
- Audit: `camera.onboard`

**POST /api/v1/cameras/bulk-import** — CSV bulk import
- Body: multipart file upload (CSV)
- Audit: `camera.bulk_import`

**GET /api/v1/cameras** — List cameras
- Query params: `skip`, `limit`, `department_id`
- Note: `stream_url` is stripped for non-service users
- Response: `CameraOut[]`

**GET /api/v1/cameras/gis** — GIS camera data
- Response: `[{ id, camera_code, name, district, status, latitude, longitude, is_public_domain }]`

**POST /api/v1/cameras/{id}/health-check**
- Runs RTSP/ONVIF probe via adapter
- Response: `{ "is_reachable": bool, "latency_ms": int, "error_message": str }`
- Inserts row into `camera_health` table

**POST /api/v1/cameras/sync-catalogue**
- Fetches cameras.json from Sentinel CDN
- Upserts cameras into database
- Returns count of synced cameras

**POST /api/v1/cameras/{code}/whep** — WHEP signaling proxy
- Forwards SDP offer to upstream MediaMTX WebRTC endpoint
- Returns SDP answer to client
- No authentication (public endpoint for streaming)

---

### Watchlist — `/api/v1/watchlist`

| # | Method | Path | Auth | Role | Description |
|---|---|---|---|---|---|
| 21 | POST | `/api/v1/watchlists` | JWT | admin,operator | Create watchlist |
| 22 | GET | `/api/v1/watchlists` | JWT | any | List all watchlists |
| 23 | POST | `/api/v1/watchlist/entries` | JWT | admin,operator | Add entry |
| 24 | GET | `/api/v1/watchlist/entries` | JWT | any | Search entries |

**POST /api/v1/watchlists**
- Body: `{ "name": "...", "category": "stolen_vehicle", "source_system": "..." }`
- Audit: none (missing)

**POST /api/v1/watchlist/entries**
- Body: `{ "watchlist_id": "uuid", "entity_type": "vehicle", "registration_number": "GJ01AB1234", "priority": "critical", "notes": "..." }`
- Plate is normalized (stripped, uppercased)
- Audit: `watchlist_entry.create`

**GET /api/v1/watchlist/entries**
- Query params: `watchlist_id`, `registration_number`, `status`
- Response: `WatchlistEntryOut[]`

---

### Detections — `/api/v1/detections`

| # | Method | Path | Auth | Role | Description |
|---|---|---|---|---|---|
| 25 | POST | `/api/v1/detections/anpr` | X-API-Key | service | ANPR ingestion |
| 26 | GET | `/api/v1/detections` | JWT | any | List recent detections |

**POST /api/v1/detections/anpr** — ANPR detection ingestion
- Header: `X-API-Key: <ai_worker_api_key>`
- Body: `{ "camera_id": "uuid", "raw_plate_text": "GJ01AB1234", "ocr_confidence": 0.85, "detection_confidence": 0.9, "vehicle_type": "car", "vehicle_color": "white", "bounding_box": {...}, "evidence_uri": "file:///...", "detected_at": "2026-01-15T10:30:00Z" }`
- Response: `{ "detection_id": "uuid", "normalized_plate": "GJ01AB1234", "deduplicated": false, "watchlist_match": true, "match_type": "exact", "alert_id": "uuid" }`
- Pipeline: validate → normalize → dedup (30s window) → vehicle upsert → watchlist match → alert creation

**GET /api/v1/detections**
- Query params: `skip`, `limit`
- Response: Detection objects with camera info

---

### Vehicles — `/api/v1/vehicles`

| # | Method | Path | Auth | Role | Description |
|---|---|---|---|---|---|
| 27 | GET | `/api/v1/vehicles/search` | JWT | any | Fuzzy plate search |
| 28 | GET | `/api/v1/vehicles/{plate}/route` | JWT | any | Route reconstruction |

**GET /api/v1/vehicles/search**
- Query params: `q` (ILIKE pattern)
- Response: Vehicle objects with detection counts

**GET /api/v1/vehicles/{plate}/route**
- Response: `{ registration_number, vehicle_type, color, first_seen_at, last_seen_at, total_detections, camera_sequence: [...], route: [{ detection_id, timestamp, camera_id, camera_code, camera_name, location_name, district, lat, lng, detection_confidence, ocr_confidence, evidence_uri }] }`

---

### Alerts — `/api/v1/alerts`

| # | Method | Path | Auth | Role | Description |
|---|---|---|---|---|---|
| 29 | GET | `/api/v1/alerts` | JWT | any | List alerts |
| 30 | POST | `/api/v1/alerts/{id}/acknowledge` | JWT | admin,operator | Acknowledge alert |

**GET /api/v1/alerts**
- Query params: `skip`, `limit`, `status`, `severity`
- Note: Department-scoped for non-admin users
- Response: `AlertOut[]`

**POST /api/v1/alerts/{id}/acknowledge**
- Sets `status = "acknowledged"`, `acknowledged_by`, `acknowledged_at`
- Audit: `alert.acknowledge`

---

### Audit Logs — `/api/v1/audit-logs`

| # | Method | Path | Auth | Role | Description |
|---|---|---|---|---|---|
| 31 | GET | `/api/v1/audit-logs` | JWT | admin,auditor | List audit logs |

**GET /api/v1/audit-logs**
- Query params: `action`, `user_id`, `resource_type`, `limit` (max 500)
- Response: `AuditLogOut[]`
- Note: Append-only. No delete/update.

---

### Summary Table

| # | Method | Full Path | Auth | Role |
|---|---|---|---|---|
| 1 | GET | `/health` | None | — |
| 2 | GET | `/api/v1/health` | None | — |
| 3 | POST | `/api/v1/auth/login` | OAuth2 | — |
| 4 | POST | `/api/v1/auth/users` | JWT | admin |
| 5 | GET | `/api/v1/auth/me` | JWT | any |
| 6 | POST | `/api/v1/departments` | JWT | admin |
| 7 | GET | `/api/v1/departments` | JWT | any |
| 8 | GET | `/api/v1/departments/{id}` | JWT | any |
| 9 | POST | `/api/v1/cameras` | JWT | admin,operator |
| 10 | POST | `/api/v1/cameras/bulk-import` | JWT | admin,operator |
| 11 | GET | `/api/v1/cameras` | JWT/API-key | any |
| 12 | GET | `/api/v1/cameras/gis` | JWT | any |
| 13 | GET | `/api/v1/cameras/{id}` | JWT | any |
| 14 | PATCH | `/api/v1/cameras/{id}` | JWT | admin,operator |
| 15 | POST | `/api/v1/cameras/activate-all` | JWT | admin,operator |
| 16 | POST | `/api/v1/cameras/{id}/health-check` | JWT | admin,operator |
| 17 | POST | `/api/v1/cameras/sync-catalogue` | JWT/API-key | any |
| 18 | GET | `/api/v1/cameras/catalogue/raw` | None | — |
| 19 | OPTIONS | `/api/v1/cameras/{code}/whep` | None | — |
| 20 | POST | `/api/v1/cameras/{code}/whep` | None | — |
| 21 | PATCH | `/api/v1/cameras/{code}/whep/{sid}` | None | — |
| 22 | DELETE | `/api/v1/cameras/{code}/whep/{sid}` | None | — |
| 23 | POST | `/api/v1/detections/anpr` | X-API-Key | service |
| 24 | GET | `/api/v1/detections` | JWT | any |
| 25 | GET | `/api/v1/alerts` | JWT | any |
| 26 | POST | `/api/v1/alerts/{id}/acknowledge` | JWT | admin,operator |
| 27 | POST | `/api/v1/watchlists` | JWT | admin,operator |
| 28 | GET | `/api/v1/watchlists` | JWT | any |
| 29 | POST | `/api/v1/watchlist/entries` | JWT | admin,operator |
| 30 | GET | `/api/v1/watchlist/entries` | JWT | any |
| 31 | GET | `/api/v1/vehicles/search` | JWT | any |
| 32 | GET | `/api/v1/vehicles/{plate}/route` | JWT | any |
| 33 | GET | `/api/v1/audit-logs` | JWT | admin,auditor |

**Total: 33 endpoints**

---

## 15. Camera Onboarding Pipeline

### Automatic Onboarding (Startup)

On backend startup, `sync_catalogue_internal(db)` runs:

1. Fetches `https://cctv.corp8.cloud/cameras.json` (Sentinel CDN)
2. Falls back to `http://103.250.160.189:9997/cameras.json` (MediaMTX API)
3. Parses camera entries: `camId`, `name`, `cameraCode`, `secret`, `lat`, `long`, `ip`
4. For each camera:
   - Upserts `locations` table with lat/long
   - Upserts `cameras` table with RTSP URL: `rtsp://<SENTINEL_USERNAME>:<SENTINEL_PASSWORD>@<SENTINEL_HOST>:8554/<camId>`
   - Assigns district via heuristic name matching
5. Returns count of synced cameras

### Manual Onboarding

**`backend/sentinel_onboard.py`**
```bash
python sentinel_onboard.py \
  --sentinel-host 103.250.160.189 \
  --admin-username admin \
  --admin-password admin123 \
  --department-id <uuid>
```

**`backend/setup_cameras.py`** — One-shot setup:
1. Creates "Gujarat Police" department
2. Ensures admin user exists
3. Fetches Sentinel catalogue
4. Onboards/updates cameras with authenticated RTSP URLs
5. Activates all cameras

### Bulk Import

**POST /api/v1/cameras/bulk-import** accepts CSV with columns:
`camera_code, name, department_id, protocol, stream_url, camera_type, resolution, fps, codec, latitude, longitude, district`

---

## 16. Camera Health Checking

**Endpoint:** `POST /api/v1/cameras/{camera_id}/health-check`

**Adapter:** `backend/app/adapters/rtsp_onvif.py`

### RTSP Health Check

```python
# Forces TCP transport
# Opens RTSP stream with OpenCV
# Reads one frame
# Measures latency
# Timeout: 5s, Retries: 2
```

**Output:** `{ "is_reachable": true, "latency_ms": 245, "error_message": null }`

### ONVIF Health Check

```python
# Connects via ONVIF protocol
# Discovers media service
# Gets stream URI
# Returns stream info
```

### Health History

Each check inserts a row into `camera_health` table with timestamp, reachability, latency, and error message.

---

## 17. Streaming Architecture

### Stream Flow

```
Sentinel Camera (RTSP)
        │
        ▼
Sentinel RTSP Server (103.250.160.189:8554)
        │
        ├──→ MediaMTX (port 8554) — receives RTSP push
        │         │
        │         ├──→ HLS (port 8888) — transmuxed to HLS
        │         ├──→ WebRTC (port 8889) — transmuxed to WebRTC/WHEP
        │         └──→ UDP (port 8189) — RTP multicast
        │
        └──→ Sentinel CDN (https://cctv.corp8.cloud)
                  │
                  └──→ HLS via CDN (with cookie auth)
```

### Frontend Playback Strategy

1. **WebRTC (WHEP)** — Primary. Lowest latency (~1-2s). Uses `RTCPeerConnection` + SDP signaling.
2. **HLS (Local MediaMTX)** — Fallback. ~3-5s latency. Uses `hls.js`.
3. **HLS (CDN)** — Last resort. Uses Sentinel CDN with cookie auth.

### WHEP Signaling Flow

```
Frontend                         Backend                         MediaMTX
   │                                │                                │
   │  1. POST /whep (SDP offer)     │                                │
   │  ──────────────────────────────>│  2. Forward to upstream        │
   │                                │  ──────────────────────────────>│
   │                                │  3. SDP answer                 │
   │  4. Return SDP answer          │  <──────────────────────────────│
   │  <─────────────────────────────│                                │
   │                                │                                │
   │  5. ICE candidates             │                                │
   │  ──────────────────────────────>│  6. PATCH /whep/{session_id}  │
   │                                │  ──────────────────────────────>│
```

---

## 18. Stream Gateway (MediaMTX)

**File:** `stream-gateway/mediamtx.yml`

### Ports

| Protocol | Port | Description |
|---|---|---|
| RTSP | 8554 | RTSP server (receives camera streams) |
| HLS | 8888 | HLS server (serves .m3u8 segments) |
| WebRTC | 8889 | WebRTC/WHEP server |
| API | 9997 | MediaMTX HTTP API |
| UDP | 8189 | RTP multicast |

### Configuration Highlights

```yaml
paths:
  cam01:
    source: rtsp://103.250.160.189:8554/cam01
    # ... more cameras added by gateway_sync.py
```

- **No authentication** on MediaMTX API
- RTSP streams accepted from Sentinel cameras
- HLS segments written to `/tmp/mediamtx/`
- WebRTC via WHEP protocol

---

## 19. Gateway Sync Service

**File:** `stream-gateway/gateway_sync.py`

### Purpose

Automatically syncs camera paths from the backend database to MediaMTX configuration.

### Behavior

1. Polls `GET /api/v1/cameras` every 60 seconds
2. Filters to cameras with `protocol in ("rtsp", "onvif")` that have a `stream_url`
3. Builds MediaMTX path config with RTSP source URL
4. Writes updated `mediamtx.yml`
5. Sends SIGHUP to MediaMTX process to reload config

### Config Injection

```yaml
# For each camera:
paths:
  <camera_code>:
    source: <stream_url>
    sourceOnDemand: yes
```

---

## 20. WHEP WebRTC Signaling Proxy

**File:** `backend/app/routers/cameras.py` (lines ~200-300)

### Purpose

Backend proxies WHEP SDP signaling between frontend and MediaMTX, handling authentication and network bridging.

### Endpoints

| Method | Path | Description |
|---|---|---|
| OPTIONS | `/api/v1/cameras/{code}/whep` | CORS preflight |
| POST | `/api/v1/cameras/{code}/whep` | SDP offer → upstream, returns SDP answer |
| PATCH | `/api/v1/cameras/{code}/whep/{sid}` | Trickle ICE candidate |
| DELETE | `/api/v1/cameras/{code}/whep/{sid}` | Session teardown |

### Upstream URL

```
http://103.250.160.189:8889/stream/<cameraCode>/whep
```

---

## 21. HLS Streaming

### Local HLS (MediaMTX)

**URL pattern:** `/hls/<cameraCode>/index.m3u8`

**Proxy:** Vite dev server rewrites `/hls/*` → `localhost:8888/*`

### CDN HLS (Sentinel)

**URL pattern:** `/sentinel-hls/<cameraCode>/index.m3u8`

**Auth:** Sentinel CDN requires cookie-based authentication.

**Vite proxy:** Injects `sentinel=<session_cookie>` into requests to `cctv.corp8.cloud`.

**Cookie acquisition:** On dev-server start, performs `POST https://cctv.corp8.cloud/auth/login` with `SENTINEL_USERNAME`/`SENTINEL_PASSWORD` to get session cookie.

### Stream URL Builder

**File:** `dashboard/src/utils/streamUrlBuilder.js`

| Protocol | URL Pattern | Notes |
|---|---|---|
| `webrtc` / `whep` | `/sentinel-whep/stream/<id>/whep` | WebRTC via backend proxy |
| `hls` / `local_hls` | `${gatewayBase}/<id>/index.m3u8` | Local MediaMTX HLS |
| `hls_cdn` | `/sentinel-hls/<id>/index.m3u8` | Sentinel CDN HLS |

---

## 22. Frontend Dashboard

**Framework:** React 18 + Vite 5

**Build:** `npm run build` (Vite production build)

**Dev server:** `npx vite --host 0.0.0.0 --port 5173`

**Docker:** Runs Vite dev server (no production build in Dockerfile)

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | DOM renderer |
| `react-leaflet` | ^4.2.1 | Map component |
| `leaflet` | ^1.9.4 | Map engine |
| `axios` | ^1.7.7 | HTTP client |
| `hls.js` | ^1.5.17 | HLS video playback |
| `@vitejs/plugin-react` | ^4.3.1 | Vite React plugin (dev) |
| `vite` | ^5.4.8 | Build tool (dev) |

**No router library** — manual tab routing via conditional rendering.

**No state management library** — all state in `App.jsx` via `useState`/`useEffect`.

**No UI component library** — all components hand-built with inline styles + CSS variables.

### API Client

**File:** `dashboard/src/api.js`

- Base: `axios` → `/api/v1`
- Timeout: 20 seconds
- Request interceptor: Attaches `Bearer ${token}` from `localStorage`
- Response interceptor: On 401 → removes token, dispatches `cctv-auth-expired` event

### Tab Routing

| Tab ID | Component | Description |
|---|---|---|
| `home` | `Home` | Dashboard with stats, pinned cameras, alerts |
| `live` | `CameraGrid` | Full camera wall |
| `map` | `MapView` + `CameraList` + `RouteDetail` + `AlertPanel` | Interactive map |
| `detections` | `DetectionHistory` + `AlertPanel` | ANPR search + alerts |
| `watchlist` | `WatchlistPanel` + `AlertPanel` | Watchlist management |
| `cameras` | `CameraList` + `AlertPanel` | Camera list |
| `audit` | Static text | Placeholder |

### Polling

- **Cameras:** `getCamerasGis()` every 5 seconds
- **Alerts:** `getAlerts({ limit: 50 })` every 5 seconds

---

## 23. Dashboard Vite Proxy Configuration

**File:** `dashboard/vite.config.js`

| Route | Target | Rewrite | Auth |
|---|---|---|---|
| `/api` | `VITE_BACKEND_PROXY_TARGET` (default `localhost:8000`) | None | JWT Bearer |
| `/hls` | `VITE_STREAM_GATEWAY_PROXY_TARGET` (default `localhost:8888`) | `/hls` → `""` | None |
| `/sentinel-whep` | `http://103.250.160.189:8889` | `/sentinel-whep` → `""` | Basic Auth (injected) |
| `/sentinel-hls` | `https://cctv.corp8.cloud` | `/sentinel-hls` → `""` | Cookie auth (injected) |
| `/enc.key` | `https://cctv.corp8.cloud` | None | Cookie auth (injected) |

### Sentinel Auth Injection

On dev-server start:
1. `POST https://cctv.corp8.cloud/auth/login` with `SENTINEL_USERNAME`/`SENTINEL_PASSWORD`
2. Stores `sentinel=<session_cookie>` in memory
3. Re-authenticates on 401/403 responses
4. Injects cookie into `/sentinel-hls` and `/enc.key` proxy requests

---

## 24. Frontend Components

### Component Dependency Tree

```
main.jsx
└── App.jsx
    ├── LoginScreen ──→ api.login()
    ├── Sidebar
    ├── Home ──→ CameraPlayer ──→ streamUrlBuilder
    ├── CameraGrid ──→ CameraTile ──→ CameraPlayer
    ├── CameraList ──→ api.runHealthCheck()
    ├── MapView (Leaflet)
    ├── RouteDetail
    ├── AlertPanel
    ├── DetectionHistory ──→ api.searchVehicles/getVehicleRoute/getRecentDetections
    ├── WatchlistPanel ──→ api.getWatchlists/getWatchlistEntries/createWatchlist/createWatchlistEntry
    └── CameraViewerModal ──→ CameraPlayer
```

**Unused components:** `LiveVideoPlayer`, `VehicleSearch`

### `App.jsx` — Main Application

**State:**

| State | Type | Purpose |
|---|---|---|
| `authChecked` | bool | Gate: show spinner until initial auth check |
| `isAuthenticated` | bool | Login state |
| `currentUser` | object | `{ username, role }` from `/auth/me` |
| `activeTab` | string | Current tab |
| `cameras` | array | All cameras from `getCamerasGis()` |
| `alerts` | array | All alerts from `getAlerts({ limit: 50 })` |
| `connectionError` | string/null | API connection error |
| `activeRoute` | object/null | Vehicle route data for map |
| `viewingCamera` | object/null | Camera for `CameraViewerModal` |

**Lifecycle:**
- On mount: check `localStorage` for token → `getMe()` → set auth
- Listens for `cctv-auth-expired` custom event → force logout
- When authenticated: polls `getCamerasGis()` + `getAlerts()` every 5 seconds

### `Sidebar.jsx` — Navigation

**Props:** `{ activeTab, onTabChange, currentUser, onLogout, alertCount }`

**Renders:** Logo (`gujlogo.png`), nav sections, user profile card with sign-out

**Sections:**
- Operations: Home, Live, Incidents (with alert badge), Map
- Infrastructure: Watchlist, Cameras, Audit

### `Home.jsx` — Dashboard Home

**Props:** `{ cameras, alerts, streamGatewayBaseUrl }`

**Renders:** Greeting, 4 pinned camera tiles (`CameraPlayer`), stat cards (hardcoded NVRS "2/2", "All healthy"), connected servers, active alerts (top 5), open incidents (top 5)

### `CameraGrid.jsx` — Camera Wall

**Props:** `{ cameras, streamGatewayBaseUrl }`

**Renders:** Toolbar (grid size buttons 1×1 to 5×5, layout name), CSS grid of `CameraTile` components, bottom status bar, fullscreen focused camera overlay

**Grid sizes:** 1×1, 2×2, 3×3, 4×4, 5×5

### `CameraPlayer.jsx` — Core Video Player

**Props:** `{ camera, streamGatewayBaseUrl, staggerIndex, isFocused, showDiagnostics, onStatusChange, onExpand }`

**Connection strategy:**
1. Try WebRTC (WHEP) with 8s timeout
2. Fall back to HLS via `hls.js` (local gateway)
3. HLS fatal → retry to CDN (`hls_cdn`)
4. Exponential backoff reconnect: base 2s, max 30s, jitter ±500ms
5. Stall detection: every 6s checks `video.currentTime`

**Batch initialization:** 6 cameras per batch, 2s between batches, 250ms between cameras.

### `CameraViewerModal.jsx` — Fullscreen Camera Overlay

**Props:** `{ camera, streamGatewayBaseUrl, onClose }`

**Renders:** Fixed fullscreen overlay (z-index 2000), centered 900px card with camera info and `CameraPlayer isFocused showDiagnostics`

### `CameraList.jsx` — Camera List

**Props:** `{ cameras, onSelectCamera }`

**Renders:** Header with count, filter input, scrollable list with status dot, camera info, health-check button

### `AlertPanel.jsx` — Alert Feed

**Props:** `{ alerts, onAcknowledge, camerasById }`

**Renders:** Header ("Live Alerts" + new count), scrollable list of `AlertCard` components with severity badge, event type, time ago, plate, camera info, acknowledge button

### `DetectionHistory.jsx` — ANPR Search

**Props:** `{ onShowRoute }`

**Renders:** Search form, vehicle search results, route detail (ordered stops), recent detections list

### `WatchlistPanel.jsx` — Watchlist Management

**Props:** none

**Renders:** Header with "New List" / "Add Vehicle" buttons, create watchlist form, add entry form, watchlist selector, entries table

### `MapView.jsx` — Interactive Map

**Props:** `{ cameras, activeRoute, onCameraClick }`

**Renders:** Leaflet `MapContainer` (center: Gujarat 22.6°N 71.6°E, zoom 7), CARTO Dark Matter tiles, `CircleMarker` per camera, route `Polyline` with stop markers

### `RouteDetail.jsx` — Route Overlay

**Props:** `{ route, onClose }`

**Renders:** Absolute-positioned card with vehicle info and ordered list of stops (green=first, red=last)

### `LoginScreen.jsx` — Auth Login

**Props:** `{ onLoginSuccess }`

**Renders:** Full-screen centered card with Gujarat logo, department name, demo credentials, login form

---

## 25. Camera Player — Connection Strategy

### WebRTC (WHEP) Connection

```
1. Fetch SDP offer from WHEP URL
2. Create RTCPeerConnection
3. Set remote description (offer)
4. Create answer
5. Set local description (answer)
6. POST answer back to WHEP URL
7. Wait for ICE connection
8. On success → status = "live"
9. On timeout (8s) → fall back to HLS
```

### HLS Connection

```
1. Create hls.js instance
2. Load stream URL from local MediaMTX
3. On MANIFEST_PARSED → attach to <video>
4. On play → status = "live"
5. On fatal error → retry with CDN URL
```

### Reconnection Logic

```
1. On disconnect → status = "reconnecting"
2. Start countdown timer (2s base)
3. Exponential backoff: 2s, 4s, 8s, 16s, 30s (max)
4. Add jitter: ±500ms
5. On success → reset backoff
6. After 5 failures → status = "offline"
```

### Stall Detection

- Every 6 seconds, check `video.currentTime`
- If unchanged → increment stall count
- After 3 stalls → force reconnect

### Performance Metrics

- FPS measurement via `getVideoPlaybackQuality()`
- First-frame time measurement
- Reconnect count tracking
- Last error capture

---

## 26. Camera Grid — Layout Manager

### Grid Sizes

| Size | Slots | Tile Size |
|---|---|---|
| 1×1 | 1 | Full screen |
| 2×2 | 4 | 50% each |
| 3×3 | 9 | 33% each |
| 4×4 | 16 | 25% each |
| 5×5 | 25 | 20% each |

### Auto-Fill

When grid size changes, automatically fills slots from active cameras:
1. Gets list of cameras with `status === "active"`
2. Fills slots sequentially
3. Remaining slots set to `null`

### Focused Camera

Clicking expand on a camera tile opens fullscreen overlay:
- Sets `focusedCamera` state
- Renders `CameraPlayer` with `isFocused` prop
- Click outside or press Escape to close

---

## 27. Alert Management

### Alert Creation (Automatic)

Alerts are created automatically by the ANPR pipeline when a watchlist match is detected:

1. Detection ingested via `POST /api/v1/detections/anpr`
2. Plate normalized and watchlist checked
3. On match → `alerts` table row created with:
   - `event_type = "watchlist_match"`
   - `severity` computed from watchlist priority + match confidence
   - `status = "new"`
   - `detected_value` = plate number
   - `match_confidence` = 1.0 (exact) or 0.75-0.95 (fuzzy)

### Alert Severity Computation

**File:** `backend/app/core/matching.py` — `severity_for(priority, match_confidence)`

| Watchlist Priority | Exact Match | Fuzzy Match |
|---|---|---|
| `critical` | `critical` | `high` |
| `high` | `high` | `medium` |
| `medium` | `medium` | `low` |
| `low` | `low` | `low` |

### Alert Acknowledgment

**Endpoint:** `POST /api/v1/alerts/{id}/acknowledge`

- Sets `status = "acknowledged"`
- Sets `acknowledged_by` = current user ID
- Sets `acknowledged_at` = current timestamp
- Audit: `alert.acknowledge`

---

## 28. Watchlist System

### Watchlist Categories

| Category | Description |
|---|---|
| `stolen_vehicle` | Vehicles reported stolen |
| `blacklisted_vehicle` | Vehicles on blacklist |
| `wanted_person` | Wanted individuals |
| `missing_person` | Missing persons |
| `suspect` | Suspect vehicles/persons |

### Entry Priority Levels

| Priority | Color | Alert Severity |
|---|---|---|
| `critical` | Red | Critical/High |
| `high` | Orange | High/Medium |
| `medium` | Yellow | Medium/Low |
| `low` | Green | Low |

### Plate Normalization

**File:** `backend/app/core/matching.py` — `normalize_plate(raw_text)`

1. Strip all non-alphanumeric characters
2. Convert to uppercase
3. Result: `GJ01AB 1234` → `GJ01AB1234`

---

## 29. ANPR Detection Pipeline

**Endpoint:** `POST /api/v1/detections/anpr`

**File:** `backend/app/routers/detections.py`

### Pipeline Steps

```
1. Validate camera exists
        │
2. Normalize plate text (strip non-alphanumeric, uppercase)
        │
3. Temporal deduplication (30s window per camera+plate)
        │
4. Create/update canonical Vehicle record
        │
5. Create VehicleDetection link
        │
6. OCR confidence gate (>= 0.60)
        │
7. Watchlist matching
        │
        ├── Exact match (normalized plate == entry plate)
        │
        └── Fuzzy match (pg_trgm pre-filter → confusion-aware similarity)
        │
8. On match → Create Alert with computed severity
```

### Deduplication Window

- **Window:** 30 seconds
- **Key:** `camera_id + normalized_plate + time window`
- **Effect:** Same plate on same camera within 30s → skip watchlist check

### Response

```json
{
  "detection_id": "uuid",
  "normalized_plate": "GJ01AB1234",
  "deduplicated": false,
  "watchlist_match": true,
  "match_type": "exact",
  "alert_id": "uuid"
}
```

---

## 30. Plate Normalization & Matching

### Constants

| Constant | Value | Description |
|---|---|---|
| `MIN_OCR_CONFIDENCE_TO_MATCH` | 0.60 | Below this, skip watchlist lookup |
| `EXACT_MATCH_CONFIDENCE` | 1.0 | Exact match score |
| `FUZZY_MATCH_MIN_SIMILARITY` | 0.85 | Confusion-aware similarity threshold |
| `FUZZY_MATCH_MIN_OCR_CONFIDENCE` | 0.75 | Stricter OCR gate for fuzzy |
| `MIN_PLATE_LENGTH_FOR_FUZZY_MATCH` | 7 | Min chars for fuzzy |
| `FUZZY_CANDIDATE_POOL_SIZE` | 20 | SQL trigram pre-filter pool |
| `FUZZY_CANDIDATE_MIN_TRIGRAM_SIMILARITY` | 0.3 | Loose SQL threshold |

### Confusion-Aware Similarity

**File:** `backend/app/core/matching.py` — `confusion_aware_similarity(a, b)`

Edit-distance calculation where OCR-confusable character pairs are treated as zero-cost substitutions:

| Pair | Characters |
|---|---|
| `O` ↔ `0` | Letter O vs zero |
| `I` ↔ `1` | Letter I vs one |
| `B` ↔ `8` | Letter B vs eight |
| `S` ↔ `5` | Letter S vs five |
| `Z` ↔ `2` | Letter Z vs two |
| `G` ↔ `6` | Letter G vs six |

All other character mismatches are treated as effectively disqualifying (infinite cost).

### Match Flow

1. **OCR confidence gate:** If `ocr_confidence < 0.60` → skip entirely
2. **Exact match:** `normalized_plate == entry.registration_number` → score = 1.0
3. **Fuzzy match (if no exact):**
   - Gate: `ocr_confidence >= 0.75` AND `plate length >= 7`
   - SQL pre-filter: `pg_trgm` similarity >= 0.3 on top 20 candidates
   - Compute `confusion_aware_similarity` on each candidate
   - If best similarity >= 0.85 → fuzzy match

---

## 31. Vehicle Tracking & Route Reconstruction

### Vehicle Record Creation

When a new plate is detected:
1. Check if `vehicles` table has matching `registration_number`
2. If not → create new vehicle record with `first_seen_at` and `last_seen_at`
3. If yes → update `last_seen_at`

### Route Reconstruction

**Endpoint:** `GET /api/v1/vehicles/{registration_number}/route`

**Returns:**

```json
{
  "registration_number": "GJ01AB1234",
  "vehicle_type": "car",
  "color": "white",
  "first_seen_at": "2026-01-15T08:00:00Z",
  "last_seen_at": "2026-01-15T14:30:00Z",
  "total_detections": 12,
  "camera_sequence": ["cam01", "cam05", "cam12"],
  "route": [
    {
      "detection_id": "uuid",
      "timestamp": "2026-01-15T08:00:00Z",
      "camera_id": "uuid",
      "camera_code": "cam01",
      "camera_name": "01 Chiman bhai Bridge",
      "location_name": "Ahmedabad",
      "district": "Ahmedabad",
      "lat": 23.0225,
      "lng": 72.5714,
      "detection_confidence": 0.92,
      "ocr_confidence": 0.88,
      "evidence_uri": "file:///..."
    }
  ]
}
```

---

## 32. AI Worker

**Directory:** `ai-worker/`

**Purpose:** Captures RTSP frames from cameras, runs YOLO object detection + Tesseract OCR, posts ANPR detections to backend.

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| `ultralytics` | 8.3.0 | YOLOv8 inference |
| `opencv-python-headless` | 4.10.0 | RTSP frame capture |
| `pytesseract` | 0.3.12 | Tesseract OCR |
| `httpx` | 0.27.2 | Async HTTP client |
| `numpy` | 1.26.4 | Array operations |
| `tenacity` | 9.0.0 | Retry logic |
| `python-dotenv` | 1.0.1 | Environment loading |
| `Pillow` | 10.4.0 | Image processing |

### Entry Point

**File:** `ai-worker/main.py`

1. Loads environment variables
2. Creates `BackendClient` instance
3. Fetches camera list from backend
4. Starts `CameraWorker` for each camera
5. Runs asyncio event loop

---

## 33. AI Worker — Camera Worker

**File:** `ai-worker/camera_worker.py`

### Purpose

Captures RTSP frames from a single camera with retry logic.

### Frame Capture

```python
# Uses OpenCV with TCP transport
# Resizes to FRAME_WIDTH x FRAME_HEIGHT
# Returns frame as numpy array
```

### Retry Logic

- **Initial delay:** 1 second
- **Exponential backoff:** × 2 per failure
- **Max delay:** 60 seconds
- **Jitter:** ±20%
- **Transport:** TCP (forced)

### PTS Discontinuity Handling

Handles timestamp discontinuities in RTSP streams by resetting the capture when gaps are detected.

---

## 34. AI Worker — Detector

**File:** `ai-worker/detector.py`

### Purpose

Runs YOLOv8 object detection on captured frames.

### Model

- **Model:** YOLOv8n (nano) — auto-downloaded
- **Vehicle classes:** COCO IDs 2 (car), 3 (motorcycle), 5 (bus), 7 (truck)
- **Confidence threshold:** 0.35

### Output

Per detected object:
- Bounding box `[x1, y1, x2, y2]`
- Class ID
- Confidence score
- Class label

---

## 35. AI Worker — ANPR Module

**File:** `ai-worker/anpr.py`

### Purpose

Extracts license plate text from vehicle bounding boxes using Tesseract OCR.

### Plate Region Extraction

1. Takes vehicle bounding box `[x1, y1, x2, y2]`
2. Crops `y1 + 55%` to `y1 + 95%` of height (lower portion of vehicle)
3. Converts to grayscale
4. Applies thresholding
5. Runs Tesseract OCR

### Configuration

| Setting | Value |
|---|---|
| Language | `eng` |
| PSM mode | 7 (single line) |
| Min confidence | 0.30 |
| Plate-like regex | 6+ alphanumeric characters |

---

## 36. AI Worker — Pipeline

**File:** `ai-worker/pipeline.py`

### Purpose

Orchestrates detection → dedup → watchlist check → alert creation.

### Flow

```
1. Capture frame from camera
        │
2. Run YOLO detection
        │
3. For each detected vehicle:
        │
        ├── Extract plate region
        │
        ├── Run Tesseract OCR
        │
        ├── Check OCR confidence >= 0.30
        │
        └── Post to backend POST /api/v1/detections/anpr
                │
4. Backend handles:
        │
        ├── Plate normalization
        │
        ├── Temporal dedup (30s)
        │
        ├── Vehicle upsert
        │
        ├── Watchlist matching
        │
        └── Alert creation
```

---

## 37. AI Worker — Backend Client

**File:** `ai-worker/backend_client.py`

### Purpose

HTTP client for communicating with the backend API.

### Methods

| Method | Endpoint | Description |
|---|---|---|
| `get_cameras()` | `GET /api/v1/cameras` | Fetch all active cameras |
| `post_detection(detection)` | `POST /api/v1/detections/anpr` | Submit ANPR detection |

### Auth

- Uses `X-API-Key` header with `AI_WORKER_API_KEY`
- Backend validates against `settings.ai_worker_api_key`

### Retry

- 3 attempts with exponential backoff
- Timeout: 10 seconds per request

---

## 38. Sentinel Catalogue Integration

### Source

**URL:** `https://cctv.corp8.cloud/cameras.json` (CDN) or `http://103.250.160.189:9997/cameras.json` (API)

### Camera Format

```json
{
  "camId": "cam01",
  "name": "01 Chiman bhai Bridge",
  "cameraCode": "cam01",
  "secret": "...",
  "lat": 23.0225,
  "long": 72.5714,
  "ip": "192.168.1.100"
}
```

### Hardcoded Coordinates

| Camera | Latitude | Longitude | District |
|---|---|---|---|
| cam01 | 23.0225 | 72.5714 | Ahmedabad |
| cam02 | 23.0225 | 72.5714 | Ahmedabad |
| ... | ... | ... | ... |
| cam30 | 23.0225 | 72.5714 | Ahmedabad |

**Note:** All cameras use the same hardcoded coordinates in `_lookup_coords()`.

### District Heuristic

**Function:** `_guess_district(name)`

Maps camera names to districts:
- Contains "ahmedabad" → Ahmedabad
- Contains "surat" → Surat
- Contains "vadodara" → Vadodara
- Contains "rajkot" → Rajkot
- Default → "Unknown"

---

## 39. Map & GIS

### Leaflet Map

**File:** `dashboard/src/components/MapView.jsx`

- **Center:** Gujarat (22.6°N, 71.6°E)
- **Zoom:** 7
- **Tiles:** CARTO Dark Matter
- **API Key:** Hardcoded in tile URL

### Camera Markers

- `CircleMarker` per camera
- Color by status: green (active), red (inactive)
- Popup on click with camera info + "View Feed" button

### Route Overlay

- `Polyline` for vehicle route (dashed, teal)
- Custom `DivIcon` markers:
  - Green: First stop
  - Red: Last stop
  - Gray: Intermediate stops

### Camera Location Data

**Endpoint:** `GET /api/v1/cameras/gis`

Returns: `{ id, camera_code, name, district, status, latitude, longitude, is_public_domain }`

---

## 40. UI Design System

### CSS Variables

**File:** `dashboard/src/index.css`

#### Colors

| Variable | Value | Usage |
|---|---|---|
| `--bg-primary` | `#0a0f1a` | Main background |
| `--bg-secondary` | `#111827` | Card background |
| `--bg-tertiary` | `#1f2937` | Elevated surface |
| `--border-primary` | `#1e293b` | Default border |
| `--border-secondary` | `#334155` | Hover border |
| `--text-primary` | `#f1f5f9` | Primary text |
| `--text-secondary` | `#94a3b8` | Secondary text |
| `--text-muted` | `#64748b` | Muted text |
| `--accent-blue` | `#2563eb` | Primary accent |
| `--accent-green` | `#10b981` | Success/online |
| `--accent-red` | `#ef4444` | Error/alert |
| `--accent-yellow` | `#f59e0b` | Warning |
| `--accent-cyan` | `#06b6d4` | Info |

#### Layout

| Variable | Value |
|---|---|
| `--sidebar-width` | `200px` |
| `--topbar-height` | `52px` |

#### Typography

| Variable | Value |
|---|---|
| `--font-ui` | `"Inter", -apple-system, sans-serif` |
| `--font-mono` | `"JetBrains Mono", monospace` |

#### Border Radius

| Variable | Value |
|---|---|
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `8px` |

#### Animations

| Name | Keyframes |
|---|---|
| `spin` | 0% → 360deg rotation |
| `pulse` | Opacity 1 → 0.5 → 1 |
| `fadeIn` | Opacity 0 → 1 |

---

## 41. Login & Authentication Flow

### Login Screen

**File:** `dashboard/src/components/LoginScreen.jsx`

1. Full-screen centered card with Gujarat Police logo
2. Department name: "Government of Gujarat · Home Department"
3. Demo credentials displayed (admin/admin123)
4. Username/password inputs
5. Error message on failure
6. Sign In button

### Authentication Flow

```
1. User enters credentials
        │
2. POST /api/v1/auth/login (form-urlencoded)
        │
3. Backend validates credentials
        │
4. Backend creates JWT with {sub, role, department_id, iat, exp}
        │
5. Returns { access_token }
        │
6. Frontend stores token in localStorage
        │
7. Frontend calls GET /api/v1/auth/me
        │
8. Backend decodes JWT, returns user info
        │
9. Frontend sets isAuthenticated=true, currentUser
        │
10. App renders main dashboard
```

### Token Expiry

- **Lifetime:** 8 hours (480 minutes)
- **On expiry:** 401 response → token removed → `cctv-auth-expired` event → forced logout

---

## 42. Audit Logging

### Function

**File:** `backend/app/core/audit.py` — `write_audit_log(db, user_id, action, resource_type?, resource_id?, ip_address?, details?)`

### Behavior

- Inserts `AuditLog` row atomically with the caller's transaction
- No commit — relies on caller's transaction commit
- Append-only — no update or delete endpoints

### Audit Actions

| Action | Router | Trigger |
|---|---|---|
| `auth.login_success` | auth.py | Successful login |
| `auth.login_failed` | auth.py | Failed login |
| `user.create` | auth.py | New user created |
| `camera.onboard` | cameras.py | Camera onboarded |
| `camera.bulk_import` | cameras.py | CSV bulk import |
| `alert.acknowledge` | alerts.py | Alert acknowledged |
| `watchlist_entry.create` | watchlist.py | Watchlist entry created |

### Viewing

**Endpoint:** `GET /api/v1/audit-logs`

- Query params: `action`, `user_id`, `resource_type`, `limit` (max 500)
- Auth: admin or auditor role only

---

## 43. Roles & Permissions (RBAC)

### Role Definitions

| Role | Description |
|---|---|
| `admin` | Full system access. Create users, cameras, departments. Acknowledge alerts. View audit logs. |
| `operator` | Onboard cameras, bulk import, health checks, acknowledge alerts. Cannot create users. |
| `viewer` | Read-only access to cameras, alerts, detections. Cannot modify anything. |
| `auditor` | Read-only + audit log access. Cannot modify cameras or alerts. |
| `service` | AI worker service account. Can ingest detections via API key auth. |

### Department Scoping

- Non-admin/operator users only see data for their `department_id`
- Admins, auditors, and service accounts bypass department scoping
- `UNRESTRICTED_ROLES = {"admin", "auditor", "service"}`

### Route-Level Enforcement

```python
# Example from cameras.py
@router.post("/", response_model=schemas.CameraOut, status_code=201)
async def onboard_camera(
    camera_in: schemas.CameraCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin", "operator"))
):
    ...
```

---

## 44. Docker Build & Deployment

### Dockerfiles

| Service | Base Image | Build | Entrypoint |
|---|---|---|---|
| `backend` | `python:3.11-slim` | Install libgl1, libglib2.0, pip install | `uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| `ai-worker` | `python:3.11-slim` | Install tesseract, opencv, pip install | `python main.py` |
| `stream-gateway` | `bluenviron/mediamtx:latest` | Copy mediamtx.yml | MediaMTX server |
| `gateway-sync` | `python:3.11-slim` | pip install httpx, tenacity, pyyaml | `python gateway_sync.py` |
| `dashboard` | `node:20-slim` | npm install | `npx vite --host 0.0.0.0 --port 5173` |

### Build Commands

```bash
# Build all services
docker compose build

# Build specific service
docker compose build backend

# Rebuild without cache
docker compose build --no-cache
```

### Production Considerations

- **Dashboard:** Currently runs Vite dev server in Docker (no `vite build`). For production, use `vite build` + nginx.
- **CORS:** Set to `allow_origins=["*"]` — restrict in production.
- **Secrets:** Change all default passwords and API keys.
- **HTTPS:** Add TLS termination via reverse proxy (nginx, traefik).

---

## 45. Seed Scripts

### `backend/seed_admin.py`

Creates the first admin user directly in the database.

```bash
python seed_admin.py --username admin --email admin@example.gov.in --password admin123
```

**Prerequisites:** Roles table must be seeded (by schema.sql).

### `backend/seed_watchlist_and_alert.py`

Creates demo watchlist and triggers a test alert.

1. Creates "Gujarat Stolen & Suspect Vehicles" watchlist
2. Adds entry for `GJ01AB1234` (critical priority)
3. Adds entry for `GJ27XX9999` (high priority, for fuzzy match)
4. Triggers detection via `POST /api/v1/detections/anpr`
5. Generates critical alert

### `backend/sentinel_onboard.py`

Batch onboarding from Sentinel catalogue.

```bash
python sentinel_onboard.py \
  --sentinel-host 103.250.160.189 \
  --admin-username admin \
  --admin-password admin123 \
  --department-id <uuid>
```

### `backend/setup_cameras.py`

One-shot full setup:

1. Creates "Gujarat Police" department
2. Ensures admin user exists
3. Fetches Sentinel catalogue
4. Onboards/updates cameras with authenticated RTSP URLs
5. Activates all cameras

---

## 46. Known Issues & Technical Debt

### Critical

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | Dockerfile runs Vite dev server | `dashboard/Dockerfile` | No production build, dev tools exposed |
| 2 | CORS `allow_origins=["*"]` | `main.py` | Any origin can access API |
| 3 | Hardcoded admin fallback password | `routers/auth.py:50-52` | Unauthorized access |
| 4 | No rate limiting on login | `routers/auth.py` | Brute force attacks |

### High

| # | Issue | Location | Impact |
|---|---|---|---|
| 5 | Hardcoded camera IP `192.168.1.210:90` | `CameraPlayer.jsx:270` | Wrong IP shown in overlay |
| 6 | Hardcoded credentials in `.env` | `.env` | Secret exposure in repo |
| 7 | Weak JWT_SECRET_KEY default | `config.py` | Token forgery |

### Medium

| # | Issue | Location | Impact |
|---|---|---|---|
| 8 | Redis defined but unused | `docker-compose.yml` | Resource waste |
| 9 | `LiveVideoPlayer.jsx` dead code | `components/` | Unused component |
| 10 | `VehicleSearch.jsx` dead code | `components/` | Unused component |
| 11 | No error boundaries | All components | Single crash brings down app |
| 12 | 5s polling for cameras + alerts | `App.jsx` | Network overhead |
| 13 | No deep linking / browser history | `App.jsx` | No URL-based navigation |
| 14 | Hardcoded stats (NVRS 2/2) | `Home.jsx` | Static data |
| 15 | Sample FPS config drift | Multiple files | Inconsistent behavior |
| 16 | Hardcoded Carto API key | `MapView.jsx:9` | Key exposure |

### Low

| # | Issue | Location | Impact |
|---|---|---|---|
| 17 | No loading skeletons | All components | UX |
| 18 | Inline styles everywhere | All components | Maintainability |
| 19 | Token in localStorage | `LoginScreen.jsx` | XSS vulnerability |
| 20 | No CSS modules | All components | Style conflicts |
| 21 | ANPR plate region hardcoded | `anpr.py` | May fail on different plate positions |
| 22 | `_PLATE_LIKE` regex requires 6+ chars | `anpr.py` | Misses short plates like `GJ01` |

---

## 47. Troubleshooting

### Backend won't start

```bash
# Check PostgreSQL is running
docker compose logs db

# Check database connection
docker compose exec backend python -c "from app.database import engine; import asyncio; print(asyncio.run(engine.connect()))"

# Reinitialize database
docker compose exec backend python init_db.py
```

### Cameras show offline

```bash
# Check Sentinel connectivity
docker compose exec backend curl -s http://103.250.160.189:9997/v3/paths/list

# Check MediaMTX is running
docker compose logs stream-gateway

# Manually sync cameras
docker compose exec backend python -c "from app.main import *; from app.database import get_db; import asyncio; db = asyncio.run(get_db()); print(asyncio.run(sync_catalogue_internal(db)))"
```

### HLS streams not loading

```bash
# Check MediaMTX HLS server
curl http://localhost:8888/

# Check camera path exists
curl http://localhost:9997/v3/paths/list | jq

# Test HLS directly
curl -I http://localhost:8888/cam01/index.m3u8
```

### WebRTC not connecting

```bash
# Check WHEP endpoint
curl -X POST http://localhost:8889/stream/cam01/whep

# Check backend WHEP proxy
curl -X POST http://localhost:8000/api/v1/cameras/cam01/whep -d "sdp=..."

# Check Sentinel upstream
curl -X POST http://103.250.160.189:8889/stream/cam01/whep
```

### AI Worker not detecting

```bash
# Check worker logs
docker compose logs ai-worker

# Test RTSP stream access
docker compose exec ai-worker python -c "import cv2; cap = cv2.VideoCapture('rtsp://...'); print(cap.read())"

# Check YOLO model download
docker compose exec ai-worker python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

### Database connection issues

```bash
# Check PostgreSQL is healthy
docker compose ps db

# Check connection string
docker compose exec backend python -c "from app.core.config import settings; print(settings.database_url)"

# Test connection
docker compose exec db psql -U cctv_user -d cctv_platform -c "SELECT 1"
```

### Build failures

```bash
# Clean build
docker compose down -v
docker compose build --no-cache
docker compose up -d

# Check Docker disk usage
docker system df

# Prune unused images
docker image prune -f
```

### Port conflicts

```bash
# Check what's using ports
netstat -tlnp | grep -E '5173|8000|5432|8554|8888|8889'

# Kill process on port
lsof -ti:8000 | xargs kill -9
```

---

**Document version:** 1.0
**Last updated:** September 2026
**Platform:** Gujarat CCTV Platform v1.0 — Government of Gujarat, Home Department
