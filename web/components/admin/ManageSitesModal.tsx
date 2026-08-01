'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { X, MapPin, AlertCircle, Plus, Trash2, RefreshCw, ChevronLeft } from 'lucide-react';

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
  const [view, setView] = useState<'list' | 'add'>('list');

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
        setView('list'); // Go back to list on success
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
    <div className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-3xl overflow-hidden flex flex-col h-[90vh] sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            {view === 'add' && (
              <button
                onClick={() => {
                  setError(null);
                  setView('list');
                }}
                className="p-1.5 -ml-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {view === 'list' ? 'Manage Work Sites' : 'Add New Work Site'}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {view === 'list' 
                  ? 'Add, view, and remove location boundaries for worker clock-ins.' 
                  : 'Define a new geofenced area for your team.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0 bg-slate-50/50">
          
          {/* ──────────────── LIST VIEW ──────────────── */}
          {view === 'list' && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 pb-2 shrink-0 flex justify-end">
                <button
                  onClick={() => {
                    setError(null);
                    setView('add');
                  }}
                  className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all"
                >
                  <Plus size={16} strokeWidth={2.5} />
                  Add New Site
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-6 pt-4">
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}
                
                {loading ? (
                  <div className="flex justify-center p-12">
                    <RefreshCw size={24} className="animate-spin text-brand-600" />
                  </div>
                ) : sites.length === 0 ? (
                  <div className="text-center p-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                    <MapPin size={48} className="mx-auto mb-4 text-slate-300" />
                    <p className="font-semibold text-lg text-slate-700">No work sites yet.</p>
                    <p className="text-sm mt-1 mb-6 max-w-sm mx-auto">Create geofenced locations where your workers are permitted to clock in and out.</p>
                    <button
                      onClick={() => {
                        setError(null);
                        setView('add');
                      }}
                      className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all"
                    >
                      <Plus size={16} strokeWidth={2.5} />
                      Add Your First Site
                    </button>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sites.map(site => (
                      <li key={site.id} className="border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative bg-white group flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900 text-lg pr-8 mb-3">{site.name}</h4>
                          <div className="text-xs text-slate-500 grid grid-cols-2 gap-x-4 gap-y-3">
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">Latitude</span>
                              <span className="font-medium text-slate-700">{site.latitude.toFixed(5)}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">Longitude</span>
                              <span className="font-medium text-slate-700">{site.longitude.toFixed(5)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 font-semibold text-xs border border-brand-100">
                            <MapPin size={12} /> {site.radius_meters}m Radius
                          </span>
                          <button
                            onClick={() => handleDelete(site.id)}
                            disabled={deletingId === site.id}
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50 transition-colors p-2 rounded-lg"
                            title="Delete Site"
                          >
                            {deletingId === site.id ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ──────────────── ADD VIEW ──────────────── */}
          {view === 'add' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-6 flex justify-center">
              <form onSubmit={handleAddSite} className="flex flex-col gap-5 w-full max-w-xl">
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
                      className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${inputMode === 'map' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Drop Pin on Map
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('link')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${inputMode === 'link' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Paste Map Link
                    </button>
                  </div>
                </div>

                {inputMode === 'link' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1.5 flex justify-between items-center">
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
                          return;
                        }

                        // Server-side resolve
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
                    {!latitude ? (
                      <p className="text-[10px] text-slate-500 mt-2">Paste a link to extract coordinates and see preview below.</p>
                    ) : (
                      <p className="text-[10px] text-brand-600 font-bold flex items-center gap-1 mt-2">
                        <RefreshCw size={10} className="text-brand-600" /> Location extracted successfully!
                      </p>
                    )}
                  </div>
                )}

                <div className="flex-1 min-h-[250px] relative rounded-xl border border-slate-200 overflow-hidden shadow-inner bg-slate-100">
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
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex justify-between">
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
                  className="w-full py-3.5 mt-2 bg-brand-600 hover:bg-brand-700 text-white text-base font-bold rounded-xl shadow-md shadow-brand-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {adding ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={2.5} />}
                  Create Work Site
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
