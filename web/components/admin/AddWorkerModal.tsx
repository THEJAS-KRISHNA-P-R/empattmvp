'use client';

import { useState } from 'react';
import { X, Eye, EyeOff, Copy, Check, MessageCircle, UserPlus, AlertCircle } from 'lucide-react';

interface CreatedWorker {
  full_name: string;
  phone: string;
  employee_id: string;
  pin: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

/** Strips everything but digits — wa.me links require digits only, no "+". */
function phoneDigitsOnly(phone: string) {
  return phone.replace(/\D/g, '');
}

function buildWhatsAppMessage(worker: CreatedWorker) {
  return [
    `Hi ${worker.full_name}, here are your EmpAtt login details:`,
    ``,
    `Phone: ${worker.phone}`,
    `Employee ID: ${worker.employee_id}`,
    `PIN: ${worker.pin}`,
    ``,
    `Open the EmpAtt app and enter these to log in. This will lock the app to this phone — if you ever switch phones, contact admin to reset it.`,
  ].join('\n');
}

export default function AddWorkerModal({ onClose, onCreated }: Props) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWorker | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length < 4) {
      setError('PIN must be at least 4 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          employee_id: employeeId.trim(),
          pin,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreated(data.worker);
        onCreated();
      } else {
        setError(data.error ?? 'Failed to create worker');
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(buildWhatsAppMessage(created));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — your browser may be blocking clipboard access.');
    }
  };

  const handleWhatsAppShare = () => {
    if (!created) return;
    const digits = phoneDigitsOnly(created.phone);
    const text = encodeURIComponent(buildWhatsAppMessage(created));
    window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-[999] bg-slate-900/40 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-worker-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-900/10 w-full max-w-sm border border-slate-200">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-200">
          <h2 id="add-worker-title" className="font-bold text-slate-900 flex items-center gap-2">
            <UserPlus size={18} className="text-brand-600" />
            {created ? 'Worker Created' : 'Add Worker'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 -m-1 rounded"
          >
            <X size={18} />
          </button>
        </div>

        {!created ? (
          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4" noValidate>
            <div>
              <label htmlFor="full-name" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                Full Name
              </label>
              <input
                id="full-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="phone" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                Phone Number
              </label>
              <input
                id="phone"
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +919812345678"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="employee-id" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                Employee ID / Email
              </label>
              <input
                id="employee-id"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. EMP003 or priya@company.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="pin" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                PIN / Password
              </label>
              <div className="relative">
                <input
                  id="pin"
                  required
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="At least 4 characters"
                  className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                  className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg py-2.5 transition-colors cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors cursor-pointer min-h-[44px]"
              >
                {submitting ? 'Creating…' : 'Create Worker'}
              </button>
            </div>
          </form>
        ) : (
          <div className="px-5 py-5 space-y-4">
            <p className="text-sm text-slate-600">
              Share these details with <span className="font-semibold text-slate-900">{created.full_name}</span> so they can log in. The PIN won&apos;t be shown again after you close this.
            </p>

            <dl className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-medium text-slate-900">{created.phone}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Employee ID</dt>
                <dd className="font-medium text-slate-900">{created.employee_id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">PIN</dt>
                <dd className="font-mono font-semibold text-slate-900 tracking-wider">{created.pin}</dd>
              </div>
            </dl>

            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg py-2.5 transition-colors cursor-pointer min-h-[44px]"
              >
                {copied ? <Check size={15} className="text-brand-600" /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={handleWhatsAppShare}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg py-2.5 transition-colors cursor-pointer min-h-[44px]"
              >
                <MessageCircle size={15} />
                WhatsApp
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full text-sm font-medium text-slate-500 hover:text-slate-700 py-1 cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
