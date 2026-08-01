'use client';

import { useState, useEffect } from 'react';
import { X, MapPin, AlertCircle, Plus, Trash2, RefreshCw } from 'lucide-react';

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

  const [adding, setAdding] = useState(false);
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
      setError('Latitude, longitude, and radius must be valid numbers');
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
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">Manage Work Sites</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Add Site Form */}
          <div className="md:w-1/2 p-6 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50 overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-4 text-sm uppercase tracking-wide">Add New Site</h3>
            <form onSubmit={handleAddSite} className="flex flex-col gap-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Site Name</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Project Alpha"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Latitude</label>
                  <input
                    required
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="12.9716"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Longitude</label>
                  <input
                    required
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="77.5946"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Geofence Radius (meters)</label>
                <input
                  required
                  type="number"
                  min="50"
                  max="10000"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
                />
              </div>
              <button
                type="submit"
                disabled={adding}
                className="mt-2 w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {adding ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                Add Site
              </button>
            </form>
          </div>

          {/* List of Sites */}
          <div className="md:w-1/2 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-white shrink-0">
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Existing Sites</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-white">
              {loading ? (
                <div className="flex justify-center p-8">
                  <RefreshCw size={24} className="animate-spin text-brand-600" />
                </div>
              ) : sites.length === 0 ? (
                <div className="text-center p-8 text-slate-500">
                  <MapPin size={32} className="mx-auto mb-2 text-slate-300" />
                  <p>No work sites yet.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {sites.map(site => (
                    <li key={site.id} className="border border-slate-200 rounded-lg p-4 shadow-sm relative">
                      <h4 className="font-bold text-slate-900 pr-8">{site.name}</h4>
                      <div className="text-xs text-slate-500 mt-1 grid grid-cols-2 gap-y-1">
                        <span>Lat: {site.latitude}</span>
                        <span>Lng: {site.longitude}</span>
                        <span className="col-span-2 text-brand-700 font-medium">Radius: {site.radius_meters}m</span>
                      </div>
                      <button
                        onClick={() => handleDelete(site.id)}
                        disabled={deletingId === site.id}
                        className="absolute top-4 right-4 text-slate-400 hover:text-red-600 disabled:opacity-50 transition-colors p-1"
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
