"""
Adapter registry / factory.

This is the single place that maps a camera's declared protocol to its
adapter implementation. Adding a new vendor SDK adapter means writing one
class implementing CameraAdapter (see base.py) and adding one line here —
no other service in the platform needs to change.
"""

from app.adapters.base import CameraAdapter
from app.adapters.rtsp_onvif import RTSPAdapter, ONVIFAdapter

_ADAPTER_MAP: dict[str, type[CameraAdapter]] = {
    "rtsp": RTSPAdapter,
    "onvif": ONVIFAdapter,
    # "vendor_api": SomeVendorSDKAdapter,   # <-- extensibility point
}


def get_adapter(protocol: str, camera_id: str, connection_config: dict) -> CameraAdapter:
    adapter_cls = _ADAPTER_MAP.get(protocol)
    if adapter_cls is None:
        raise ValueError(
            f"No adapter registered for protocol '{protocol}'. "
            f"Available: {list(_ADAPTER_MAP.keys())}"
        )
    return adapter_cls(camera_id, connection_config)
