import { useMemo, useEffect, useState } from "react";
import CameraPlayer from "./CameraPlayer.jsx";
import GujaratPoliceLogo from "./GujaratPoliceLogo.jsx";
import { normalizeCameraId } from "../utils/streamUrlBuilder.js";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Home({ cameras = [], alerts = [], streamGatewayBaseUrl = "/hls" }) {
  const [greeting] = useState(getGreeting);

  const activeCameras = useMemo(
    () => (cameras || []).filter((c) => c && c.status === "active"),
    [cameras]
  );

  const pinnedCameras = useMemo(() => activeCameras.slice(0, 4), [activeCameras]);
  const onlineCount = activeCameras.length;
  const totalCount = (cameras || []).length;
  const alertCount = (alerts || []).filter((a) => a.status === "new").length;
  const openIncidents = (alerts || []).filter((a) => a.status !== "acknowledged");

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "24px 28px" }}>
      {/* Greeting */}
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
        {greeting}, Admin
      </h1>

      {/* PINNED CAMERAS */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Pinned Cameras
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              · {pinnedCameras.length} of {onlineCount}
            </span>
          </div>
          <button style={{ fontSize: 12, color: "var(--text-accent)", fontWeight: 500, background: "none", border: "none" }}>
            Edit
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(pinnedCameras.length, 4)}, 1fr)`, gap: 8 }}>
          {pinnedCameras.map((cam, i) => (
            <div
              key={cam.id || cam.camera_code}
              style={{
                position: "relative",
                background: "#000",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                border: "1px solid var(--border-primary)",
                aspectRatio: "16/10",
              }}
            >
              <CameraPlayer
                camera={cam}
                streamGatewayBaseUrl={streamGatewayBaseUrl}
                staggerIndex={i}
              />
            </div>
          ))}
          {pinnedCameras.length === 0 && (
            <div style={{
              gridColumn: "1 / -1",
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              background: "var(--bg-card)",
              borderRadius: "var(--radius-md)",
              border: "1px dashed var(--border-secondary)",
            }}>
              No active cameras to pin. Assign cameras from the Live view.
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 20 }}>
        {/* Cameras Online */}
        <div style={statCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={statLabelStyle}>CAMERAS ONLINE</span>
            <span style={{ fontSize: 16, opacity: 0.4 }}>📷</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)" }}>{onlineCount}</span>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}> / {totalCount}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--accent-green)", fontWeight: 500 }}>
            {onlineCount === totalCount ? "All online" : `${onlineCount} online`}
          </div>
        </div>

        {/* NVRS */}
        <div style={statCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={statLabelStyle}>NVRS</span>
            <span style={{ fontSize: 16, opacity: 0.4 }}>🖥</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)" }}>2</span>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}> / 2</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--accent-green)", fontWeight: 500 }}>
            2 saved
          </div>
        </div>

        {/* Recording */}
        <div style={statCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={statLabelStyle}>RECORDING</span>
            <span style={{ fontSize: 16, opacity: 0.4 }}>📉</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)" }}>{onlineCount}</span>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}> / {totalCount} healthy</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--accent-green)", fontWeight: 500 }}>
            All healthy
          </div>
        </div>

        {/* Open Incidents */}
        <div style={statCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={statLabelStyle}>OPEN INCIDENTS</span>
            <span style={{ fontSize: 16, opacity: 0.4 }}>⚠</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)" }}>{alertCount}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: alertCount > 0 ? "var(--accent-yellow)" : "var(--accent-green)", fontWeight: 500 }}>
            {alertCount > 0 ? `↑ ${alertCount} need review` : "No open incidents"}
          </div>
        </div>
      </div>

      {/* Connected Servers */}
      <div style={{ ...sectionCardStyle, marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Connected servers</h3>
          <button style={{ fontSize: 12, color: "var(--text-accent)", fontWeight: 500, background: "none", border: "none" }}>
            Manage
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border-primary)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-green)", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>sentinel.media.com</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
              <span style={{ color: "var(--text-secondary)" }}>{onlineCount} cameras</span>
              {" · "}
              <span style={{ color: "var(--text-secondary)" }}>{onlineCount} recording</span>
              {" · "}
              <span style={{ color: "var(--accent-green)" }}>online</span>
              {" status"}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Active Alerts + Open Incidents */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20, marginBottom: 24 }}>
        {/* Active Alerts */}
        <div style={sectionCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              Active alerts <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{alertCount}</span>
            </h3>
          </div>
          {alertCount === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🛡</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>No active alerts</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                Cameras healthy, no critical events.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {alerts.filter((a) => a.status === "new").slice(0, 5).map((alert) => (
                <div key={alert.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-primary)" }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: alert.severity === "critical" ? "var(--accent-red)" : alert.severity === "high" ? "var(--accent-yellow)" : "var(--accent-blue)",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{alert.message || alert.alert_type}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{alert.camera_code || ""}</div>
                  </div>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
                    {alert.severity || "low"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Incidents */}
        <div style={sectionCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              Open incidents <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{openIncidents.length}</span>
            </h3>
            <button style={{ fontSize: 12, color: "var(--text-accent)", fontWeight: 500, background: "none", border: "none" }}>
              All incidents →
            </button>
          </div>
          {openIncidents.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No open incidents
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {openIncidents.slice(0, 5).map((incident) => (
                <div key={incident.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: incident.severity === "critical" ? "var(--accent-red-dim)" : "var(--accent-yellow-dim)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0,
                  }}>
                    {incident.severity === "critical" ? "🔴" : "🟡"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                      {incident.message || incident.alert_type || "Suspicious activity"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {incident.camera_code || "Channel unknown"}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 600, textTransform: "uppercase",
                    color: incident.severity === "critical" ? "var(--accent-red)" : "var(--accent-yellow)",
                    letterSpacing: "0.05em",
                  }}>
                    {incident.severity || "MEDIUM"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const statCardStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  padding: "14px 16px",
};

const statLabelStyle = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const sectionCardStyle = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  padding: "14px 16px",
};
