import { useState } from "react";
import { searchVehicles, getVehicleRoute } from "../api.js";

export default function DetectionHistory({ onShowRoute }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [routeData, setRouteData] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoadingSearch(true);
    setError(null);
    setRouteData(null);
    try {
      const data = await searchVehicles(query.trim());
      setResults(data);
      if (data.length === 0) setError(`No vehicle found matching "${query}"`);
    } catch {
      setError("Search failed — check the backend is running");
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleLoadRoute = async (registrationNumber) => {
    setLoadingRoute(registrationNumber);
    setError(null);
    try {
      const route = await getVehicleRoute(registrationNumber);
      setRouteData(route);
      if (onShowRoute) onShowRoute(route);
    } catch (err) {
      setError(err.response?.status === 404 ? "No detections found for this plate" : "Failed to load route");
    } finally {
      setLoadingRoute(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0 0 20px 0" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-hairline)" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Vehicle Detection History</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
          Search detected plates · view camera sequence · load route on GIS
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} style={{ padding: "12px 20px", display: "flex", gap: 8, borderBottom: "1px solid var(--border-hairline)" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter plate number (e.g. GJ01AB1234)…"
          style={{
            flex: 1, background: "var(--bg-panel)", border: "1px solid var(--border-hairline)",
            borderRadius: 4, padding: "7px 12px", fontSize: 13, color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        />
        <button
          type="submit"
          disabled={loadingSearch}
          style={{
            fontSize: 13, padding: "7px 16px",
            background: "#1a3a5c", border: "1px solid #2563eb",
            borderRadius: 4, color: "#93c5fd", cursor: "pointer",
          }}
        >
          {loadingSearch ? "Searching…" : "Search"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div style={{ margin: "8px 20px", padding: "8px 12px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 6, fontSize: 12, color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {/* Vehicle search results */}
      {results.length > 0 && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "10px 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {results.length} vehicle{results.length !== 1 ? "s" : ""} found
          </div>
          {results.map((v) => (
            <div
              key={v.registration_number}
              style={{
                padding: "10px 12px", marginBottom: 8,
                background: "var(--bg-void)", borderRadius: 6,
                border: "1px solid var(--border-hairline)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{v.registration_number}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {[v.vehicle_type, v.color].filter(Boolean).join(" · ") || "Unknown type/color"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {v.first_seen_at ? `First: ${new Date(v.first_seen_at).toLocaleString()}` : ""}
                  {v.last_seen_at ? ` · Last: ${new Date(v.last_seen_at).toLocaleString()}` : ""}
                </div>
              </div>
              <button
                onClick={() => handleLoadRoute(v.registration_number)}
                disabled={loadingRoute === v.registration_number}
                style={{
                  fontSize: 12, padding: "5px 12px",
                  background: loadingRoute === v.registration_number ? "var(--bg-void)" : "#1a3a5c",
                  border: "1px solid #2563eb", borderRadius: 4, color: "#93c5fd", cursor: "pointer",
                }}
              >
                {loadingRoute === v.registration_number ? "Loading…" : "View Route →"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Route detail */}
      {routeData && (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "12px 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Route — {routeData.total_detections} detection{routeData.total_detections !== 1 ? "s" : ""} · {routeData.registration_number}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
            {[routeData.vehicle_type, routeData.color].filter(Boolean).join(" · ")}
          </div>
          {(Array.isArray(routeData.route) ? routeData.route : []).map((stop, i) => (
            <div
              key={stop.detection_id}
              style={{
                padding: "10px 12px", marginBottom: 6,
                background: "var(--bg-void)", borderRadius: 6,
                border: "1px solid var(--border-hairline)",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}
            >
              {/* Step indicator */}
              <div style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: i === 0 ? "#14532d" : i === routeData.route.length - 1 ? "#450a0a" : "#1e293b",
                fontSize: 11, fontWeight: 700, color: i === 0 ? "#86efac" : i === routeData.route.length - 1 ? "#fca5a5" : "var(--text-secondary)",
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{stop.camera_code}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{stop.camera_name} · {stop.district || "—"}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {new Date(stop.timestamp).toLocaleString()}
                  {stop.ocr_confidence != null ? ` · OCR: ${(stop.ocr_confidence * 100).toFixed(0)}%` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!routeData && results.length === 0 && !loadingSearch && !error && (
        <div style={{ padding: 30, color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
          Search for a vehicle plate to see detection history and reconstruct its route across cameras.
        </div>
      )}
    </div>
  );
}

