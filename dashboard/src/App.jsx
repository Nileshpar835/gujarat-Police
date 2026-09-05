import { useEffect, useMemo, useState, useCallback } from "react";
import MapView from "./components/MapView.jsx";
import AlertPanel from "./components/AlertPanel.jsx";
import CameraList from "./components/CameraList.jsx";
import VehicleSearch from "./components/VehicleSearch.jsx";
import RouteDetail from "./components/RouteDetail.jsx";
import CameraViewerModal from "./components/CameraViewerModal.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import WatchlistPanel from "./components/WatchlistPanel.jsx";
import DetectionHistory from "./components/DetectionHistory.jsx";
import CameraGrid from "./components/CameraGrid.jsx";
import { getCamerasGis, getAlerts, acknowledgeAlert, getVehicleRoute, getMe } from "./api.js";

const POLL_INTERVAL_MS = 5000;
// The Stream Gateway (MediaMTX) HLS output, proxied through Vite's dev
// server (see vite.config.js) so the session cookie round-trips correctly
// over plain HTTP during local development.
const STREAM_GATEWAY_BASE_URL = import.meta.env.VITE_STREAM_GATEWAY_URL || "/hls";

// Main navigation tabs
const TABS = [
  { id: "map", label: "🗺 Map" },
  { id: "grid", label: "📹 Camera Grid" },
  { id: "detections", label: "🔍 Detections" },
  { id: "watchlist", label: "⚠ Watchlist" },
];

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("map");

  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connectionError, setConnectionError] = useState(null);

  const [activeRoute, setActiveRoute] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [viewingCamera, setViewingCamera] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [camerasData, alertsData] = await Promise.all([
        getCamerasGis(),
        getAlerts({ limit: 50 }),
      ]);
      setCameras(camerasData);
      setAlerts(alertsData);
      setConnectionError(null);
    } catch (err) {
      if (err.response?.status !== 401) {
        setConnectionError("Cannot reach the backend API. Is it running on :8000?");
      }
    }
  }, []);

  // On mount: if a token is already stored, verify it's still valid.
  useEffect(() => {
    const token = localStorage.getItem("cctv_access_token");
    if (!token) { setAuthChecked(true); return; }
    getMe()
      .then((me) => { setCurrentUser(me); setIsAuthenticated(true); })
      .catch(() => { localStorage.removeItem("cctv_access_token"); })
      .finally(() => setAuthChecked(true));
  }, []);

  // Global 401 handler — bounce back to login on token expiry.
  useEffect(() => {
    const handler = () => { setIsAuthenticated(false); setCurrentUser(null); };
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

  const camerasById = useMemo(
    () => Object.fromEntries((cameras || []).map((c) => [c.id, c])),
    [cameras]
  );

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
      setActiveTab("map"); // switch to map to show the route
    } catch (err) {
      setActiveRoute(null);
      setSearchError(
        err.response?.status === 404 ? "No detections found for this plate." : "Search failed."
      );
    } finally {
      setSearchLoading(false);
    }
  };

  if (!authChecked) return null;
  if (!isAuthenticated) return <LoginScreen onLoginSuccess={handleLoginSuccess} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* ───── Top bar ───── */}
      <header
        style={{
          height: 52,
          borderBottom: "1px solid var(--border-hairline)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: connectionError ? "var(--severity-critical)" : "var(--accent-active)",
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.3px" }}>
            Gujarat CCTV Command Dashboard
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 4 }}>
            Gujarat Police · Home Department
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <VehicleSearch onSearch={handleVehicleSearch} loading={searchLoading} error={searchError} />
          {currentUser && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {currentUser.username || currentUser.id?.slice(0, 8)} · {currentUser.role}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  fontSize: 11, padding: "4px 10px",
                  background: "var(--bg-panel-raised)",
                  border: "1px solid var(--border-hairline)",
                  borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Connection error banner */}
      {connectionError && (
        <div style={{ background: "var(--severity-critical-dim)", color: "var(--severity-critical)", padding: "5px 16px", fontSize: 12 }}>
          {connectionError}
        </div>
      )}

      {/* ───── Tab bar ───── */}
      <div
        style={{
          display: "flex", gap: 2,
          padding: "4px 16px",
          borderBottom: "1px solid var(--border-hairline)",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "5px 14px", fontSize: 12, fontWeight: 500,
              background: activeTab === tab.id ? "#1a3a5c" : "transparent",
              border: activeTab === tab.id ? "1px solid #2563eb" : "1px solid transparent",
              borderRadius: 4,
              color: activeTab === tab.id ? "#93c5fd" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
        {/* Live alert count badge */}
        {alerts.filter((a) => a.status === "new").length > 0 && (
          <span
            style={{
              marginLeft: 4, alignSelf: "center",
              fontSize: 10, fontWeight: 700,
              background: "var(--severity-critical)",
              color: "#fff",
              padding: "2px 7px", borderRadius: 10,
            }}
          >
            {alerts.filter((a) => a.status === "new").length} ALERT{alerts.filter((a) => a.status === "new").length !== 1 ? "S" : ""}
          </span>
        )}
      </div>

      {/* ───── Body ───── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ── Map Tab ── */}
        {activeTab === "map" && (
          <>
            {/* Camera sidebar */}
            <aside style={{ width: 240, borderRight: "1px solid var(--border-hairline)", background: "var(--bg-panel)", flexShrink: 0 }}>
              <CameraList cameras={cameras} onSelectCamera={setViewingCamera} />
            </aside>

            {/* Map */}
            <main style={{ flex: 1, position: "relative" }}>
              <MapView
                cameras={cameras}
                activeRoute={activeRoute}
                onCameraClick={setViewingCamera}
              />
              <RouteDetail route={activeRoute} onClose={() => setActiveRoute(null)} />
            </main>

            {/* Alert panel */}
            <aside style={{ width: 300, borderLeft: "1px solid var(--border-hairline)", background: "var(--bg-panel)", flexShrink: 0 }}>
              <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} camerasById={camerasById} />
            </aside>
          </>
        )}

        {/* ── Camera Grid Tab ── */}
        {activeTab === "grid" && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <CameraGrid cameras={cameras} streamGatewayBaseUrl={STREAM_GATEWAY_BASE_URL} />
          </div>
        )}

        {/* ── Detection History Tab ── */}
        {activeTab === "detections" && (
          <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <DetectionHistory
                onShowRoute={(route) => {
                  setActiveRoute(route);
                  setActiveTab("map");
                }}
              />
            </div>
            {/* Keep alert panel visible even on this tab */}
            <aside style={{ width: 300, borderLeft: "1px solid var(--border-hairline)", background: "var(--bg-panel)", flexShrink: 0 }}>
              <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} camerasById={camerasById} />
            </aside>
          </div>
        )}

        {/* ── Watchlist Tab ── */}
        {activeTab === "watchlist" && (
          <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <WatchlistPanel />
            </div>
            {/* Keep alert panel visible */}
            <aside style={{ width: 300, borderLeft: "1px solid var(--border-hairline)", background: "var(--bg-panel)", flexShrink: 0 }}>
              <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} camerasById={camerasById} />
            </aside>
          </div>
        )}
      </div>

      {/* Camera stream modal */}
      <CameraViewerModal
        camera={viewingCamera}
        streamGatewayBaseUrl={STREAM_GATEWAY_BASE_URL}
        onClose={() => setViewingCamera(null)}
      />
    </div>
  );
}
