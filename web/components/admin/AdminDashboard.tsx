'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  MapPin,
  Users,
  Calendar,
  LogOut,
  Wifi,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Lock,
  LockOpen,
  UserPlus,
} from 'lucide-react';
import type { ClockLog } from './MapView';
import AddWorkerModal from './AddWorkerModal';

// Dynamic import for Leaflet (SSR incompatible)
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-white rounded-xl border border-slate-200">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-brand-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Loading map…</p>
      </div>
    </div>
  ),
});

interface Worker {
  id: string;
  full_name: string;
  phone: string;
  employee_id: string;
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
  if (!worker.latest_event) return { label: 'No activity today', color: 'text-slate-400' };
  if (worker.latest_event.event_type === 'IN')
    return { label: `Working at ${worker.latest_event.site_name}`, color: 'text-brand-700' };
  return { label: 'Clocked out', color: 'text-slate-500' };
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
  const [showAddWorker, setShowAddWorker] = useState(false);

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
    if (!confirm(`Reset phone lock for ${worker.full_name}? They will be able to log in from a new phone.`)) return;
    setUnbindingId(worker.id);
    try {
      const res = await fetch('/api/admin/reset-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: worker.id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Phone lock reset for ${worker.full_name}`);
        fetchWorkers();
      } else {
        showToast(data.error ?? 'Failed to reset phone lock', 'error');
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

  const anomalyCount = logs.filter(
    (l) => l.is_mock_location || l.within_geofence === false || l.sequence_anomaly
  ).length;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* ── Toast ── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 right-4 z-[9999] flex items-center gap-2.5 pl-3 pr-4 py-3 rounded-xl shadow-lg shadow-slate-900/10 text-sm font-medium bg-white border-l-4 text-slate-800 transition-all ${
            toast.type === 'success' ? 'border-brand-600' : 'border-red-600'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle size={18} className="text-brand-600 shrink-0" />
          ) : (
            <XCircle size={18} className="text-red-600 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}

      {/* ──────────────── SIDEBAR ──────────────── */}
      <aside className="w-[320px] min-w-[320px] bg-white border-r border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
              <MapPin className="text-white" size={15} strokeWidth={2.25} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">EmpAtt</h1>
          </div>
          <p className="text-xs text-slate-500">Field Worker Admin Dashboard</p>
        </div>

        {/* Date Selector */}
        <div className="px-5 py-4 border-b border-slate-200">
          <label
            htmlFor="date-select"
            className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 mb-2 tracking-wide uppercase"
          >
            <Calendar size={12} />
            Select Date
          </label>
          <input
            id="date-select"
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setSelectedWorker(null);
              setLogs([]);
            }}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
          />
        </div>

        {/* Workers List */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 tracking-wide uppercase">
              <Users size={12} />
              Field Workers ({workers.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddWorker(true)}
                aria-label="Add worker"
                title="Add worker"
                className="text-slate-400 hover:text-brand-600 transition-colors cursor-pointer p-1 -m-1 rounded"
              >
                <UserPlus size={15} />
              </button>
              <button
                onClick={fetchWorkers}
                disabled={loadingWorkers}
                aria-label="Refresh worker list"
                className="text-slate-400 hover:text-brand-600 transition-colors cursor-pointer p-1 -m-1 rounded"
              >
                <RefreshCw size={14} className={loadingWorkers ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {loadingWorkers ? (
            <div className="px-5 py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-brand-600 mx-auto" />
            </div>
          ) : workers.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-400 text-sm mb-3">No workers yet</p>
              <button
                onClick={() => setShowAddWorker(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-lg px-3 py-2 transition-colors cursor-pointer"
              >
                <UserPlus size={14} />
                Add your first worker
              </button>
            </div>
          ) : (
            <ul className="px-3 pb-4 space-y-1">
              {workers.map((worker) => {
                const { label, color } = statusLabel(worker);
                const isSelected = selectedWorker?.id === worker.id;

                return (
                  <li key={worker.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectWorker(worker)}
                      aria-pressed={isSelected}
                      className={`w-full text-left rounded-xl px-3 py-3 cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-brand-50 border-brand-200'
                          : 'border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">{worker.full_name}</p>
                          <p className="text-xs text-slate-500 truncate">{worker.phone} · {worker.employee_id}</p>
                          <p className={`text-xs mt-1 font-medium ${color}`}>{label}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {/* Phone lock badge */}
                          <span
                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              worker.is_bound
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-slate-50 text-slate-400'
                            }`}
                            title={worker.is_bound ? 'Phone locked' : 'No phone locked yet'}
                          >
                            {worker.is_bound ? (
                              <Lock size={10} />
                            ) : (
                              <LockOpen size={10} />
                            )}
                            {worker.is_bound ? 'Locked' : 'Not locked'}
                          </span>
                        </div>
                      </div>

                      {/* Reset Phone Lock */}
                      {worker.is_bound && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnbind(worker);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              e.preventDefault();
                              handleUnbind(worker);
                            }
                          }}
                          aria-disabled={unbindingId === worker.id}
                          className="mt-2 w-full text-[11px] text-red-600 border border-red-100 hover:bg-red-50 rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          {unbindingId === worker.id ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : (
                            <LockOpen size={10} />
                          )}
                          Reset Phone Lock
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 hover:bg-red-50 rounded-lg py-1.5 transition-colors cursor-pointer min-h-[32px]"
          >
            <LogOut size={12} />
            Log Out
          </button>
          <p className="text-[10px] text-slate-400 text-center">
            EmpAtt MVP · Field Worker Tracking
          </p>
        </div>
      </aside>

      {/* ──────────────── MAIN MAP AREA ──────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Map Topbar */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div>
            {selectedWorker ? (
              <>
                <h2 className="font-bold text-base text-slate-900">{selectedWorker.full_name}</h2>
                <p className={`text-xs font-medium ${statusColor}`}>{statusText}</p>
              </>
            ) : (
              <>
                <h2 className="font-bold text-base text-slate-400">Select a worker</h2>
                <p className="text-xs text-slate-400">Click a worker in the sidebar to view their journey</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {selectedWorker && (
              <div className="text-right">
                <p className="text-xs text-slate-500">
                  {logs.length} event{logs.length !== 1 ? 's' : ''} on {selectedDate}
                </p>
                {anomalyCount > 0 && (
                  <p className="text-xs text-amber-700 flex items-center gap-1 justify-end">
                    <AlertTriangle size={12} />
                    {anomalyCount} anomal{anomalyCount !== 1 ? 'ies' : 'y'} detected
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-100 px-3 py-1.5 rounded-full">
              <Wifi size={12} />
              Live
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 p-4 relative">
          {!selectedWorker ? (
            <div className="h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <MapPin size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No worker selected</p>
                <p className="text-slate-400 text-sm mt-1">
                  Select a worker from the sidebar to view their GPS journey
                </p>
              </div>
            </div>
          ) : loadingLogs ? (
            <div className="h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-brand-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Fetching GPS data…</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <Clock size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No clock events</p>
                <p className="text-slate-400 text-sm mt-1">
                  {selectedWorker.full_name} has no recorded events on {selectedDate}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full rounded-xl overflow-hidden border border-slate-200">
              <MapView logs={logs} />
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center gap-6 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-600 inline-block" /> Clock IN
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Clock OUT
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> Anomaly (Mock GPS / Low Accuracy / Outside Geofence / Out of Sequence)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-8 border-b-2 border-dashed border-slate-400 inline-block" /> Journey Path
          </span>
        </div>
      </main>

      {showAddWorker && (
        <AddWorkerModal
          onClose={() => setShowAddWorker(false)}
          onCreated={fetchWorkers}
        />
      )}
    </div>
  );
}
