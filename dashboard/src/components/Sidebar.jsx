import { memo } from "react";
import GujaratPoliceLogo from "./GujaratPoliceLogo.jsx";

const NAV_SECTIONS = [
  {
    label: "OPERATIONS",
    items: [
      { id: "home", icon: "⊞", label: "Home" },
      { id: "live", icon: "◉", label: "Live", accent: true },
      { id: "detections", icon: "🔍", label: "Incidents" },
    ],
  },
  {
    label: "INFRASTRUCTURE",
    items: [
      { id: "map", icon: "◎", label: "Map" },
      { id: "watchlist", icon: "⚠", label: "Watchlist" },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { id: "cameras", icon: "📷", label: "Cameras" },
      { id: "audit", icon: "≡", label: "Audit log" },
    ],
  },
];

function Sidebar({ activeTab, onTabChange, currentUser, onLogout, alertCount = 0 }) {
  return (
    <div
      style={{
        width: "var(--sidebar-width)",
        height: "100%",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-primary)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Logo + Department */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--border-primary)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <GujaratPoliceLogo size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
            Government of Gujarat <span style={{ color: "var(--accent-cyan)" }}>· Home Department </span>
          </div>
          {/* <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 500, lineHeight: 1.3, letterSpacing: "0.02em" }}>
            Government of Gujarat · Home Department
          </div> */}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 16 }}>
            <div
              style={{
                padding: "4px 16px 6px",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = activeTab === item.id;
              const hasAlert = item.id === "detections" && alertCount > 0;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  style={{
                    width: "100%",
                    padding: "8px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    background: isActive ? "var(--bg-active)" : "transparent",
                    borderLeft: isActive ? "3px solid var(--accent-blue)" : "3px solid transparent",
                    textAlign: "left",
                    transition: "background 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 14, width: 20, textAlign: "center", opacity: isActive ? 1 : 0.7 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {hasAlert && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: "var(--accent-red)",
                        color: "#fff",
                        padding: "1px 6px",
                        borderRadius: 8,
                        minWidth: 18,
                        textAlign: "center",
                      }}
                    >
                      {alertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* User Profile */}
      <div
        style={{
          borderTop: "1px solid var(--border-primary)",
          padding: "10px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--accent-blue)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {currentUser?.username?.[0]?.toUpperCase() || "A"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              {currentUser?.username || "admin"}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {currentUser?.role || "OWNER"}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{
            width: "100%",
            padding: "6px 0",
            fontSize: 12,
            color: "var(--text-secondary)",
            background: "transparent",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export default memo(Sidebar);
