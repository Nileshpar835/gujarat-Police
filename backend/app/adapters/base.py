"""
Normalised camera adapter interface.

Every VMS/vendor integration implements this interface. Downstream services
(Stream Gateway, AI Pipeline, Health Monitor) only ever talk to this
interface — they never know or care whether a camera is RTSP, ONVIF, or a
proprietary vendor SDK underneath. This is the concrete implementation of
the "adapter pattern" described in the HLD (Section 6).

To add a new vendor: implement CameraAdapter, register it in
adapters/registry.py, and set cameras.protocol / vms_systems.adapter_type
accordingly. No other service needs to change.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class HealthResult:
    is_reachable: bool
    latency_ms: Optional[int] = None
    error_message: Optional[str] = None


@dataclass
class StreamInfo:
    stream_url: str
    codec: Optional[str] = None
    resolution: Optional[str] = None
    fps: Optional[int] = None


class CameraAdapter(ABC):
    """Abstract adapter — one instance per onboarded camera."""

    def __init__(self, camera_id: str, connection_config: dict):
        self.camera_id = camera_id
        self.config = connection_config

    @abstractmethod
    async def connect(self) -> bool:
        """Establish/validate connectivity. Returns True on success."""
        raise NotImplementedError

    @abstractmethod
    async def get_stream_url(self) -> StreamInfo:
        """Resolve a playable/consumable stream URL (for gateway + AI pipeline)."""
        raise NotImplementedError

    @abstractmethod
    async def get_health(self) -> HealthResult:
        """Lightweight reachability + latency check, used by the health monitor."""
        raise NotImplementedError

    async def subscribe_events(self, callback):
        """
        Optional: subscribe to native VMS events (e.g. ONVIF motion events).
        Default no-op — not all vendors/protocols support this.
        """
        return None
