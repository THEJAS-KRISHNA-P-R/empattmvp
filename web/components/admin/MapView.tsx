'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon paths broken by webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom SVG circle icons
function makeCircleIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

const greenIcon = makeCircleIcon('#22c55e');
const redIcon = makeCircleIcon('#ef4444');
const warningIcon = makeCircleIcon('#f59e0b');

export interface ClockLog {
  id: string;
  event_type: 'IN' | 'OUT';
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  is_mock_location: boolean;
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
  const hasWarning = (log: ClockLog) => log.is_mock_location || log.accuracy_meters > 100;

  // Build polylines: connect IN → OUT pairs sequentially
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapFocuser logs={logs} />

      {/* Journey polylines (dashed) */}
      {polylineSegments.map((segment, i) => (
        <Polyline
          key={i}
          positions={segment}
          pathOptions={{
            color: '#6366f1',
            weight: 3,
            dashArray: '8 6',
            opacity: 0.8,
          }}
        />
      ))}

      {/* Pins for each event */}
      {logs.map((log) => {
        const warn = hasWarning(log);
        const icon = warn ? warningIcon : log.event_type === 'IN' ? greenIcon : redIcon;

        return (
          <Marker
            key={log.id}
            position={[log.latitude, log.longitude]}
            icon={icon}
          >
            <Popup>
              <div className="text-sm min-w-[180px]">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded-full ${
                      log.event_type === 'IN'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    CLOCK {log.event_type}
                  </span>
                  {warn && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold">
                      ⚠ Anomaly
                    </span>
                  )}
                </div>
                <p className="text-gray-700 font-medium">{log.site_name}</p>
                <p className="text-gray-500 text-xs mt-1">{formatTime(log.client_timestamp)}</p>
                <p className="text-gray-400 text-xs">±{log.accuracy_meters.toFixed(0)}m accuracy</p>
                {log.is_mock_location && (
                  <p className="text-yellow-600 text-xs font-semibold mt-1">
                    🚨 Mock GPS Detected
                  </p>
                )}
                {log.accuracy_meters > 100 && !log.is_mock_location && (
                  <p className="text-yellow-600 text-xs font-semibold mt-1">
                    ⚠ Low GPS Accuracy
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
