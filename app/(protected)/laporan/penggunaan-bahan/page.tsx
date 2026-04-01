'use client';
import { useState } from 'react';
import DateRangePicker, { today, formatPeriod } from '../date-range-picker';

export default function PenggunaanBahanPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());

  const periode = formatPeriod(from, to);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Laporan Penggunaan Bahan</h1>
          <p className="text-sm text-slate-400 mt-1">Rekapitulasi permintaan bahan per Work Order</p>
        </div>
        <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      </div>

      {/* Periode badge */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
        Periode: {periode}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700/50 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Work Order</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-white">0</span>
                <span className="text-xs text-slate-500 uppercase">WO</span>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Item Bahan</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-white">0</span>
                <span className="text-xs text-slate-500 uppercase">RECORDS</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rincian Penggunaan */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">Rincian Penggunaan</h2>
        </div>
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-slate-500">Tidak ada data penggunaan bahan pada periode ini.</p>
        </div>
      </div>
    </div>
  );
}
