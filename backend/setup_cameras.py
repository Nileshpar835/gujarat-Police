"""
One-shot camera onboarding script.

Does everything in one command:
  1. Creates a "Gujarat Police" department (if none exists)
  2. Gets the admin user from DB and mints a short-lived JWT
     (no password needed — runs inside the trusted container)
  3. Fetches the Sentinel camera catalogue from /api/ingest
  4. Onboards all cameras to the backend registry
  5. Prints a summary

Usage (run inside cctv_backend container):
    python3 setup_cameras.py

Or with custom Sentinel host:
    python3 setup_cameras.py --sentinel-host live.sentinelgujarat.in

After this completes:
  - Cameras appear in the sidebar (status=active)
  - gateway_sync registers them in MediaMTX within 30s
  - AI worker starts processing their RTSP streams
"""

import argparse
import asyncio
import sys
import httpx

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User, Role, Department
from app.core.security import create_access_token

DEFAULT_SENTINEL_HOST = "live.sentinelgujarat.in"
BACKEND_URL = "http://localhost:8000/api/v1"

# Known Sentinel camera list (cam01–cam30) from the hackathon sandbox.
# Coordinates are approximate locations for the named intersections.
KNOWN_CAMERAS = [
    {"id": "cam01", "name": "01 Chiman bhai Bridge",     "lat": 23.0395, "lng": 72.5569},
    {"id": "cam02", "name": "02 Janpath",                "lat": 23.0225, "lng": 72.5714},
    {"id": "cam03", "name": "03 Relief Road",            "lat": 23.0262, "lng": 72.5762},
    {"id": "cam04", "name": "04 Sardar Patel Statue",    "lat": 23.1083, "lng": 72.5826},
    {"id": "cam05", "name": "05 Ashram Road",            "lat": 23.0314, "lng": 72.5631},
    {"id": "cam06", "name": "06 CG Road",                "lat": 23.0359, "lng": 72.5560},
    {"id": "cam07", "name": "07 Navrangpura",            "lat": 23.0421, "lng": 72.5564},
    {"id": "cam08", "name": "08 Paldi",                  "lat": 23.0074, "lng": 72.5739},
    {"id": "cam09", "name": "09 Maninagar",              "lat": 22.9953, "lng": 72.6019},
    {"id": "cam10", "name": "10 Vatva GIDC",             "lat": 22.9614, "lng": 72.6356},
    {"id": "cam11", "name": "11 Sarkhej",                "lat": 22.9908, "lng": 72.4997},
    {"id": "cam12", "name": "12 SG Highway",             "lat": 23.0498, "lng": 72.5076},
    {"id": "cam13", "name": "13 Prahlad Nagar",          "lat": 23.0289, "lng": 72.5053},
    {"id": "cam14", "name": "14 Bopal",                  "lat": 23.0348, "lng": 72.4689},
    {"id": "cam15", "name": "15 Chandkheda",             "lat": 23.1058, "lng": 72.5934},
    {"id": "cam16", "name": "16 Gandhinagar Sector 11",  "lat": 23.2156, "lng": 72.6369},
    {"id": "cam17", "name": "17 Gandhinagar Sector 21",  "lat": 23.2220, "lng": 72.6540},
    {"id": "cam18", "name": "18 Surat Ring Road",        "lat": 21.2010, "lng": 72.8450},
    {"id": "cam19", "name": "19 Surat Adajan",           "lat": 21.2247, "lng": 72.7945},
    {"id": "cam20", "name": "20 Surat Udhna",            "lat": 21.1784, "lng": 72.8578},
    {"id": "cam21", "name": "21 Vadodara RC Dutt Road",  "lat": 22.3189, "lng": 73.1765},
    {"id": "cam22", "name": "22 Vadodara Alkapuri",      "lat": 22.3097, "lng": 73.1794},
    {"id": "cam23", "name": "23 Vadodara Akota",         "lat": 22.3162, "lng": 73.1630},
    {"id": "cam24", "name": "24 Rajkot Kalawad Road",    "lat": 22.2920, "lng": 70.7796},
    {"id": "cam25", "name": "25 Rajkot 150 Ft Ring Road","lat": 22.2965, "lng": 70.7889},
    {"id": "cam26", "name": "26 Bhavnagar Station",      "lat": 21.7645, "lng": 72.1519},
    {"id": "cam27", "name": "27 Jamnagar Highway",       "lat": 22.4673, "lng": 70.0577},
    {"id": "cam28", "name": "28 Anand Crossroads",       "lat": 22.5645, "lng": 72.9289},
    {"id": "cam29", "name": "29 Nadiad Bus Stand",       "lat": 22.6933, "lng": 72.8640},
    {"id": "cam30", "name": "30 Mehsana Highway",        "lat": 23.5879, "lng": 72.3693},
]


