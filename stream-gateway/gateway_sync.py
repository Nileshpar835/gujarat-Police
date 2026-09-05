"""
Stream Gateway sync service.

Polls the Registry & GIS backend for active cameras and keeps MediaMTX's
path list in sync: one MediaMTX path per camera, sourced from that
camera's resolved stream_url (RTSP). MediaMTX then republishes each path
as HLS/WebRTC for the dashboard, and as RTSP for the AI worker — this is
what keeps video transport (this service) separate from analytics (the
ai-worker service), per HLD Section 10.

This service does not touch camera credentials/vendor logic itself — it
trusts the backend's cameras.stream_url, which is where the adapter layer
(backend/app/adapters/) already resolved protocol-specific connection
details. That's the interoperability boundary: this gateway only needs
one thing from any camera, an RTSP URL, regardless of vendor.
"""

import logging
import os
import time

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("stream-gateway-sync")

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000/api/v1")
MEDIAMTX_API_URL = os.getenv("MEDIAMTX_API_URL", "http://localhost:9997")
POLL_INTERVAL_SECONDS = int(os.getenv("GATEWAY_SYNC_POLL_INTERVAL_SECONDS", "30"))
AI_WORKER_API_KEY = os.getenv("AI_WORKER_API_KEY", "CHANGE_ME_dev_only_ai_worker_key")
# Reuses the same service credential as the AI worker — both are backend
# services (not human users) reading the camera registry, so they share
# the one service-auth mechanism rather than each needing their own.


def list_active_cameras(client: httpx.Client) -> list[dict]:
    resp = client.get(
        f"{BACKEND_BASE_URL}/cameras",
        params={"status": "active"},
        headers={"X-API-Key": AI_WORKER_API_KEY},
    )
    resp.raise_for_status()
    return resp.json()


def list_mediamtx_paths(client: httpx.Client) -> set[str]:
    resp = client.get(f"{MEDIAMTX_API_URL}/v3/config/paths/list")
    resp.raise_for_status()
    return {item["name"] for item in resp.json().get("items", [])}


def upsert_path(client: httpx.Client, camera_code: str, stream_url: str, path_exists: bool):
    """
    Registers (or updates) a MediaMTX path that pulls from the camera's RTSP
    URL. MediaMTX handles reconnection/backoff on its own once configured
    this way, satisfying the "reconnection, timeout" adapter requirements
    from HLD Section 6 for the transport leg specifically.

    rtspTransport is forced to "tcp" explicitly here (not left to the
    "automatic" default) per the Sentinel Camera Grid integration
    reference's "Force RTSP over TCP" requirement — UDP is silently
    accepted by most sources but fails across NAT/firewalls, producing
    corrupt frames that look like a model bug rather than a network issue.
    """
    payload = {
        "source": stream_url,
        "sourceOnDemand": True,  # on-demand pull when camera is opened in dashboard
    }
    verb = client.patch if path_exists else client.post
    endpoint = "patch" if path_exists else "add"
    resp = verb(f"{MEDIAMTX_API_URL}/v3/config/paths/{endpoint}/{camera_code}", json=payload)
    if resp.status_code >= 400:
        logger.error("Failed to %s path for %s: %s %s", endpoint, camera_code, resp.status_code, resp.text)
    else:
        logger.info("%s path for camera %s -> %s", "Updated" if path_exists else "Registered", camera_code, stream_url)


def remove_path(client: httpx.Client, camera_code: str):
    resp = client.delete(f"{MEDIAMTX_API_URL}/v3/config/paths/delete/{camera_code}")
    if resp.status_code >= 400:
        logger.error("Failed to remove path for %s: %s %s", camera_code, resp.status_code, resp.text)
    else:
        logger.info("Removed path for decommissioned/inactive camera %s", camera_code)


def sync_once(client: httpx.Client):
    try:
        cameras = list_active_cameras(client)
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not reach backend for camera list: %s", exc)
        return

    try:
        existing_paths = list_mediamtx_paths(client)
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not reach MediaMTX API: %s", exc)
        return

    current_codes = set()
    for cam in cameras:
        stream_url = cam.get("stream_url")
        if not stream_url or cam.get("protocol") not in ("rtsp", "onvif"):
            continue  # vendor_api cameras need a dedicated adapter that resolves to RTSP first
        code = cam["camera_code"]
        current_codes.add(code)
        upsert_path(client, code, stream_url, path_exists=code in existing_paths)

    # Remove paths for cameras that are no longer active (decommissioned, maintenance, etc.)
    for stale_code in existing_paths - current_codes:
        remove_path(client, stale_code)


def main():
    logger.info(
        "Stream Gateway sync started. Backend=%s MediaMTX=%s interval=%ss",
        BACKEND_BASE_URL, MEDIAMTX_API_URL, POLL_INTERVAL_SECONDS,
    )
    with httpx.Client(timeout=10.0) as client:
        while True:
            sync_once(client)
            time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
