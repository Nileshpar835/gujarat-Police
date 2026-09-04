import { useEffect, useMemo, useState, useCallback } from "react";
import MapView from "./components/MapView.jsx";
import AlertPanel from "./components/AlertPanel.jsx";
import CameraList from "./components/CameraList.jsx";
import VehicleSearch from "./components/VehicleSearch.jsx";
import RouteDetail from "./components/RouteDetail.jsx";
import CameraViewerModal from "./components/CameraViewerModal.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import { getCamerasGis, getAlerts, acknowledgeAlert, getVehicleRoute, getMe } from "./api.js";

const POLL_INTERVAL_MS = 5000;
// The Stream Gateway (MediaMTX) HLS output, proxied through Vite's dev
// server (see vite.config.js) so the session cookie round-trips correctly
// over plain HTTP during local development.
const STREAM_GATEWAY_BASE_URL = import.meta.env.VITE_STREAM_GATEWAY_URL || "/hls";

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connectionError, setConnectionError] = useState(null);

  const [activeRoute, setActiveRoute] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [viewingCamera, setViewingCamera] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [camerasData, alertsData] = await Promise.all([getCamerasGis(), getAlerts({ limit: 50 })]);
      setCameras(camerasData);
      setAlerts(alertsData);
      setConnectionError(null);
    } catch (err) {
      if (err.response?.status !== 401) {
        setConnectionError("Cannot reach the backend API. Is it running on :8000?");
      }
    }
  }, []);

  // On mount: if a token is already stored, verify it's still valid before
  // showing the dashboard rather than the login screen.
  useEffect(() => {
    const token = localStorage.getItem("cctv_access_token");
    if (!token) {
      setAuthChecked(true);
      return;
    }
    getMe()
      .then((me) => {
        setCurrentUser(me);
        setIsAuthenticated(true);
      })
      .catch(() => {
        localStorage.removeItem("cctv_access_token");
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // Global 401 handler (see api.js) — bounce back to login on token expiry.
  useEffect(() => {
    const handler = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
    };
    window.addEventListener("cctv-auth-expired", handler);
    return () => window.removeEventListener("cctv-auth-expired", handler);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, refresh]);

  const handleLoginSuccess = () => {
    getMe().then(setCurrentUser);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("cctv_access_token");
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const camerasById = useMemo(() => Object.fromEntries(cameras.map((c) => [c.id, c])), [cameras]);

  const handleAcknowledge = async (alertId) => {
    await acknowledgeAlert(alertId);
    refresh();
  };

  const handleVehicleSearch = async (registrationNumber) => {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const route = await getVehicleRoute(registrationNumber);
      setActiveRoute(route);
    } catch (err) {
      setActiveRoute(null);
      setSearchError(
        err.response?.status === 404 ? "No detections found for this plate." : "Search failed."
      );
    } finally {
      setSearchLoading(false);
    }
  };

  if (!authChecked) {
    return null; // avoid flashing the login screen before we've checked for an existing token
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Top bar */}
      <header
        style={{
          height: 56,
          borderBottom: "1px solid var(--border-hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connectionError ? "var(--severity-critical)" : "var(--accent-active)",
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Gujarat CCTV Command Dashboard</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <VehicleSearch onSearch={handleVehicleSearch} loading={searchLoading} error={searchError} />
          {currentUser && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {currentUser.role}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  fontSize: 12,
                  padding: "5px 10px",
                  background: "var(--bg-panel-raised)",
                  border: "1px solid var(--border-hairline)",
                  borderRadius: 4,
                  color: "var(--text-secondary)",
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {connectionError && (
        <div
          style={{
            background: "var(--severity-critical-dim)",
            color: "var(--severity-critical)",
            padding: "6px 20px",
            fontSize: 12,
          }}
        >
          {connectionError}
        </div>
      )}

      {/* Body: sidebar / map / alerts */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: 260,
            borderRight: "1px solid var(--border-hairline)",
            background: "var(--bg-panel)",
            flexShrink: 0,
          }}
        >
          <CameraList cameras={cameras} onSelectCamera={setViewingCamera} />
        </aside>

        <main style={{ flex: 1, position: "relative" }}>
          <MapView cameras={cameras} activeRoute={activeRoute} />
          <RouteDetail route={activeRoute} onClose={() => setActiveRoute(null)} />
        </main>

        <aside
          style={{
            width: 320,
            borderLeft: "1px solid var(--border-hairline)",
            background: "var(--bg-panel)",
            flexShrink: 0,
          }}
        >
          <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} camerasById={camerasById} />
        </aside>
      </div>

      <CameraViewerModal
        camera={viewingCamera}
        streamGatewayBaseUrl={STREAM_GATEWAY_BASE_URL}
        onClose={() => setViewingCamera(null)}
      />
    </div>
  );
}
