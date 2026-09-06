import { useEffect, useMemo, useState, useCallback } from "react";
import Sidebar from "./components/Sidebar.jsx";
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
import Home from "./components/Home.jsx";
import { getCamerasGis, getAlerts, acknowledgeAlert, getVehicleRoute, getMe } from "./api.js";

const POLL_INTERVAL_MS = 5000;
const STREAM_GATEWAY_BASE_URL = import.meta.env.VITE_STREAM_GATEWAY_URL || "/hls";

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("live");

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

  useEffect(() => {
    const token = localStorage.getItem("cctv_access_token");
    if (!token) { setAuthChecked(true); return; }
    getMe()
      .then((me) => { setCurrentUser(me); setIsAuthenticated(true); })
      .catch(() => { localStorage.removeItem("cctv_access_token"); })
      .finally(() => setAuthChecked(true));
  }, []);

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
      setActiveTab("map");
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
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid var(--border-secondary)", borderTop: "2px solid var(--accent-blue)", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }
  if (!isAuthenticated) return <LoginScreen onLoginSuccess={handleLoginSuccess} />;

  const alertCount = alerts.filter((a) => a.status === "new").length;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        alertCount={alertCount}
      />

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top Bar */}
        <header
          style={{
            height: "var(--topbar-height)",
            borderBottom: "1px solid var(--border-primary)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 12,
            background: "var(--bg-secondary)",
            flexShrink: 0,
          }}
        >
          {/* Search Bar */}
          <div style={{ position: "relative", flex: "0 1 380px" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }}>🔍</span>
            <input
              type="text"
              placeholder="Search cameras, incidents, events..."
              style={{
                width: "100%",
                padding: "7px 12px 7px 32px",
                fontSize: 12,
                background: "var(--bg-input)",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target.value) handleVehicleSearch(e.target.value);
              }}
            />
            <span
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                fontSize: 9, color: "var(--text-muted)",
                border: "1px solid var(--border-secondary)", borderRadius: 3,
                padding: "1px 5px",
              }}
            >
              ⌘K
            </span>
          </div>

          {searchError && (
            <span style={{ fontSize: 11, color: "var(--accent-red)" }}>{searchError}</span>
          )}

          <div style={{ flex: 1 }} />

          {/* Connection status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: 11,
              fontWeight: 500,
              background: connectionError ? "var(--accent-red-dim)" : "var(--accent-green-dim)",
              border: `1px solid ${connectionError ? "var(--accent-red)" : "var(--accent-green)"}`,
              color: connectionError ? "var(--accent-red)" : "var(--accent-green)",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: connectionError ? "var(--accent-red)" : "var(--accent-green)" }} />
            {connectionError ? "Offline" : "All online"}
          </div>

          {/* User avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "var(--accent-blue)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#fff",
              }}
            >
              {currentUser?.username?.[0]?.toUpperCase() || "A"}
            </div>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {currentUser?.username || "admin"}
            </span>
          </div>
        </header>

        {/* Connection error banner */}
        {connectionError && (
          <div style={{ background: "var(--accent-red-dim)", color: "var(--accent-red)", padding: "4px 16px", fontSize: 11, borderBottom: "1px solid var(--accent-red)" }}>
            {connectionError}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {/* Live Tab */}
          {activeTab === "live" && (
            <div style={{ height: "100%" }}>
              <CameraGrid cameras={cameras} streamGatewayBaseUrl={STREAM_GATEWAY_BASE_URL} />
            </div>
          )}

          {/* Map Tab */}
          {activeTab === "map" && (
            <div style={{ display: "flex", height: "100%" }}>
              <aside style={{ width: 220, borderRight: "1px solid var(--border-primary)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <CameraList cameras={cameras} onSelectCamera={setViewingCamera} />
              </aside>
              <main style={{ flex: 1, position: "relative" }}>
                <MapView cameras={cameras} activeRoute={activeRoute} onCameraClick={setViewingCamera} />
                <RouteDetail route={activeRoute} onClose={() => setActiveRoute(null)} />
              </main>
              <aside style={{ width: 280, borderLeft: "1px solid var(--border-primary)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} camerasById={camerasById} />
              </aside>
            </div>
          )}

          {/* Incidents/Detections Tab */}
          {activeTab === "detections" && (
            <div style={{ display: "flex", height: "100%" }}>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <DetectionHistory onShowRoute={(route) => { setActiveRoute(route); setActiveTab("map"); }} />
              </div>
              <aside style={{ width: 280, borderLeft: "1px solid var(--border-primary)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} camerasById={camerasById} />
              </aside>
            </div>
          )}

          {/* Watchlist Tab */}
          {activeTab === "watchlist" && (
            <div style={{ display: "flex", height: "100%" }}>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <WatchlistPanel />
              </div>
              <aside style={{ width: 280, borderLeft: "1px solid var(--border-primary)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} camerasById={camerasById} />
              </aside>
            </div>
          )}

          {/* Cameras Tab */}
          {activeTab === "cameras" && (
            <div style={{ height: "100%", display: "flex" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                <CameraList cameras={cameras} onSelectCamera={setViewingCamera} />
              </div>
              <aside style={{ width: 280, borderLeft: "1px solid var(--border-primary)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} camerasById={camerasById} />
              </aside>
            </div>
          )}

          {/* Home Tab */}
          {activeTab === "home" && (
            <Home
              cameras={cameras}
              alerts={alerts}
              streamGatewayBaseUrl={STREAM_GATEWAY_BASE_URL}
            />
          )}

          {/* Audit Tab */}
          {activeTab === "audit" && (
            <div style={{ padding: 24, color: "var(--text-secondary)" }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Audit Log</h2>
              <p style={{ fontSize: 13 }}>Audit logging is available in the backend API.</p>
            </div>
          )}
        </div>
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
