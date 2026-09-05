import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Marker } from "react-leaflet";
import L from "leaflet";

const GUJARAT_CENTER = [22.6, 71.6];

// CARTO Dark Matter raster tiles with API key.
// The {s}.basemaps.cartocdn.com/dark_all/ path is the working authenticated URL —
// it was loading tiles correctly before; adding ?key= removes the watermark.
// The /rastertiles/ path shown in their email example requires a different CDN
// setup and 404s from Docker (basemaps.cartocdn.com without subdomains).
const CARTO_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2xmo_1_9b12b7c0f3f90fce9c989d81";

const STATUS_COLOR = {
  active: "#3dd6c4",
  inactive: "#5b6b82",
  maintenance: "#f59e0b",
  decommissioned: "#3a1414",
};

function routeStopIcon(index, total) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const color = isFirst ? "#3dd6c4" : isLast ? "#ef4444" : "#e7ecf3";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};border:2px solid #0b0f14;
      box-shadow:0 0 0 2px ${color}66;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function MapView({ cameras, activeRoute, onCameraClick }) {
  const routeLatLngs = useMemo(
    () => (activeRoute ? activeRoute.route.map((r) => [r.latitude, r.longitude]) : []),
    [activeRoute]
  );

  return (
    <MapContainer
      center={GUJARAT_CENTER}
      zoom={7}
      style={{ height: "100%", width: "100%", background: "var(--bg-void)" }}
      zoomControl={true}
    >
      <TileLayer
        url={CARTO_TILE_URL}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />

      {cameras.map((cam) => (
        <CircleMarker
          key={cam.id}
          center={[cam.latitude, cam.longitude]}
          radius={6}
          pathOptions={{
            color: STATUS_COLOR[cam.status] || STATUS_COLOR.inactive,
            fillColor: STATUS_COLOR[cam.status] || STATUS_COLOR.inactive,
            fillOpacity: 0.85,
            weight: 2,
          }}
          eventHandlers={onCameraClick ? { click: () => onCameraClick(cam) } : {}}
        >
          <Popup>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <strong>{cam.camera_code}</strong>
              <br />
              {cam.name}
              <br />
              {cam.district}
              <br />
              Status: <span style={{ color: STATUS_COLOR[cam.status] || "#aaa" }}>{cam.status}</span>
              {onCameraClick && (
                <>
                  <br />
                  <button
                    onClick={() => onCameraClick(cam)}
                    style={{
                      marginTop: 6, fontSize: 11, padding: "3px 8px",
                      background: "#1a2a3a", border: "1px solid #3dd6c4",
                      color: "#3dd6c4", borderRadius: 4, cursor: "pointer",
                    }}
                  >
                    View Feed
                  </button>
                </>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {activeRoute && (
        <>
          <Polyline
            positions={routeLatLngs}
            pathOptions={{ color: "#3dd6c4", weight: 3, opacity: 0.8, dashArray: "6 6" }}
          />
          {activeRoute.route.map((stop, i) => (
            <Marker
              key={stop.detection_id}
              position={[stop.latitude, stop.longitude]}
              icon={routeStopIcon(i, activeRoute.route.length)}
            >
              <Popup>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <strong>{stop.camera_code}</strong> — {stop.camera_name}
                  <br />
                  {new Date(stop.timestamp).toLocaleString()}
                  <br />
                  OCR conf: {(stop.ocr_confidence ?? 0).toFixed(2)}
                  {stop.evidence_uri && (
                    <>
                      <br />
                      <a href={stop.evidence_uri} target="_blank" rel="noreferrer"
                        style={{ color: "#3dd6c4" }}>Evidence</a>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
