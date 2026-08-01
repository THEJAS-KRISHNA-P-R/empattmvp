'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  MapPin,
  Users,
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
  Search,
  Settings,
  Edit2,
  Trash2
} from 'lucide-react';
import type { ClockLog } from './MapView';
import AddWorkerModal from './AddWorkerModal';
import EditWorkerModal from './EditWorkerModal';
import ManageSitesModal from './ManageSitesModal';
import TimelinePane from './TimelinePane';

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

export interface Worker {
  id: string;
  full_name: string;
  phone: string;
  employee_id: string;
  is_bound: boolean;
  pin?: string;
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
  const [focusedCoordinate, setFocusedCoordinate] = useState<[number, number] | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMobileTab, setActiveMobileTab] = useState<'workers' | 'map' | 'timeline'>('workers');

  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [unbindingId, setUnbindingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showEditWorker, setShowEditWorker] = useState<Worker | null>(null);
  const [showManageSites, setShowManageSites] = useState(false);

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
      // If the selected worker is in the updated list, keep it selected, else clear
      if (selectedWorker) {
        const stillExists = (data.workers ?? []).find((w: Worker) => w.id === selectedWorker.id);
        if (!stillExists) setSelectedWorker(null);
      }
    } catch {
      showToast('Failed to load workers', 'error');
    } finally {
      setLoadingWorkers(false);
    }
  }, [selectedDate, selectedWorker]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const handleSelectWorker = (worker: Worker) => {
    setSelectedWorker(worker);
    fetchLogs(worker.id);
    if (window.innerWidth < 768) setActiveMobileTab('map');
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

  const handleDeleteWorker = async (worker: Worker) => {
    if (!confirm(`Are you sure you want to completely delete ${worker.full_name}? This action cannot be undone.`)) return;
    setDeletingId(worker.id);
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(`Worker deleted`);
        fetchWorkers();
      } else {
        showToast(data.error ?? 'Failed to delete worker', 'error');
      }
    } catch {
      showToast('Network error. Try again.', 'error');
    } finally {
      setDeletingId(null);
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

  const filteredWorkers = workers.filter(
    w => w.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
         w.phone.includes(searchQuery) ||
         w.employee_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans pb-16 md:pb-0">
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
      <aside className={`w-full md:w-[320px] md:min-w-[320px] bg-white border-r border-slate-200 flex-col overflow-hidden ${activeMobileTab === 'workers' ? 'flex' : 'hidden md:flex'}`}>
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
              <MapPin className="text-white" size={15} strokeWidth={2.25} />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">EmpAtt</h1>
          </div>
          <p className="text-xs text-slate-500">Field Worker Admin</p>
        </div>

        {/* Date Selector */}
        <div className="px-5 py-3 border-b border-slate-200 shrink-0">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setSelectedWorker(null);
              setLogs([]);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
          />
        </div>

        {/* Search & Actions */}
        <div className="px-5 py-3 border-b border-slate-200 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 tracking-wide uppercase">
              <Users size={12} />
              Workers ({filteredWorkers.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddWorker(true)}
                title="Add worker"
                className="bg-brand-600 hover:bg-brand-700 text-white transition-colors cursor-pointer p-1.5 rounded flex items-center justify-center shadow-sm"
              >
                <UserPlus size={14} strokeWidth={2.5} />
              </button>
              <button
                onClick={fetchWorkers}
                disabled={loadingWorkers}
                title="Refresh"
                className="text-slate-400 hover:text-brand-600 transition-colors cursor-pointer p-1 rounded"
              >
                <RefreshCw size={14} className={loadingWorkers ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={14} className="text-slate-400" />
            </div>
            <input
              type="search"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
            />
          </div>
        </div>

        {/* Workers List */}
        <div className="flex-1 overflow-y-auto">
          {loadingWorkers ? (
            <div className="px-5 py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-brand-600 mx-auto" />
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-400 text-sm mb-3">No workers found</p>
              {workers.length === 0 && (
                <button
                  onClick={() => setShowAddWorker(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-lg px-3 py-2 transition-colors cursor-pointer"
                >
                  <UserPlus size={14} />
                  Add your first worker
                </button>
              )}
            </div>
          ) : (
            <ul className="px-3 py-2 space-y-1">
              {filteredWorkers.map((worker) => {
                const { label, color } = statusLabel(worker);
                const isSelected = selectedWorker?.id === worker.id;

                return (
                  <li key={worker.id} className="relative group">
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
                        <div className="flex-1 min-w-0 pr-8">
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
                            {worker.is_bound ? <Lock size={10} /> : <LockOpen size={10} />}
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
                          className="mt-2 w-full text-[11px] text-red-600 border border-red-100 hover:bg-red-50 rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          {unbindingId === worker.id ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : (
                            <LockOpen size={10} />
                          )}
                          Reset Lock
                        </span>
                      )}
                    </button>
                    {/* Hover Actions */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setShowEditWorker(worker); }} className="p-1.5 bg-white text-slate-500 hover:text-brand-600 rounded-md shadow-sm border border-slate-200">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteWorker(worker); }} disabled={deletingId === worker.id} className="p-1.5 bg-white text-slate-500 hover:text-red-600 rounded-md shadow-sm border border-slate-200">
                        {deletingId === worker.id ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 space-y-2 shrink-0 bg-slate-50">
          <button
            onClick={() => setShowManageSites(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-600 hover:text-brand-700 bg-white border border-slate-200 hover:border-brand-200 hover:bg-brand-50 rounded-lg py-2 transition-colors cursor-pointer font-medium"
          >
            <Settings size={14} />
            Manage Work Sites
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 hover:bg-red-50 bg-white rounded-lg py-1.5 transition-colors cursor-pointer min-h-[32px]"
          >
            <LogOut size={12} />
            Log Out
          </button>
        </div>
      </aside>

      {/* ──────────────── MAIN MAP AREA ──────────────── */}
      <main className={`flex-1 flex-col overflow-hidden ${activeMobileTab === 'map' ? 'flex' : 'hidden md:flex'}`}>
        {/* Map Topbar */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            {selectedWorker ? (
              <>
                <h2 className="font-bold text-base text-slate-900">{selectedWorker.full_name}</h2>
                <p className={`text-xs font-medium ${statusColor}`}>{statusText}</p>
              </>
            ) : (
              <>
                <h2 className="font-bold text-base text-slate-400">Select a worker</h2>
                <p className="text-xs text-slate-400">Click a worker to view their journey</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {selectedWorker && (
              <div className="text-right hidden sm:block">
                <p className="text-xs text-slate-500">
                  {logs.length} event{logs.length !== 1 ? 's' : ''} on {selectedDate}
                </p>
                {anomalyCount > 0 && (
                  <p className="text-xs text-amber-700 flex items-center gap-1 justify-end">
                    <AlertTriangle size={12} />
                    {anomalyCount} anomal{anomalyCount !== 1 ? 'ies' : 'y'}
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
        <div className="flex-1 p-0 md:p-4 relative">
          {!selectedWorker ? (
            <div className="h-full md:rounded-xl bg-white border-x-0 md:border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <MapPin size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No worker selected</p>
                <p className="text-slate-400 text-sm mt-1">
                  Select a worker from the sidebar to view their GPS journey
                </p>
              </div>
            </div>
          ) : loadingLogs ? (
            <div className="h-full md:rounded-xl bg-white border-x-0 md:border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-brand-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Fetching GPS data…</p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="h-full md:rounded-xl bg-white border-x-0 md:border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <Clock size={40} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No clock events</p>
                <p className="text-slate-400 text-sm mt-1">
                  {selectedWorker.full_name} has no recorded events on {selectedDate}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full md:rounded-xl overflow-hidden md:border border-slate-200">
              <MapView logs={logs} focusedCoordinate={focusedCoordinate} />
            </div>
          )}
        </div>
      </main>

      {/* ──────────────── TIMELINE AREA ──────────────── */}
      <aside className={`w-full md:w-[360px] md:min-w-[360px] bg-white border-l border-slate-200 flex-col overflow-hidden ${activeMobileTab === 'timeline' ? 'flex' : 'hidden xl:flex'}`}>
        {!selectedWorker ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 bg-slate-50">
            <Clock size={32} className="text-slate-300 mb-2" />
            <p className="text-slate-500 font-medium">Event Timeline</p>
            <p className="text-slate-400 text-sm mt-1">Select a worker to see their full day&apos;s history here.</p>
          </div>
        ) : (
          <TimelinePane 
            logs={logs} 
            workerName={selectedWorker.full_name} 
            date={selectedDate} 
            onLogClick={(lat, lng) => {
              setFocusedCoordinate([lat, lng]);
              if (window.innerWidth < 1280 && window.innerWidth >= 768) {
                // Not mobile, but maybe not xl where timeline is always visible
              } else if (window.innerWidth < 768) {
                setActiveMobileTab('map');
              }
            }}
          />
        )}
      </aside>

      {/* ──────────────── MOBILE BOTTOM NAV ──────────────── */}
      <div className="md:hidden flex bg-white border-t border-slate-200 fixed bottom-0 left-0 right-0 z-[9999]">
        <button onClick={() => setActiveMobileTab('workers')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 ${activeMobileTab === 'workers' ? 'text-brand-600' : 'text-slate-500'}`}>
          <Users size={18} />
          <span className="text-[10px] font-medium">Workers</span>
        </button>
        <button onClick={() => setActiveMobileTab('map')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 ${activeMobileTab === 'map' ? 'text-brand-600' : 'text-slate-500'}`}>
          <MapPin size={18} />
          <span className="text-[10px] font-medium">Map</span>
        </button>
        <button onClick={() => setActiveMobileTab('timeline')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 ${activeMobileTab === 'timeline' ? 'text-brand-600' : 'text-slate-500'}`}>
          <Clock size={18} />
          <span className="text-[10px] font-medium">Timeline</span>
        </button>
      </div>

      {showAddWorker && (
        <AddWorkerModal
          onClose={() => setShowAddWorker(false)}
          onCreated={fetchWorkers}
        />
      )}

      {showEditWorker && (
        <EditWorkerModal
          worker={showEditWorker}
          onClose={() => setShowEditWorker(null)}
          onUpdated={fetchWorkers}
        />
      )}

      {showManageSites && (
        <ManageSitesModal
          onClose={() => setShowManageSites(false)}
        />
      )}
    </div>
  );
}
