import React from 'react';
import { ClockLog } from './MapView';
import { MapPin, AlertTriangle, Clock } from 'lucide-react';

interface Props {
  logs: ClockLog[];
  workerName: string;
  date: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TimelinePane({ logs, workerName, date }: Props) {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 bg-slate-50">
        <Clock size={32} className="text-slate-300 mb-2" />
        <p className="text-slate-500 font-medium">No Activity</p>
        <p className="text-slate-400 text-sm mt-1">No events recorded for {workerName} on {date}.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 border-l border-slate-200">
      <div className="px-5 py-4 bg-white border-b border-slate-200 shrink-0">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Clock size={16} className="text-brand-600" />
          Event Timeline
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{workerName} • {date}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
          {logs.map((log) => {
            const isWarning =
              log.is_mock_location ||
              log.within_geofence === false ||
              log.sequence_anomaly ||
              log.accuracy_meters > 100;
            
            const isClockIn = log.event_type === 'IN';

            return (
              <div key={log.id} className="relative pl-6">
                <div
                  className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                    isWarning ? 'bg-amber-500' : isClockIn ? 'bg-brand-500' : 'bg-red-500'
                  }`}
                />
                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm relative">
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={`font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isClockIn ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      Clock {log.event_type}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      {formatTime(log.client_timestamp)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5 mt-2">
                    <MapPin size={14} className="text-slate-400" />
                    {log.site_name}
                  </p>
                  
                  {isWarning && (
                    <div className="mt-2 p-2 bg-amber-50 rounded-md border border-amber-100 flex flex-col gap-1">
                      {log.is_mock_location && (
                        <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                          <AlertTriangle size={12} /> Mock Location
                        </p>
                      )}
                      {log.within_geofence === false && (
                        <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                          <AlertTriangle size={12} /> Outside Geofence ({log.distance_from_site_meters}m)
                        </p>
                      )}
                      {log.sequence_anomaly && (
                        <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                          <AlertTriangle size={12} /> Out of Sequence
                        </p>
                      )}
                      {log.accuracy_meters > 100 && !log.is_mock_location && (
                        <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                          <AlertTriangle size={12} /> Low Accuracy (±{log.accuracy_meters.toFixed(0)}m)
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 text-right">
                    GPS Accuracy: ±{log.accuracy_meters.toFixed(0)}m
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