async def get_or_create_department(db) -> str:
    """Return department ID — creates 'Gujarat Police' if none exists."""
    result = await db.execute(select(Department))
    dept = result.scalars().first()
    if dept:
        print(f"  Using existing department: {dept.name} ({dept.id})")
        return str(dept.id)

    dept = Department(
        name="Gujarat Police",
        code="GUJ_POL",
        description="Gujarat Police Home Department — CCTV Command Centre",
        contact_email="cctv@gujaratpolice.gov.in",
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    print(f"  Created department: {dept.name} ({dept.id})")
    return str(dept.id)


async def mint_admin_token(db) -> str:
    """Get admin user from DB and mint a JWT — no password needed (trusted container)."""
    result = await db.execute(
        select(User).join(Role, User.role_id == Role.id).where(Role.name == "admin")
    )
    admin = result.scalars().first()
    if not admin:
        print("ERROR: No admin user found. Run seed_admin.py first.", file=sys.stderr)
        sys.exit(1)
    token = create_access_token(str(admin.id), "admin", None)
    print(f"  Minted JWT for admin user: {admin.username}")
    return token


def fetch_sentinel_catalogue(sentinel_host: str) -> list[dict]:
    """Try the Sentinel /api/ingest endpoint; fall back to known camera list."""
    url = f"https://{sentinel_host}/api/ingest"
    print(f"  Fetching catalogue from {url} ...")
    try:
        resp = httpx.get(url, timeout=10.0, follow_redirects=True)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                print(f"  Got {len(data)} cameras from Sentinel API.")
                return data
            for key in ("cameras", "items", "data", "results"):
                if isinstance(data, dict) and key in data and isinstance(data[key], list):
                    print(f"  Got {len(data[key])} cameras from Sentinel API.")
                    return data[key]
        print(f"  Sentinel API returned {resp.status_code} — using built-in 30-camera list.")
    except Exception as e:
        print(f"  Could not reach Sentinel API ({e}) — using built-in 30-camera list.")

    # Convert known camera list to the expected format
    return [
        {
            "id": c["id"],
            "name": c["name"],
            "latitude": c["lat"],
            "longitude": c["lng"],
        }
        for c in KNOWN_CAMERAS
    ]


def build_camera_payload(entry: dict, sentinel_host: str, department_id: str) -> dict | None:
    """Build the POST /cameras payload from a catalogue entry."""
    camera_id = entry.get("id") or entry.get("camera_id") or entry.get("stream_id")
    if not camera_id:
        return None

    rtsp_url = (
        entry.get("rtsp_url")
        or entry.get("rtsp")
        or (entry.get("urls") or {}).get("rtsp")
        or (entry.get("streams") or {}).get("rtsp")
        or f"rtsp://{sentinel_host}:8554/stream/{camera_id}"
    )

    lat = entry.get("latitude") or entry.get("lat") or (entry.get("location") or {}).get("lat") or 0.0
    lng = entry.get("longitude") or entry.get("lng") or entry.get("lon") or (entry.get("location") or {}).get("lng") or 0.0

    name = entry.get("name") or f"Sentinel Camera {camera_id}"
    district = (entry.get("location") or {}).get("district") or _guess_district(name)

    return {
        "camera_code": f"SENTINEL-{camera_id}",
        "name": name,
        "protocol": "rtsp",
        "stream_url": rtsp_url,
        "codec": entry.get("codec"),
        "resolution": entry.get("resolution"),
        "fps": entry.get("fps"),
        "department_id": department_id,
        "is_public_domain": True,
        "location": {
            "name": name,
            "district": district,
            "latitude": float(lat),
            "longitude": float(lng),
        },
    }


def _guess_district(name: str) -> str:
    """Guess district from camera name for display purposes."""
    n = name.lower()
    if any(x in n for x in ["ahmedabad", "paldi", "maninagar", "vatva", "navrangpura", "sg highway",
                              "cg road", "ashram", "relief", "prahladnagar", "bopal", "janpath",
                              "chimanbhai", "sarkhej", "chandkheda", "sardar patel"]):
        return "Ahmedabad"
    if any(x in n for x in ["gandhinagar", "sector"]):
        return "Gandhinagar"
    if any(x in n for x in ["surat", "adajan", "udhna"]):
        return "Surat"
    if any(x in n for x in ["vadodara", "baroda", "alkapuri", "akota", "rc dutt"]):
        return "Vadodara"
    if any(x in n for x in ["rajkot", "kalawad", "ring road"]):
        return "Rajkot"
    if any(x in n for x in ["bhavnagar"]):
        return "Bhavnagar"
    if any(x in n for x in ["jamnagar"]):
        return "Jamnagar"
    if any(x in n for x in ["anand"]):
        return "Anand"
    if any(x in n for x in ["nadiad"]):
        return "Kheda"
    if any(x in n for x in ["mehsana"]):
        return "Mehsana"
    return "Gujarat"


def onboard_cameras(token: str, department_id: str, cameras: list[dict], sentinel_host: str) -> dict:
    created, skipped, errors = [], [], []
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=BACKEND_URL, timeout=15.0, headers=headers) as client:
        for entry in cameras:
            payload = build_camera_payload(entry, sentinel_host, department_id)
            if not payload:
                errors.append({"id": entry.get("id", "?"), "error": "Could not build payload"})
                continue
            try:
                resp = client.post("/cameras", json=payload)
                if resp.status_code == 201:
                    created.append(payload["camera_code"])
                    print(f"  ✓ Created: {payload['camera_code']} — {payload['name']}")
                elif resp.status_code == 409:
                    skipped.append(payload["camera_code"])
                    print(f"  ~ Exists:  {payload['camera_code']}")
                else:
                    errors.append({"code": payload["camera_code"], "error": f"{resp.status_code}: {resp.text[:120]}"})
                    print(f"  ✗ Error:   {payload['camera_code']} — {resp.status_code}")
            except Exception as e:
                errors.append({"code": payload.get("camera_code", "?"), "error": str(e)})
    return {"created": created, "skipped": skipped, "errors": errors}


