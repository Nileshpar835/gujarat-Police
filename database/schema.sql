-- =====================================================================
-- Gujarat CCTV Hackathon 2026 — Core Database Schema
-- PostgreSQL 15+ with PostGIS extension
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- for fuzzy plate matching (Section 8)

-- ---------------------------------------------------------------------
-- RBAC: roles & users
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) UNIQUE NOT NULL,        -- e.g. 'admin', 'operator', 'viewer', 'auditor'
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(150) NOT NULL,
    code            VARCHAR(20) UNIQUE NOT NULL,         -- e.g. 'HOME', 'RTO', 'FCS'
    description     TEXT,
    contact_email   VARCHAR(150),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(100) UNIQUE NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    department_id   UUID REFERENCES departments(id),     -- scoping: NULL = state-level access
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- VMS systems & camera registry (Model 1 foundation)
-- ---------------------------------------------------------------------
CREATE TABLE vms_systems (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(150) NOT NULL,
    vendor          VARCHAR(100),
    adapter_type    VARCHAR(50) NOT NULL,                -- 'rtsp_generic', 'onvif_generic', 'vendor_sdk_x', ...
    department_id   UUID NOT NULL REFERENCES departments(id),
    base_url        VARCHAR(255),                        -- VMS management endpoint, if applicable
    auth_config_ref VARCHAR(255),                         -- reference/key into secrets manager, NEVER plaintext creds
    storage_type    VARCHAR(20) CHECK (storage_type IN ('cloud','local','hybrid')),
    retention_days  INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE locations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(150) NOT NULL,
    district        VARCHAR(100),
    address         TEXT,
    geom            GEOGRAPHY(POINT, 4326) NOT NULL,       -- lat/long
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_locations_geom ON locations USING GIST (geom);

CREATE TABLE cameras (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    camera_code         VARCHAR(50) UNIQUE NOT NULL,       -- human-readable ID e.g. 'AMD-TRF-014'
    name                VARCHAR(150) NOT NULL,
    department_id       UUID NOT NULL REFERENCES departments(id),
    vms_system_id       UUID REFERENCES vms_systems(id),
    location_id         UUID NOT NULL REFERENCES locations(id),
    camera_type         VARCHAR(50),                       -- 'fixed', 'ptz', 'anpr-dedicated'
    protocol            VARCHAR(20) NOT NULL,               -- 'rtsp', 'onvif', 'vendor_api'
    stream_url          VARCHAR(500),                       -- resolved at onboarding; may be re-resolved by adapter
    onvif_endpoint      VARCHAR(255),
    resolution          VARCHAR(20),                        -- e.g. '1920x1080'
    fps                 INTEGER,
    codec               VARCHAR(20),                        -- 'h264','h265'
    status              VARCHAR(20) NOT NULL DEFAULT 'inactive'
                            CHECK (status IN ('active','inactive','maintenance','decommissioned')),
    is_public_domain    BOOLEAN NOT NULL DEFAULT true,       -- public-domain vs internal (Food/RTO office cams)
    onboarded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cameras_department ON cameras(department_id);
CREATE INDEX idx_cameras_status ON cameras(status);

CREATE TABLE camera_health (
    id              BIGSERIAL PRIMARY KEY,
    camera_id       UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_reachable    BOOLEAN NOT NULL,
    latency_ms      INTEGER,
    error_message   TEXT
);
CREATE INDEX idx_camera_health_camera_time ON camera_health(camera_id, checked_at DESC);

-- ---------------------------------------------------------------------
-- Vehicles & detections
-- ---------------------------------------------------------------------
CREATE TABLE vehicles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number VARCHAR(20) UNIQUE NOT NULL,        -- normalised plate, e.g. 'GJ01AB1234'
    vehicle_type        VARCHAR(30),                        -- 'car','truck','two-wheeler', etc.
    make                VARCHAR(50),
    model                VARCHAR(50),
    color                VARCHAR(30),
    first_seen_at        TIMESTAMPTZ,
    last_seen_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicles_reg_trgm ON vehicles USING GIN (registration_number gin_trgm_ops);

CREATE TABLE detections (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    camera_id           UUID NOT NULL REFERENCES cameras(id),
    detection_type       VARCHAR(30) NOT NULL,               -- 'anpr', 'vehicle', 'person'
    raw_value            VARCHAR(255),                       -- raw OCR text / class label before normalisation
    normalized_value      VARCHAR(255),                      -- normalised plate text, if applicable
    detection_confidence  NUMERIC(4,3),                      -- object detector confidence 0-1
    ocr_confidence         NUMERIC(4,3),                      -- ANPR OCR confidence 0-1
    vehicle_type           VARCHAR(30),
    vehicle_color           VARCHAR(30),
    bounding_box             JSONB,                           -- {x,y,w,h} in source frame
    evidence_uri              VARCHAR(500),                   -- object storage reference (image/clip)
    video_timestamp_ref        VARCHAR(100),                  -- offset/reference into source recording, if available
    detected_at                 TIMESTAMPTZ NOT NULL,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_detections_camera_time ON detections(camera_id, detected_at DESC);
CREATE INDEX idx_detections_normalized_value ON detections(normalized_value);
CREATE INDEX idx_detections_normalized_trgm ON detections USING GIN (normalized_value gin_trgm_ops);

CREATE TABLE vehicle_detections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    detection_id    UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
    match_confidence NUMERIC(4,3) NOT NULL,                   -- confidence that detection == vehicle (exact vs fuzzy)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(vehicle_id, detection_id)
);
CREATE INDEX idx_vehicle_detections_vehicle ON vehicle_detections(vehicle_id);

-- ---------------------------------------------------------------------
-- Watchlists
-- ---------------------------------------------------------------------
CREATE TABLE watchlists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(150) NOT NULL,                    -- e.g. 'Stolen Vehicles - Ahmedabad Zone'
    category        VARCHAR(50) NOT NULL,                     -- 'stolen_vehicle','wanted_person','missing_person','blacklisted_vehicle','suspect'
    source_system   VARCHAR(50),                              -- 'representative_demo','VAHAN','eGujCop', ... (future-ready)
    owner_department_id UUID REFERENCES departments(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE watchlist_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watchlist_id        UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    entity_type          VARCHAR(20) NOT NULL CHECK (entity_type IN ('vehicle','person')),
    registration_number   VARCHAR(20),                        -- for vehicle entries (normalised)
    vehicle_type            VARCHAR(30),
    make                      VARCHAR(50),
    model                      VARCHAR(50),
    color                       VARCHAR(30),
    person_name                  VARCHAR(150),                 -- for person entries
    identifying_details            TEXT,
    status                          VARCHAR(20) NOT NULL DEFAULT 'active'
                                        CHECK (status IN ('active','resolved','expired')),
    priority                         VARCHAR(20) NOT NULL DEFAULT 'medium'
                                        CHECK (priority IN ('critical','high','medium','low')),
    notes                             TEXT,
    created_date                       DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date                         DATE,
    created_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_watchlist_entries_reg ON watchlist_entries(registration_number);
CREATE INDEX idx_watchlist_entries_reg_trgm ON watchlist_entries USING GIN (registration_number gin_trgm_ops);
CREATE INDEX idx_watchlist_entries_status ON watchlist_entries(status);

-- ---------------------------------------------------------------------
-- Alerts (structured event schema per HLD Section 10)
-- ---------------------------------------------------------------------
CREATE TABLE alerts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type           VARCHAR(50) NOT NULL,                 -- 'watchlist_match', 'system', ...
    camera_id             UUID REFERENCES cameras(id),
    detection_id            UUID REFERENCES detections(id),
    entity_type               VARCHAR(20),                     -- 'vehicle','person'
    entity_id                  UUID,                            -- vehicle_id or watchlist_entries.id
    detected_value               VARCHAR(255),
    watchlist_entry_id             UUID REFERENCES watchlist_entries(id),
    match_confidence                 NUMERIC(4,3),
    severity                          VARCHAR(20) NOT NULL
                                          CHECK (severity IN ('critical','high','medium','low')),
    location_id                        UUID REFERENCES locations(id),
    evidence_uri                        VARCHAR(500),
    status                               VARCHAR(20) NOT NULL DEFAULT 'new'
                                            CHECK (status IN ('new','acknowledged','resolved','false_positive')),
    acknowledged_by                      UUID REFERENCES users(id),
    acknowledged_at                       TIMESTAMPTZ,
    triggered_at                           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_triggered_at ON alerts(triggered_at DESC);
CREATE INDEX idx_alerts_severity ON alerts(severity);

-- ---------------------------------------------------------------------
-- Generic events & audit logs
-- ---------------------------------------------------------------------
CREATE TABLE events (
    id              BIGSERIAL PRIMARY KEY,
    event_type      VARCHAR(50) NOT NULL,                     -- 'camera_onboarded','adapter_reconnected', ...
    source           VARCHAR(100),
    payload           JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,                    -- 'login','camera.create','alert.acknowledge', ...
    resource_type   VARCHAR(50),
    resource_id     VARCHAR(100),
    ip_address      INET,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_user_time ON audit_logs(user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Seed reference data
-- ---------------------------------------------------------------------
INSERT INTO roles (name, description) VALUES
    ('admin', 'Full system access'),
    ('operator', 'Monitor cameras, acknowledge alerts, search vehicles'),
    ('viewer', 'Read-only dashboard access'),
    ('auditor', 'Read-only access to audit logs and reports');
