"""
One-shot camera onboarding script.

Does everything in one command:
  1. Creates a "Gujarat Police" department (if none exists)
  2. Ensures an admin user exists
  3. Fetches the Sentinel camera catalogue from /api/ingest (with auth)
  4. Onboards/updates cameras with authenticated RTSP URLs
  5. Marks cameras active so AI worker + MediaMTX pick them up

Usage (run inside cctv_backend container):
    python3 setup_cameras.py
"""

import argparse
import asyncio
import os
import sys
from urllib.parse import quote, urlsplit, urlunsplit

import httpx
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User, Role, Department
from app.core.security import create_access_token, hash_password

DEFAULT_SENTINEL_HOST = os.getenv("SENTINEL_HOST", "103.250.160.189")
SENTINEL_USERNAME = os.getenv("SENTINEL_USERNAME", "nileshpar835@gmail.com")
SENTINEL_PASSWORD = os.getenv("SENTINEL_PASSWORD", "")
BACKEND_URL = os.getenv("SETUP_BACKEND_URL", "http://localhost:8000/api/v1")

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


def inject_rtsp_auth(url: str, username: str, password: str) -> str:
    if not url or not username or not password:
        return url
    parts = urlsplit(url)
    if parts.username:
        return url
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    userinfo = f"{quote(username, safe='')}:{quote(password, safe='')}"
    return urlunsplit((parts.scheme, f"{userinfo}@{host}", parts.path, parts.query, parts.fragment))


def _catalogue_list(data) -> list[dict] | None:
    if isinstance(data, list) and data:
        return data
    if isinstance(data, dict):
        for key in ("cameras", "items", "data", "results", "streams"):
            if isinstance(data.get(key), list) and data[key]:
                return data[key]
    return None


def fetch_sentinel_catalogue(sentinel_host: str) -> list[dict]:
    """Always start from /api/ingest per the Sentinel integration reference."""
    auth = (SENTINEL_USERNAME, SENTINEL_PASSWORD) if SENTINEL_USERNAME and SENTINEL_PASSWORD else None
    urls = [
        f"http://{sentinel_host}/api/ingest",
        f"https://{sentinel_host}/api/ingest",
    ]
    for url in urls:
        print(f"  Fetching catalogue from {url} ...")
        try:
            resp = httpx.get(url, timeout=15.0, follow_redirects=True, auth=auth)
            print(f"  HTTP {resp.status_code} from {url}")
            if resp.status_code != 200:
                continue
            cameras = _catalogue_list(resp.json())
            if cameras:
                print(f"  Got {len(cameras)} cameras from Sentinel API.")
                return cameras
            print(f"  Unrecognised catalogue shape: {str(resp.text)[:200]}")
        except Exception as e:
            print(f"  Could not reach {url} ({e})")

    print("  Using built-in 30-camera fallback list (catalogue unreachable).")
    return [
        {"id": c["id"], "name": c["name"], "latitude": c["lat"], "longitude": c["lng"]}
        for c in KNOWN_CAMERAS
    ]


def _guess_district(name: str) -> str:
    n = (name or "").lower()
    if any(x in n for x in ["ahmedabad", "paldi", "maninagar", "vatva", "navrangpura", "sg highway",
                              "cg road", "ashram", "relief", "prahladnagar", "bopal", "janpath",
                              "chiman", "sarkhej", "chandkheda", "sardar patel"]):
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


def build_camera_payload(entry: dict, sentinel_host: str, department_id: str) -> dict | None:
    camera_id = entry.get("id") or entry.get("camera_id") or entry.get("stream_id")
    if camera_id is None:
        return None
    camera_id = str(camera_id)

    location = entry.get("location") if isinstance(entry.get("location"), dict) else {}
    rtsp_url = (
        entry.get("rtsp_url")
        or entry.get("rtsp")
        or (entry.get("urls") or {}).get("rtsp")
        or (entry.get("streams") or {}).get("rtsp")
        or location.get("rtsp")
        or f"rtsp://{sentinel_host}:8554/stream/{camera_id}"
    )
    rtsp_url = inject_rtsp_auth(rtsp_url, SENTINEL_USERNAME, SENTINEL_PASSWORD)

    lat = entry.get("latitude") or entry.get("lat") or location.get("lat") or location.get("latitude") or 0.0
    lng = (
        entry.get("longitude") or entry.get("lng") or entry.get("lon")
        or location.get("lng") or location.get("lon") or location.get("longitude") or 0.0
    )
    name = entry.get("name") or location.get("name") or f"Sentinel Camera {camera_id}"
    district = location.get("district") or _guess_district(name)
    props = entry.get("stream_properties") or entry.get("properties") or {}
    fps = entry.get("fps") or props.get("fps")
    try:
        fps = int(fps) if fps is not None else None
    except (TypeError, ValueError):
        fps = None

    return {
        "camera_code": f"SENTINEL-{camera_id}",
        "name": str(name),
        "protocol": "rtsp",
        "stream_url": rtsp_url,
        "codec": entry.get("codec") or props.get("codec"),
        "resolution": entry.get("resolution") or props.get("resolution"),
        "fps": fps,
        "department_id": department_id,
        "is_public_domain": True,
        "location": {
            "name": str(name),
            "district": district,
            "latitude": float(lat) if lat is not None else 0.0,
            "longitude": float(lng) if lng is not None else 0.0,
        },
    }


async def get_or_create_department(db) -> str:
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


