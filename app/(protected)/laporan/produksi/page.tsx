'use client';
import { useState } from 'react';
import DateRangePicker, { today, formatPeriod } from '../date-range-picker';

const TAHAP_PRODUKSI = [
  'Proofing', 'Printing Layout', 'Approval Layout', 'Printing Process',
  'Sublim Press', 'QC Panel Process', 'Fabric Cutting', 'QC Cutting',
  'Sewing', 'QC Jersey', 'Finishing', 'Shipment',
];

export default function LaporanProduksiPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());

  const periode = formatPeriod(from, to);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Laporan Produksi</h1>
          <p className="text-sm text-slate-400 mt-1">Statistik pergerakan produksi per tahap</p>
        </div>
        <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      </div>

      {/* Periode badge */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
        Periode: {periode}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          iconBg="bg-emerald-500/15" iconColor="text-emerald-400"
          label="Total Selesai (Periode)"
          wo={0} pcs={0}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          iconBg="bg-amber-500/15" iconColor="text-amber-400"
          label="Total Sedang Proses"
          wo={0} pcs={0}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>}
          iconBg="bg-blue-500/15" iconColor="text-blue-400"
          label="Grand Total (Aktif)"
          wo={0} pcs={0}
        />
      </div>

      {/* Rincian Per Tahap */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white">Rincian Per Tahap</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3.5 uppercase tracking-wider">TAHAP PRODUKSI</th>
                <th className="text-[11px] text-slate-500 font-medium text-center px-6 py-3.5 uppercase tracking-wider">SELESAI (PERIODE)</th>
                <th className="text-[11px] text-slate-500 font-medium text-center px-6 py-3.5 uppercase tracking-wider">SEDANG PROSES</th>
                <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3.5 uppercase tracking-wider">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {TAHAP_PRODUKSI.map(tahap => (
                <tr key={tahap} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-white">{tahap}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm text-slate-400">0 WO</span>
                    <span className="block text-xs text-slate-600">(0 pcs)</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm text-slate-400">0 WO</span>
                    <span className="block text-xs text-slate-600">(0 pcs)</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-white">0 WO</span>
                    <span className="block text-xs text-slate-600">(0 pcs)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, iconBg, iconColor, label, wo, pcs }: {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  label: string; wo: number; pcs: number;
}) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} grid place-items-center ${iconColor} shrink-0`}>{icon}</div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold text-white">{wo}</span>
            <span className="text-xs text-slate-500">WO</span>
            <span className="text-xs text-slate-600 mx-1">&middot;</span>
            <span className="text-sm font-medium text-slate-400">{pcs}</span>
            <span className="text-xs text-slate-500">pcs</span>
          </div>
        </div>
      </div>
    </div>
  );
}
