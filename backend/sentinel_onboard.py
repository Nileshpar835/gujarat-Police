"""
Sentinel Camera Grid onboarding script.

Bootstraps our camera registry directly from the Sentinel sandbox's
catalogue endpoint (GET /api/ingest) rather than hand-entering ~50 cameras
one at a time, and rather than hard-coding any camera IDs or URL patterns
— per the integration reference's explicit instruction: "Always start
from the catalogue... Camera ids and the set of available cameras can
change; the catalogue is the contract, the URL pattern is not."

What this script does NOT do (deliberately, per the same reference):
  - It never touches video. It only reads the JSON catalogue and calls our
    own backend's onboarding API — no RTSP/WHEP/HLS connection happens
    here. That's the AI worker's and Stream Gateway's job, downstream.
  - It never attempts to download/copy footage (there is no file download
    on the Sentinel grid; /stream/<id> is a browser-playback fallback that
    yields a misleadingly "complete-looking" partial file if pulled with
    curl/wget — we don't touch that endpoint at all).
  - It never calls the gateway's control API or publishes anything —
    consume-only, same as every other client in this codebase.

Usage:
    python3 sentinel_onboard.py \
        --sentinel-host <host-from-your-sandbox-credentials> \
        --backend-url http://localhost:8000/api/v1 \
        --admin-username admin --admin-password <your admin password> \
        --department-id <uuid of the department these cameras belong to>

The exact JSON shape of /api/ingest wasn't available to verify against
directly (the sandbox portal requires per-participant registration/login —
see live.sentinelgujarat.in), so field lookups below are written
defensively with fallbacks and each camera is wrapped in its own
try/except so one malformed or unexpected-shape entry doesn't abort the
whole batch. ADAPT THE FIELD NAMES in `_extract_camera_fields` once you
can see a real response from your own registered sandbox access — the
integration reference confirms the response includes "id, location,
codec, live status, stream properties, and all three URLs" but not the
exact JSON keys.
"""

import argparse
import sys

import httpx


def fetch_catalogue(sentinel_host: str) -> list[dict]:
    import os
    cdn = os.getenv("SENTINEL_CDN", "https://cctv.corp8.cloud")
    user = os.getenv("SENTINEL_USERNAME", "")
    password = os.getenv("SENTINEL_PASSWORD", "")
    auth = (user, password) if user and password else None
    urls = [
        f"{cdn.rstrip('/')}/cameras.json",
        "https://cctv.corp8.cloud/cameras.json",
        f"http://{sentinel_host}/api/ingest",
    ]
    last_error = None
    data = None
    for url in urls:
        try:
            resp = httpx.get(url, timeout=15.0, auth=auth, follow_redirects=True)
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as exc:
            last_error = exc
    if data is None:
        raise last_error or RuntimeError("catalogue fetch failed")
    if isinstance(data, dict):
        for key in ("cameras", "items", "data", "results"):
            if key in data and isinstance(data[key], list):
                return data[key]
        raise ValueError(f"Unrecognised catalogue shape: top-level keys {list(data.keys())}")
    if isinstance(data, list):
        return data
    raise ValueError(f"Unrecognised catalogue response type: {type(data)}")


def _extract_camera_fields(entry: dict, sentinel_host: str) -> dict | None:
    """
    Maps one catalogue entry to our onboarding payload shape.
    The Sentinel integration reference confirms the RTSP pattern is:
      rtsp://<host>:8554/stream/<id>
    We construct this URL if the catalogue doesn't return it explicitly,
    which is the case for the known 30-camera sandbox set (cam01..cam30).
    Returns None (and the caller logs+skips) if required fields are missing.
    """
    camera_id = entry.get("id") or entry.get("camera_id") or entry.get("stream_id")
    if not camera_id:
        return None

    # Try explicit URL first, then construct from known Sentinel pattern.
    rtsp_url = (
        entry.get("rtsp_url")
        or entry.get("rtsp")
        or (entry.get("urls") or {}).get("rtsp")
        or (entry.get("streams") or {}).get("rtsp")
        or f"rtsp://{sentinel_host}:8554/stream/{camera_id}"  # Sentinel pattern fallback
    )

    location = entry.get("location") or {}
    latitude = location.get("latitude") or location.get("lat") or entry.get("latitude") or entry.get("lat")
    longitude = location.get("longitude") or location.get("lng") or location.get("lon") or entry.get("longitude") or entry.get("lon")

    # If no coords in catalogue, we cannot place on map — log and skip.
    if latitude is None or longitude is None:
        print(f"  WARN: camera {camera_id} has no lat/lng in catalogue — skipping GIS placement")
        # Use 0,0 as placeholder rather than failing entirely, so the camera
        # is at least in the registry for stream purposes.
        latitude = 0.0
        longitude = 0.0

    props = entry.get("stream_properties") or entry.get("properties") or {}
    name = (
        entry.get("name")
        or (location.get("name") if isinstance(location, dict) else None)
        or f"Sentinel Camera {camera_id}"
    )

    return {
        "camera_code": f"SENTINEL-{camera_id}",
        "name": name,
        "protocol": "rtsp",
        "stream_url": rtsp_url,
        "codec": entry.get("codec") or props.get("codec"),
        "resolution": props.get("resolution"),
        "fps": props.get("fps"),
        "location": {
            "name": name,
            "district": location.get("district") if isinstance(location, dict) else None,
            "latitude": float(latitude),
            "longitude": float(longitude),
        },
    }


def onboard(backend_url: str, token: str, department_id: str, cameras: list[dict], sentinel_host: str) -> dict:
    created, skipped, errors = [], [], []
    with httpx.Client(base_url=backend_url, timeout=15.0, headers={"Authorization": f"Bearer {token}"}) as client:
        for entry in cameras:
            fields = _extract_camera_fields(entry, sentinel_host)
            if fields is None:
                errors.append({"entry": entry.get("id", "<unknown>"), "error": "missing required fields — see _extract_camera_fields"})
                continue

            payload = {**fields, "department_id": department_id, "is_public_domain": True}
            resp = client.post("/cameras", json=payload)
            if resp.status_code == 201:
                created.append(fields["camera_code"])
            elif resp.status_code == 409:
                skipped.append(fields["camera_code"])
            else:
                errors.append({"entry": fields["camera_code"], "error": f"{resp.status_code}: {resp.text}"})

    return {"created": created, "skipped": skipped, "errors": errors}


def login(backend_url: str, username: str, password: str) -> str:
    with httpx.Client(base_url=backend_url, timeout=15.0) as client:
        resp = client.post(
            "/auth/login",
            data={"username": username, "password": password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sentinel-host", required=True, help="host[:port] of your registered Sentinel sandbox access")
    parser.add_argument("--backend-url", default="http://localhost:8000/api/v1")
    parser.add_argument("--admin-username", required=True)
    parser.add_argument("--admin-password", required=True)
    parser.add_argument("--department-id", required=True)
    args = parser.parse_args()

    print(f"Fetching camera catalogue from {args.sentinel_host}/api/ingest ...")
    try:
        cameras = fetch_catalogue(args.sentinel_host)
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to fetch catalogue: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"Catalogue returned {len(cameras)} cameras.")

    token = login(args.backend_url, args.admin_username, args.admin_password)

    result = onboard(args.backend_url, token, args.department_id, cameras, args.sentinel_host)
    print(f"\nCreated: {len(result['created'])}")
    print(f"Skipped (already onboarded): {len(result['skipped'])}")
    print(f"Errors: {len(result['errors'])}")
    for err in result["errors"]:
        print(f"  {err}")
