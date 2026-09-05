import { useState, useEffect } from "react";
import { getWatchlists, getWatchlistEntries, createWatchlist, createWatchlistEntry } from "../api.js";

const PRIORITY_COLOR = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

export default function WatchlistPanel() {
  const [watchlists, setWatchlists] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedWatchlist, setSelectedWatchlist] = useState(null);
  const [searchPlate, setSearchPlate] = useState("");
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showCreateWL, setShowCreateWL] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Add entry form
  const [entryForm, setEntryForm] = useState({
    registration_number: "", vehicle_type: "", make: "", model: "",
    color: "", priority: "medium", notes: "",
  });

  // Create watchlist form
  const [wlForm, setWlForm] = useState({ name: "", category: "stolen_vehicle" });

  useEffect(() => {
    loadWatchlists();
  }, []);

  const loadWatchlists = async () => {
    try {
      const data = await getWatchlists();
      setWatchlists(data);
      if (data.length > 0 && !selectedWatchlist) {
        setSelectedWatchlist(data[0].id);
      }
    } catch (e) {
      setError("Failed to load watchlists");
    }
  };

  const loadEntries = async (wlId, plate) => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (wlId) params.watchlist_id = wlId;
      if (plate) params.registration_number = plate;
      const data = await getWatchlistEntries(params);
      setEntries(data);
    } catch {
      setError("Failed to load entries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries(selectedWatchlist, searchPlate);
  }, [selectedWatchlist, searchPlate]);

  const flashSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleCreateWatchlist = async (e) => {
    e.preventDefault();
    try {
      const wl = await createWatchlist(wlForm);
      setWatchlists((p) => [...p, wl]);
      setSelectedWatchlist(wl.id);
      setShowCreateWL(false);
      setWlForm({ name: "", category: "stolen_vehicle" });
      flashSuccess(`Watchlist "${wl.name}" created`);
    } catch {
      setError("Failed to create watchlist");
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!selectedWatchlist) { setError("Select a watchlist first"); return; }
    try {
      await createWatchlistEntry({ ...entryForm, watchlist_id: selectedWatchlist, entity_type: "vehicle" });
      setShowAddEntry(false);
      setEntryForm({ registration_number: "", vehicle_type: "", make: "", model: "", color: "", priority: "medium", notes: "" });
      flashSuccess("Entry added to watchlist");
      loadEntries(selectedWatchlist, searchPlate);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to add entry");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0 0 20px 0" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Watchlist Management</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            Stolen vehicles, wanted persons, suspects
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowCreateWL((v) => !v)}
            style={{ fontSize: 12, padding: "5px 12px", background: "var(--bg-panel-raised)", border: "1px solid var(--border-hairline)", borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer" }}>
            + New List
          </button>
          <button onClick={() => setShowAddEntry((v) => !v)}
            style={{ fontSize: 12, padding: "5px 12px", background: "#1a3a5c", border: "1px solid #2563eb", borderRadius: 4, color: "#93c5fd", cursor: "pointer" }}>
            + Add Vehicle
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && <div style={{ margin: "8px 20px", padding: "8px 12px", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.4)", borderRadius: 6, fontSize: 12, color: "#fca5a5" }}>{error}</div>}
      {successMsg && <div style={{ margin: "8px 20px", padding: "8px 12px", background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.4)", borderRadius: 6, fontSize: 12, color: "#86efac" }}>{successMsg}</div>}

      {/* Create Watchlist form */}
      {showCreateWL && (
        <form onSubmit={handleCreateWatchlist} style={{ margin: "10px 20px", padding: 14, background: "var(--bg-void)", borderRadius: 8, border: "1px solid var(--border-hairline)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Create New Watchlist</div>
          <input required placeholder="Name (e.g. Stolen Vehicles – Ahmedabad)" value={wlForm.name} onChange={(e) => setWlForm((p) => ({ ...p, name: e.target.value }))}
            style={{ background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }} />
          <select value={wlForm.category} onChange={(e) => setWlForm((p) => ({ ...p, category: e.target.value }))}
            style={{ background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }}>
            <option value="stolen_vehicle">Stolen Vehicle</option>
            <option value="blacklisted_vehicle">Blacklisted Vehicle</option>
            <option value="wanted_person">Wanted Person</option>
            <option value="missing_person">Missing Person</option>
            <option value="suspect">Suspect</option>
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ fontSize: 12, padding: "5px 14px", background: "#1a3a5c", border: "1px solid #2563eb", borderRadius: 4, color: "#93c5fd", cursor: "pointer" }}>Create</button>
            <button type="button" onClick={() => setShowCreateWL(false)} style={{ fontSize: 12, padding: "5px 10px", background: "var(--bg-panel-raised)", border: "1px solid var(--border-hairline)", borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer" }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Add Entry form */}
      {showAddEntry && (
        <form onSubmit={handleAddEntry} style={{ margin: "10px 20px", padding: 14, background: "var(--bg-void)", borderRadius: 8, border: "1px solid var(--border-hairline)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Add Vehicle to Watchlist</div>
          <input required placeholder="Registration Number (e.g. GJ01AB1234)" value={entryForm.registration_number} onChange={(e) => setEntryForm((p) => ({ ...p, registration_number: e.target.value }))}
            style={{ background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Vehicle type" value={entryForm.vehicle_type} onChange={(e) => setEntryForm((p) => ({ ...p, vehicle_type: e.target.value }))}
              style={{ flex: 1, background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }} />
            <input placeholder="Color" value={entryForm.color} onChange={(e) => setEntryForm((p) => ({ ...p, color: e.target.value }))}
              style={{ flex: 1, background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Make" value={entryForm.make} onChange={(e) => setEntryForm((p) => ({ ...p, make: e.target.value }))}
              style={{ flex: 1, background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }} />
            <input placeholder="Model" value={entryForm.model} onChange={(e) => setEntryForm((p) => ({ ...p, model: e.target.value }))}
              style={{ flex: 1, background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }} />
          </div>
          <select value={entryForm.priority} onChange={(e) => setEntryForm((p) => ({ ...p, priority: e.target.value }))}
            style={{ background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }}>
            <option value="critical">Critical Priority</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <input placeholder="Notes (optional)" value={entryForm.notes} onChange={(e) => setEntryForm((p) => ({ ...p, notes: e.target.value }))}
            style={{ background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ fontSize: 12, padding: "5px 14px", background: "#1a3a5c", border: "1px solid #2563eb", borderRadius: 4, color: "#93c5fd", cursor: "pointer" }}>Add to Watchlist</button>
            <button type="button" onClick={() => setShowAddEntry(false)} style={{ fontSize: 12, padding: "5px 10px", background: "var(--bg-panel-raised)", border: "1px solid var(--border-hairline)", borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer" }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Watchlist selector + search */}
      <div style={{ padding: "10px 20px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={selectedWatchlist || ""} onChange={(e) => setSelectedWatchlist(e.target.value || null)}
          style={{ flex: 1, minWidth: 160, background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)" }}>
          <option value="">All watchlists</option>
          {watchlists.map((wl) => (
            <option key={wl.id} value={wl.id}>{wl.name} ({wl.category})</option>
          ))}
        </select>
        <input placeholder="Search plate…" value={searchPlate} onChange={(e) => setSearchPlate(e.target.value)}
          style={{ flex: 1, minWidth: 140, background: "var(--bg-panel)", border: "1px solid var(--border-hairline)", borderRadius: 4, padding: "6px 10px", fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }} />
      </div>

      {/* Entries table */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
        {loading && <div style={{ padding: 16, color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</div>}
        {!loading && entries.length === 0 && (
          <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
            No watchlist entries found.
          </div>
        )}
        {!loading && entries.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-hairline)" }}>
                {["Plate", "Priority", "Type", "Status", "Added"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border-hairline)" }}>
                  <td style={{ padding: "8px 10px" }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{e.registration_number || "—"}</span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[e.priority] }}>{e.priority?.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--text-secondary)", fontSize: 12 }}>{e.entity_type}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ fontSize: 11, color: e.status === "active" ? "var(--accent-active)" : "var(--text-tertiary)" }}>{e.status}</span>
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--text-tertiary)", fontSize: 11 }}>{e.created_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
