'use client';
import React from 'react';

// Komponen form kecil dipakai bersama halaman Design & Proofing Merchandiser.
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold text-fuchsia-300 uppercase tracking-widest mb-2">{title}</h4>
      {children}
    </div>
  );
}
export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>;
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-medium text-slate-400 mb-1">{label}</label>{children}</div>;
}
export function Inp({ v, on, ph, readOnly }: { v: string; on?: (v: string) => void; ph?: string; readOnly?: boolean }) {
  return <input value={v} readOnly={readOnly} onChange={e => on?.(e.target.value)} placeholder={ph}
    className={`w-full border text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none ${readOnly ? 'bg-white/[0.03] border-white/5 text-slate-400 cursor-default' : 'bg-[#0d1117] border-white/10 focus:border-fuchsia-500/40'}`} />;
}
export function DateInp({ v, on, accent }: { v: string; on: (v: string) => void; accent?: 'orange' }) {
  return <input type="date" value={v} onChange={e => on(e.target.value)}
    className={`w-full bg-[#0d1117] border text-white rounded-lg px-3 py-2 text-sm focus:outline-none date-input ${accent === 'orange' ? 'border-orange-500/40 focus:border-orange-500/60' : 'border-white/10 focus:border-fuchsia-500/40'}`} />;
}