async def activate_cameras(token: str):
    """Run health check on all cameras to flip their status to active."""
    headers = {"Authorization": f"Bearer {token}"}
    print("\nRunning health checks to activate cameras...")
    with httpx.Client(base_url=BACKEND_URL, timeout=30.0, headers=headers) as client:
        resp = client.get("/cameras", params={"limit": 100})
        if resp.status_code != 200:
            print(f"  Could not fetch camera list: {resp.status_code}")
            return
        cameras = resp.json()
        for cam in cameras:
            try:
                hc = client.post(f"/cameras/{cam['id']}/health-check")
                status = hc.json().get("is_reachable", False)
                print(f"  {'✓' if status else '~'} {cam['camera_code']} — {'reachable' if status else 'not reachable (stream may not be live yet)'}")
            except Exception as e:
                print(f"  ? {cam['camera_code']} — health check error: {e}")


async def main(sentinel_host: str, skip_activate: bool):
    print("=" * 60)
    print("Gujarat CCTV Platform — Camera Setup")
    print("=" * 60)

    async with AsyncSessionLocal() as db:
        print("\n[1/4] Setting up department...")
        department_id = await get_or_create_department(db)

        print("\n[2/4] Minting admin token...")
        token = await mint_admin_token(db)

    print(f"\n[3/4] Fetching camera catalogue from Sentinel ({sentinel_host})...")
    cameras = fetch_sentinel_catalogue(sentinel_host)

    print(f"\n[4/4] Onboarding {len(cameras)} cameras...")
    result = onboard_cameras(token, department_id, cameras, sentinel_host)

    print("\n" + "=" * 60)
    print(f"  Created : {len(result['created'])}")
    print(f"  Skipped : {len(result['skipped'])} (already in registry)")
    print(f"  Errors  : {len(result['errors'])}")
    for err in result["errors"]:
        print(f"    {err}")

    if not skip_activate:
        await activate_cameras(token)

    print("\n✅ Done! Cameras are now in the registry.")
    print("   gateway_sync will register them in MediaMTX within 30 seconds.")
    print("   Refresh the dashboard to see cameras on the map.")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sentinel-host", default=DEFAULT_SENTINEL_HOST,
                        help=f"Sentinel sandbox host (default: {DEFAULT_SENTINEL_HOST})")
    parser.add_argument("--skip-activate", action="store_true",
                        help="Skip the health-check activation step")
    args = parser.parse_args()
    asyncio.run(main(args.sentinel_host, args.skip_activate))

