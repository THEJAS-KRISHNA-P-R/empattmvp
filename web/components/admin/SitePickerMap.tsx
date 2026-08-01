'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function makeCircleIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:24px;height:24px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 5px rgba(15,23,42,0.4);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

const siteIcon = makeCircleIcon('#0F8060');

interface Props {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  onLocationSelect: (lat: number, lng: number) => void;
}

function LocationPicker({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapFocuser({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  const [hasCentered, setHasCentered] = useState(false);

  useEffect(() => {
    if (lat !== null && lng !== null && !hasCentered) {
      map.flyTo([lat, lng], 15, { animate: false });
      setHasCentered(true);
    }
  }, [lat, lng, map, hasCentered]);

  return null;
}

export default function SitePickerMap({ latitude, longitude, radiusMeters, onLocationSelect }: Props) {
  // Default to Bangalore if no coordinates provided yet
  const center: [number, number] = latitude !== null && longitude !== null 
    ? [latitude, longitude] 
    : [12.9716, 77.5946];

  return (
    <div className="h-full w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
      <MapContainer
        center={center}
        zoom={latitude ? 15 : 4}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <LocationPicker onSelect={onLocationSelect} />
        <MapFocuser lat={latitude} lng={longitude} />

        {latitude !== null && longitude !== null && (
          <>
            <Marker position={[latitude, longitude]} icon={siteIcon} />
            <Circle
              center={[latitude, longitude]}
              radius={radiusMeters}
              pathOptions={{
                color: '#0F8060',
                fillColor: '#0F8060',
                fillOpacity: 0.15,
                weight: 2,
              }}
            />
          </>
        )}
      </MapContainer>
      <div className="absolute top-2 right-2 z-[400] bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 shadow-sm border border-slate-200 pointer-events-none">
        Click anywhere to drop a pin
      </div>
    </div>
  );
}
