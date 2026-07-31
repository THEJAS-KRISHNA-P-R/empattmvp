'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  MapPin,
  Users,
  Calendar,
  LogOut,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Smartphone,
  SmartphoneNfc,
} from 'lucide-react';
import type { ClockLog } from './MapView';

// Dynamic import for Leaflet (SSR incompatible)
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-900 rounded-xl">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading map…</p>
      </div>
    </div>
  ),
});

interface Worker {
  id: string;
  full_name: string;
  phone: string;
  is_bound: boolean;
  latest_event: {
    event_type: 'IN' | 'OUT';
    site_name: string;
    client_timestamp: string;
  } | null;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(worker: Worker): { label: string; color: string } {
  if (!worker.latest_event) return { label: 'No Activity Today', color: 'text-gray-400' };
  if (worker.latest_event.event_type === 'IN')
    return { label: `Working at ${worker.latest_event.site_name}`, color: 'text-green-400' };
  return { label: 'Clocked Out', color: 'text-red-400' };
}

export default function AdminDashboard() {
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [logs, setLogs] = useState<ClockLog[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [unbindingId, setUnbindingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchWorkers = useCallback(async () => {
    setLoadingWorkers(true);
    try {
      const res = await fetch(`/api/admin/workers?date=${selectedDate}`);
      const data = await res.json();
      setWorkers(data.workers ?? []);
    } catch {
      showToast('Failed to load workers', 'error');
    } finally {
      setLoadingWorkers(false);
    }
  }, [selectedDate]);

  const fetchLogs = useCallback(async (workerId: string) => {
    setLoadingLogs(true);
    setLogs([]);
    try {
      const res = await fetch(`/api/admin/clock-logs?worker_id=${workerId}&date=${selectedDate}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch {
      showToast('Failed to load map data', 'error');
    } finally {
      setLoadingLogs(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    // This is the standard "fetch on mount / refetch when selectedDate
    // changes" pattern. fetchWorkers sets loading state synchronously as
    // its first statement, which trips the newer set-state-in-effect
    // rule, but there's no real cascading-render problem here — it's a
    // single boolean flip on a fetch trigger, not a derived-state loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkers();
  }, [fetchWorkers]);

  const handleSelectWorker = (worker: Worker) => {
    setSelectedWorker(worker);
    fetchLogs(worker.id);
  };

  const handleUnbind = async (worker: Worker) => {
    if (!confirm(`Unbind device for ${worker.full_name}? They will be able to log in from any device.`)) return;
    setUnbindingId(worker.id);
    try {
      const res = await fetch('/api/admin/reset-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: worker.id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Device unbound for ${worker.full_name}`);
        fetchWorkers();
      } else {
        showToast(data.error ?? 'Failed to unbind', 'error');
      }
    } catch {
      showToast('Network error. Try again.', 'error');
    } finally {
      setUnbindingId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      window.location.href = '/admin/login';
    }
  };

  const { label: statusText, color: statusColor } = selectedWorker
    ? statusLabel(selectedWorker)
    : { label: '', color: '' };

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ──────────────── SIDEBAR ──────────────── */}
      <aside className="w-[320px] min-w-[320px] bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="text-indigo-400" size={20} />
            <h1 className="text-lg font-bold tracking-tight">EmpAtt</h1>
          </div>
          <p className="text-xs text-gray-500">Field Worker Admin Dashboard</p>
        </div>

        {/* Date Selector */}
        <div className="px-5 py-4 border-b border-gray-800">
          <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5 mb-2">
            <Calendar size={12} />
            SELECT DATE
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setSelectedWorker(null);
              setLogs([]);
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Workers List */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
              <Users size={12} />
              FIELD WORKERS ({workers.length})
            </span>
            <button
              onClick={fetchWorkers}
              disabled={loadingWorkers}
              className="text-gray-500 hover:text-indigo-400 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={loadingWorkers ? 'animate-spin' : ''} />
            </button>
          </div>

          {loadingWorkers ? (
            <div className="px-5 py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto" />
            </div>
          ) : workers.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">
              No active workers found
            </div>
          ) : (
            <ul className="px-3 pb-4 space-y-1">
              {workers.map((worker) => {
                const { label, color } = statusLabel(worker);
                const isSelected = selectedWorker?.id === worker.id;

                return (
                  <li key={worker.id}>
                    <div
                      onClick={() => handleSelectWorker(worker)}
                      className={`rounded-xl px-3 py-3 cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500/40'
                          : 'border-transparent hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{worker.full_name}</p>
                          <p className="text-xs text-gray-500 truncate">{worker.phone}</p>
                          <p className={`text-xs mt-1 font-medium ${color}`}>{label}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {/* Device binding badge */}
                          <span
                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              worker.is_bound
                                ? 'bg-blue-900/40 text-blue-400'
                                : 'bg-gray-700 text-gray-400'
                            }`}
                            title={worker.is_bound ? 'Device bound' : 'No device bound'}
                          >
                            {worker.is_bound ? (
                              <SmartphoneNfc size={10} />
                            ) : (
                              <Smartphone size={10} />
                            )}
                            {worker.is_bound ? 'Bound' : 'Free'}
                          </span>
                        </div>
                      </div>

                      {/* Unbind button */}
                      {worker.is_bound && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnbind(worker);
                          }}
                          disabled={unbindingId === worker.id}
                          className="mt-2 w-full text-[11px] text-red-400 border border-red-900/50 hover:bg-red-950/40 rounded-lg py-1 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          {unbindingId === worker.id ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : (
                            <WifiOff size={10} />
                          )}
                          Unbind Device
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-red-400 border border-gray-800 hover:border-red-900/50 rounded-lg py-1.5 transition-colors"
          >
            <LogOut size={12} />
            Log Out
          </button>
          <p className="text-[10px] text-gray-600 text-center">
            EmpAtt MVP · Field Worker Tracking
          </p>
        </div>
      </aside>

      {/* ──────────────── MAIN MAP AREA ──────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Map Topbar */}
        <div className="px-6 py-4 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
          <div>
            {selectedWorker ? (
              <>
                <h2 className="font-bold text-base">{selectedWorker.full_name}</h2>
                <p className={`text-xs font-medium ${statusColor}`}>{statusText}</p>
              </>
            ) : (
              <>
                <h2 className="font-bold text-base text-gray-400">Select a Worker</h2>
                <p className="text-xs text-gray-600">Click a worker in the sidebar to view their journey</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {selectedWorker && (
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  {logs.length} event{logs.length !== 1 ? 's' : ''} on {selectedDate}
                </p>
                {logs.some((l) => l.is_mock_location || l.within_geofence === false || l.sequence_anomaly) && (
                  <p className="text-xs text-yellow-500 flex items-center gap-1 justify-end">
                    <AlertTriangle size={12} />
                    {logs.filter((l) => l.is_mock_location || l.within_geofence === false || l.sequence_anomaly).length} anomal{logs.filter((l) => l.is_mock_location || l.within_geofence === false || l.sequence_anomaly).length !== 1 ? 'ies' : 'y'} detected
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-950/30 border border-green-900/40 px-3 py-1.5 rounded-full">
              <Wifi size={12} />
              Live
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 p-4 relative">
          {!selectedWorker ? (
            <div className="h-full rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              <div className="text-center">
                <MapPin size={48} className="text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No worker selected</p>
                <p className="text-gray-600 text-sm mt-1">
                  Select a worker from the sidebar to view their GPS journey
                </p>
              </div>
            </div>
          ) : loadingLogs ? (
            <div className="h-full rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Fetching GPS data…</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="h-full rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
              <div className="text-center">
                <Clock size={48} className="text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No clock events</p>
                <p className="text-gray-600 text-sm mt-1">
                  {selectedWorker.full_name} has no recorded events on {selectedDate}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full rounded-xl overflow-hidden border border-gray-800">
              <MapView logs={logs} />
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-6 py-3 bg-gray-900 border-t border-gray-800 flex items-center gap-6 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Clock IN
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Clock OUT
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Anomaly (Mock GPS / Low Accuracy / Outside Geofence / Out of Sequence)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-8 border-b-2 border-dashed border-indigo-400 inline-block" /> Journey Path
          </span>
        </div>
      </main>
    </div>
  );
}
