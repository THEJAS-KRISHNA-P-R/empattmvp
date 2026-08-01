'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { X, MapPin, AlertCircle, Plus, Trash2, RefreshCw } from 'lucide-react';

const SitePickerMap = dynamic(() => import('./SitePickerMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-brand-600" />
    </div>
  ),
});

interface WorkSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface Props {
  onClose: () => void;
}

export default function ManageSitesModal({ onClose }: Props) {
  const [sites, setSites] = useState<WorkSite[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('200');

  const [inputMode, setInputMode] = useState<'map' | 'link'>('map');

  const [adding, setAdding] = useState(false);
  const [resolvingLink, setResolvingLink] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSites = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sites');
      const data = await res.json();
      setSites(data.sites ?? []);
    } catch {
      setError('Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSites();
  }, []);

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseInt(radius, 10);

    if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
      setError('Please select a valid location and radius first.');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/admin/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          latitude: lat,
          longitude: lng,
          radius_meters: rad,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setName('');
        setLatitude('');
        setLongitude('');
        setRadius('200');
        fetchSites();
      } else {
        setError(data.error ?? 'Failed to add site');
      }
    } catch {
      setError('Network error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this work site?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/sites/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSites();
      } else {
        const data = await res.json();
        setError(data.error ?? 'Failed to delete site');
      }
    } catch {
      setError('Network error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 lg:p-12">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Manage Work Sites</h2>
            <p className="text-sm text-slate-500 mt-1">Add, view, and remove location boundaries for worker clock-ins.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* ──────────────── ADD SITE FORM ──────────────── */}
          <div className="md:w-1/2 p-6 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50 overflow-y-auto flex flex-col">
            <h3 className="font-semibold text-slate-800 mb-5 text-sm uppercase tracking-wide">Add New Site</h3>
            <form onSubmit={handleAddSite} className="flex flex-col gap-5 flex-1">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 block">Site Name</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Project Alpha"
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 shadow-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 block">Location Method</label>
                <div className="flex bg-slate-200/50 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setInputMode('map')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${inputMode === 'map' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Drop Pin on Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('link')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${inputMode === 'link' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Paste Link
                  </button>
                </div>
              </div>

              {inputMode === 'link' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block flex justify-between items-center">
                    <span>Google Maps or OSM Link</span>
                    {resolvingLink && <span className="text-[10px] text-brand-600 flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Resolving link...</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="Paste link here..."
                    className="w-full px-4 py-2.5 bg-brand-50/50 border border-brand-200 rounded-lg text-sm font-medium text-brand-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 placeholder-brand-300"
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (!val) return;

                      // Quick local check first
                      const gmMatch = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || val.match(/\?q=(-?\d+\.\d+),(-?\d+\.\d+)/);
                      const osmMatch = val.match(/map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
                      const latLngMatch = val.match(/(-?\d+\.\d+)(?:,|\s)+(-?\d+\.\d+)/);
                      const localMatch = gmMatch || osmMatch || latLngMatch;
                      
                      if (localMatch) {
                        setLatitude(localMatch[1]);
                        setLongitude(localMatch[2]);
                        setTimeout(() => { e.target.value = ''; }, 500);
                        return;
                      }

                      // If it's a URL but didn't match locally (like a short link), resolve it server-side
                      if (val.startsWith('http')) {
                        setResolvingLink(true);
                        try {
                          const res = await fetch('/api/admin/resolve-link', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: val })
                          });
                          const data = await res.json();
                          if (res.ok && data.latitude && data.longitude) {
                            setLatitude(data.latitude.toString());
                            setLongitude(data.longitude.toString());
                            setTimeout(() => { e.target.value = ''; }, 500);
                          } else {
                            setError('Could not extract coordinates from that link.');
                          }
                        } catch {
                          setError('Failed to resolve link.');
                        } finally {
                          setResolvingLink(false);
                        }
                      }
                    }}
                  />
                  {!latitude && (
                    <p className="text-[10px] text-slate-500 mt-2">Paste a link to extract coordinates and see preview below.</p>
                  )}
                </div>
              )}

              <div className="flex-1 min-h-[200px] relative rounded-xl border border-slate-200 overflow-hidden shrink-0 shadow-inner bg-slate-100">
                {(inputMode === 'map' || (inputMode === 'link' && latitude)) ? (
                  <SitePickerMap
                    latitude={latitude ? parseFloat(latitude) : null}
                    longitude={longitude ? parseFloat(longitude) : null}
                    radiusMeters={parseInt(radius, 10) || 200}
                    readOnly={inputMode === 'link'}
                    onLocationSelect={(lat, lng) => {
                      if (inputMode === 'link') return;
                      setLatitude(lat.toFixed(6));
                      setLongitude(lng.toFixed(6));
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <MapPin size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-medium">Waiting for link...</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 block flex justify-between">
                  <span>Geofence Radius (meters)</span>
                  <span className="text-brand-600">{radius}m</span>
                </label>
                <input
                  required
                  type="range"
                  min="50"
                  max="5000"
                  step="50"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  className="w-full accent-brand-600"
                />
              </div>
              
              <button
                type="submit"
                disabled={adding || !latitude}
                className="w-full py-3 mt-auto bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl shadow-md shadow-brand-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {adding ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={2.5} />}
                Add Work Site
              </button>
            </form>
          </div>

          {/* ──────────────── EXISTING SITES ──────────────── */}
          <div className="md:w-1/2 flex flex-col overflow-hidden bg-white">
            <div className="px-6 py-5 border-b border-slate-100 shrink-0">
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Existing Sites ({sites.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex justify-center p-8">
                  <RefreshCw size={24} className="animate-spin text-brand-600" />
                </div>
              ) : sites.length === 0 ? (
                <div className="text-center p-12 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                  <MapPin size={40} className="mx-auto mb-3 text-slate-300" />
                  <p className="font-medium text-slate-700">No work sites yet.</p>
                  <p className="text-sm mt-1">Add your first site from the left panel.</p>
                </div>
              ) : (
                <ul className="grid gap-4">
                  {sites.map(site => (
                    <li key={site.id} className="border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative bg-white group">
                      <h4 className="font-bold text-slate-900 text-base pr-8 mb-2">{site.name}</h4>
                      <div className="text-xs text-slate-500 grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Lat</span>
                          <span className="font-medium text-slate-700">{site.latitude.toFixed(5)}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Lng</span>
                          <span className="font-medium text-slate-700">{site.longitude.toFixed(5)}</span>
                        </div>
                        <div className="col-span-2 mt-1">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 font-semibold text-xs border border-brand-100">
                            Radius: {site.radius_meters}m
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(site.id)}
                        disabled={deletingId === site.id}
                        className="absolute top-4 right-4 text-slate-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors p-2 rounded-lg opacity-0 group-hover:opacity-100"
                        title="Delete Site"
                      >
                        {deletingId === site.id ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
