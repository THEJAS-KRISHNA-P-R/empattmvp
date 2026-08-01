'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon paths broken by webpack. `_getIconUrl` isn't in
// Leaflet's public type definitions (it's an internal implementation
// detail we're deliberately removing), so a narrow local type is more
// honest here than `any`.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom SVG circle icons — colors pulled from the same design tokens as
// the rest of the app (brand green / red / amber), not arbitrary hexes.
function makeCircleIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:20px;height:20px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 1px 4px rgba(15,23,42,0.35);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -13],
  });
}

const inIcon = makeCircleIcon('#0F8060'); // brand-600
const outIcon = makeCircleIcon('#DC2626'); // red-600
const warningIcon = makeCircleIcon('#D97706'); // amber-600

export interface ClockLog {
  id: string;
  event_type: 'IN' | 'OUT';
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  is_mock_location: boolean;
  distance_from_site_meters: number | null;
  within_geofence: boolean | null;
  sequence_anomaly: boolean;
  client_timestamp: string;
  site_name: string;
}

interface Props {
  logs: ClockLog[];
}

/** Re-centres the map whenever logs change */
function MapFocuser({ logs }: { logs: ClockLog[] }) {
  const map = useMap();
  useEffect(() => {
    if (logs.length === 0) return;
    const points = logs.map((l) => [l.latitude, l.longitude] as [number, number]);
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  }, [logs, map]);
  return null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MapView({ logs }: Props) {
  const hasWarning = (log: ClockLog) =>
    log.is_mock_location ||
    log.accuracy_meters > 100 ||
    log.within_geofence === false ||
    log.sequence_anomaly;

  // Build polylines: connect consecutive events sequentially, tracing the
  // worker's full day (IN -> OUT -> IN -> OUT...), matching what the
  // Journey Path legend entry actually shows.
  const polylineSegments: [number, number][][] = [];
  for (let i = 0; i < logs.length - 1; i++) {
    polylineSegments.push([
      [logs[i].latitude, logs[i].longitude],
      [logs[i + 1].latitude, logs[i + 1].longitude],
    ]);
  }

  // Default centre: Bangalore (falls back if no logs)
  const defaultCenter: [number, number] = logs.length > 0
    ? [logs[0].latitude, logs[0].longitude]
    : [12.9716, 77.5946];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      className="rounded-xl"
    >
      {/* CARTO Positron — a light, low-saturation basemap, deliberately
          chosen over stock OSM tiles so the map matches the app's light
          theme instead of OSM's more saturated default styling. Free,
          no API key, attribution required (included below). */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />

      <MapFocuser logs={logs} />

      {/* Journey polylines (dashed) */}
      {polylineSegments.map((segment, i) => (
        <Polyline
          key={i}
          positions={segment}
          pathOptions={{
            color: '#64748B', // slate-500 — neutral, doesn't compete with brand/status colors
            weight: 3,
            dashArray: '8 6',
            opacity: 0.7,
          }}
        />
      ))}

      {/* Pins for each event */}
      {logs.map((log) => {
        const warn = hasWarning(log);
        const icon = warn ? warningIcon : log.event_type === 'IN' ? inIcon : outIcon;

        return (
          <Marker
            key={log.id}
            position={[log.latitude, log.longitude]}
            icon={icon}
          >
            <Tooltip direction="right" offset={[10, 0]} opacity={0.9} permanent className="!bg-white !border-slate-200 !text-slate-700 !shadow-sm !font-sans !rounded-md !px-2 !py-1">
              <div className="text-[11px] font-bold tracking-wide">
                {log.event_type} <span className="font-medium text-slate-500">{formatTime(log.client_timestamp)}</span>
              </div>
            </Tooltip>
            <Popup>
              <div className="text-sm min-w-[180px]">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded-full ${
                      log.event_type === 'IN'
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    CLOCK {log.event_type}
                  </span>
                  {warn && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">
                      ⚠ Anomaly
                    </span>
                  )}
                </div>
                <p className="text-slate-700 font-medium">{log.site_name}</p>
                <p className="text-slate-500 text-xs mt-1">{formatTime(log.client_timestamp)}</p>
                <p className="text-slate-400 text-xs">±{log.accuracy_meters.toFixed(0)}m accuracy</p>
                {log.is_mock_location && (
                  <p className="text-amber-700 text-xs font-semibold mt-1">
                    Mock GPS detected
                  </p>
                )}
                {log.accuracy_meters > 100 && !log.is_mock_location && (
                  <p className="text-amber-700 text-xs font-semibold mt-1">
                    Low GPS accuracy
                  </p>
                )}
                {log.within_geofence === false && (
                  <p className="text-amber-700 text-xs font-semibold mt-1">
                    {log.distance_from_site_meters ?? '?'}m from site (outside geofence)
                  </p>
                )}
                {log.sequence_anomaly && (
                  <p className="text-amber-700 text-xs font-semibold mt-1">
                    Out of sequence (unexpected {log.event_type})
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
