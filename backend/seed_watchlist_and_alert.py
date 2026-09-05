import asyncio
import uuid
import urllib.request
import json
from datetime import datetime, timezone

from app.database import AsyncSessionLocal
from app.models import Watchlist, WatchlistEntry, Camera
from sqlalchemy import select

async def seed():
    async with AsyncSessionLocal() as db:
        # 1. Create or get Watchlist
        wl = (await db.execute(select(Watchlist).where(Watchlist.name == "Gujarat Stolen & Suspect Vehicles"))).scalars().first()
        if not wl:
            wl = Watchlist(
                name="Gujarat Stolen & Suspect Vehicles",
                category="stolen_vehicle",
                source_system="State Police Control Room"
            )
            db.add(wl)
            await db.commit()
            await db.refresh(wl)
            print(f"Created Watchlist: {wl.name} (ID: {wl.id})")
        else:
            print(f"Using Watchlist: {wl.name} (ID: {wl.id})")

        # 2. Add Watchlist Entry for GJ01AB1234
        entry = (await db.execute(select(WatchlistEntry).where(WatchlistEntry.registration_number == "GJ01AB1234"))).scalars().first()
        if not entry:
            entry = WatchlistEntry(
                watchlist_id=wl.id,
                entity_type="vehicle",
                registration_number="GJ01AB1234",
                vehicle_type="car",
                color="black",
                identifying_details="Flagged in Armed Robbery Case (FIR 104/26 - Ahmedabad)",
                notes="Immediate interception ordered by SP Crime",
                priority="critical",
                status="active"
            )
            db.add(entry)
            await db.commit()
            print("Added Watchlist Entry: GJ01AB1234 [CRITICAL PRIORITY]")
        else:
            print("Watchlist Entry GJ01AB1234 already active.")

        # 3. Add Watchlist Entry for fuzzy match test (GJ27XX9999)
        fuzzy_entry = (await db.execute(select(WatchlistEntry).where(WatchlistEntry.registration_number == "GJ27XX9999"))).scalars().first()
        if not fuzzy_entry:
            fuzzy_entry = WatchlistEntry(
                watchlist_id=wl.id,
                entity_type="vehicle",
                registration_number="GJ27XX9999",
                vehicle_type="suv",
                color="black",
                identifying_details="Suspect Black SUV (FIR 42/26 - Surat)",
                notes="Verify driver identity",
                priority="high",
                status="active"
            )
            db.add(fuzzy_entry)
            await db.commit()
            print("Added Watchlist Entry: GJ27XX9999 [HIGH PRIORITY]")

        # 4. Trigger a detection right now on Camera 1 to generate an active ALERT!
        cam = (await db.execute(select(Camera))).scalars().first()
        if cam:
            from app.core.config import settings
            headers = {
                "Content-Type": "application/json",
                "X-API-Key": settings.ai_worker_api_key
            }
            payload = {
                "camera_id": str(cam.id),
                "raw_plate_text": "GJ01AB1234",
                "ocr_confidence": 0.98,
                "detection_confidence": 0.95,
                "vehicle_type": "car",
                "vehicle_color": "black",
                "detected_at": datetime.now(timezone.utc).isoformat()
            }
            req = urllib.request.Request(
                "http://localhost:8000/api/v1/detections/anpr",
                data=json.dumps(payload).encode("utf-8"),
                headers=headers
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode())
                    print("\nTRIGGERED LIVE DETECTION:")
                    print("  Detection ID:", data["detection_id"])
                    print("  Watchlist Match:", data["watchlist_match"])
                    print("  Match Type:", data["match_type"])
                    print("  Alert ID:", data["alert_id"])
                    print("\n>>> CRITICAL ALERT IS NOW ACTIVE IN DASHBOARD ALERT PANEL! <<<")
            except Exception as e:
                print("Detection trigger error:", e)

if __name__ == "__main__":
    asyncio.run(seed())
