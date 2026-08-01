'use client';

import { useState } from 'react';
import { X, User, Phone, BadgeInfo, Key, AlertCircle } from 'lucide-react';
import { Worker } from './AdminDashboard';

interface Props {
  worker: Worker;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditWorkerModal({ worker, onClose, onUpdated }: Props) {
  const [fullName, setFullName] = useState(worker.full_name);
  const [phone, setPhone] = useState(worker.phone.replace('+91', ''));
  const [employeeId, setEmployeeId] = useState(worker.employee_id);
  const [pin, setPin] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (phone.length !== 10) {
      setError('Phone number must be exactly 10 digits');
      return;
    }

    if (pin && pin.length < 4) {
      setError('PIN must be at least 4 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: `+91${phone.trim()}`,
          employee_id: employeeId.trim(),
          pin: pin.trim() || undefined, // send undefined if not changing
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onUpdated();
        onClose();
      } else {
        setError(data.error ?? 'Something went wrong');
      }
    } catch {
      setError('Network error. Check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Edit Worker</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-red-700 text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="edit-name" className="text-xs font-semibold text-slate-600 mb-1.5 block">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={16} className="text-slate-400" />
              </div>
              <input
                id="edit-name"
                required
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-phone" className="text-xs font-semibold text-slate-600 mb-1.5 block">
              Phone Number
            </label>
            <div className="flex relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Phone size={16} className="text-slate-400" />
              </div>
              <span className="inline-flex items-center pl-9 pr-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-medium">
                +91
              </span>
              <input
                id="edit-phone"
                required
                type="tel"
                maxLength={10}
                pattern="[0-9]{10}"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white border border-slate-200 rounded-r-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-emp-id" className="text-xs font-semibold text-slate-600 mb-1.5 block">
              Employee ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <BadgeInfo size={16} className="text-slate-400" />
              </div>
              <input
                id="edit-emp-id"
                required
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 uppercase"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-pin" className="text-xs font-semibold text-slate-600 mb-1.5 flex justify-between">
              <span>Login PIN</span>
              <span className="font-normal text-slate-400">Leave blank to keep unchanged</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Key size={16} className="text-slate-400" />
              </div>
              <input
                id="edit-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="****"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
              />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