async def ensure_admin(db) -> None:
    result = await db.execute(
        select(User).join(Role, User.role_id == Role.id).where(Role.name == "admin")
    )
    if result.scalars().first():
        return
    role_result = await db.execute(select(Role).where(Role.name == "admin"))
    admin_role = role_result.scalar_one_or_none()
    if not admin_role:
        print("ERROR: No admin role in schema.", file=sys.stderr)
        sys.exit(1)
    password = os.getenv("ADMIN_PASSWORD", "admin123")
    user = User(
        username="admin",
        email="admin@gujaratpolice.gov.in",
        password_hash=hash_password(password),
        role_id=admin_role.id,
    )
    db.add(user)
    await db.commit()
    print(f"  Created admin user 'admin' (password from ADMIN_PASSWORD / default admin123)")


async def mint_admin_token(db) -> str:
    result = await db.execute(
        select(User).join(Role, User.role_id == Role.id).where(Role.name == "admin")
    )
    admin = result.scalars().first()
    if not admin:
        print("ERROR: No admin user found.", file=sys.stderr)
        sys.exit(1)
    token = create_access_token(str(admin.id), "admin", None)
    print(f"  Minted JWT for admin user: {admin.username}")
    return token


def _index_existing(client: httpx.Client) -> dict[str, str]:
    resp = client.get("/cameras", params={"limit": 500})
    if resp.status_code != 200:
        return {}
    data = resp.json()
    if not isinstance(data, list):
        return {}
    return {c["camera_code"]: c["id"] for c in data if c.get("camera_code") and c.get("id")}


def onboard_cameras(token: str, department_id: str, cameras: list[dict], sentinel_host: str) -> dict:
    created, updated, errors = [], [], []
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=BACKEND_URL, timeout=20.0, headers=headers) as client:
        existing = _index_existing(client)
        for entry in cameras:
            payload = build_camera_payload(entry, sentinel_host, department_id)
            if not payload:
                errors.append({"id": str(entry.get("id", "?")), "error": "Could not build payload"})
                continue
            code = payload["camera_code"]
            try:
                if code in existing:
                    patch = client.patch(
                        f"/cameras/{existing[code]}",
                        json={
                            "stream_url": payload["stream_url"],
                            "status": "active",
                            "codec": payload.get("codec"),
                            "resolution": payload.get("resolution"),
                            "fps": payload.get("fps"),
                        },
                    )
                    if patch.status_code < 400:
                        updated.append(code)
                        print(f"  ~ Updated: {code} — {payload['name']}")
                    else:
                        errors.append({"code": code, "error": f"{patch.status_code}: {patch.text[:160]}"})
                        print(f"  ✗ Update:  {code} — {patch.status_code}")
                    continue

                resp = client.post("/cameras", json=payload)
                if resp.status_code == 201:
                    created.append(code)
                    cam_id = resp.json().get("id")
                    if cam_id:
                        existing[code] = cam_id
                    print(f"  ✓ Created: {code} — {payload['name']}")
                elif resp.status_code == 409:
                    existing = _index_existing(client)
                    if code in existing:
                        client.patch(
                            f"/cameras/{existing[code]}",
                            json={"stream_url": payload["stream_url"], "status": "active"},
                        )
                        updated.append(code)
                        print(f"  ~ Exists:  {code} (stream URL refreshed)")
                    else:
                        errors.append({"code": code, "error": "409 but not found on list"})
                else:
                    errors.append({"code": code, "error": f"{resp.status_code}: {resp.text[:160]}"})
                    print(f"  ✗ Error:   {code} — {resp.status_code} {resp.text[:120]}")
            except Exception as e:
                errors.append({"code": payload.get("camera_code", "?"), "error": str(e)})
    return {"created": created, "updated": updated, "errors": errors}


def activate_all(token: str) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=BACKEND_URL, timeout=20.0, headers=headers) as client:
        resp = client.post("/cameras/activate-all")
        print(f"  activate-all -> {resp.status_code} {resp.text[:200]}")


async def main(sentinel_host: str, skip_activate: bool):
    print("=" * 60)
    print("Gujarat CCTV Platform — Camera Setup")
    print("=" * 60)

    if not SENTINEL_PASSWORD:
        print("WARNING: SENTINEL_PASSWORD is empty — RTSP URLs will have no credentials.", file=sys.stderr)

    async with AsyncSessionLocal() as db:
        print("\n[1/5] Setting up department...")
        department_id = await get_or_create_department(db)
        print("\n[2/5] Ensuring admin user...")
        await ensure_admin(db)
        print("\n[3/5] Minting admin token...")
        token = await mint_admin_token(db)

    print(f"\n[4/5] Fetching camera catalogue from Sentinel ({sentinel_host})...")
    cameras = fetch_sentinel_catalogue(sentinel_host)

    print(f"\n[5/5] Onboarding {len(cameras)} cameras...")
    result = onboard_cameras(token, department_id, cameras, sentinel_host)

    print("\n" + "=" * 60)
    print(f"  Created : {len(result['created'])}")
    print(f"  Updated : {len(result['updated'])}")
    print(f"  Errors  : {len(result['errors'])}")
    for err in result["errors"]:
        print(f"    {err}")

    if not skip_activate:
        print("\nActivating all cameras in registry...")
        activate_all(token)

    print("\nDone. Refresh the dashboard. gateway_sync will register MediaMTX paths.")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sentinel-host", default=DEFAULT_SENTINEL_HOST)
    parser.add_argument("--skip-activate", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.sentinel_host, args.skip_activate))
