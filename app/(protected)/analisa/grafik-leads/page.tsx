'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';

/**
 * Grafik Leads (tabel) — rekap leads & closingan per sumber leads dari
 * `cs_form_leads` (CS Selling → Form Leads Harian), plus tren harian total.
 * Bentuk tabel data (bukan grafik) sesuai permintaan.
 */

interface Lead { id: number; nama: string; jenis_cs?: string }
interface FormLeadsRow {
  id: number; lead_id: number; tanggal: string;
  jumlah_leads: number; jumlah_closingan: number;
}

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtDayShort(iso: string): string {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!m || !d) return iso;
  return `${d}/${m}`;
}
function daysInMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return [];
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return out;
}
function konv(closingan: number, leads: number): string {
  return leads > 0 ? ((closingan / leads) * 100).toFixed(1) + '%' : '—';
}

type DailyPoint = { tanggal: string; label: string; leads: number; closingan: number };

export default function GrafikLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [rows, setRows] = useState<FormLeadsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentYm());
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ls, rs] = await Promise.all([
        dbGet('leads').catch(() => []),
        dbGet('cs_form_leads').catch(() => []),
      ]);
      setLeads(ls as Lead[]);
      setRows(rs as FormLeadsRow[]);
      setError('');
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${bulan[m - 1] || ''} ${y}`;
  }, [month]);

  const filteredRows = useMemo(() => rows.filter(r => String(r.tanggal || '').slice(0, 7) === month), [rows, month]);
  const dayList = useMemo(() => daysInMonth(month), [month]);

  const perLeadSeries = useMemo(() => {
    const byLead = new Map<number, FormLeadsRow[]>();
    for (const r of filteredRows) {
      const arr = byLead.get(r.lead_id) || [];
      arr.push(r); byLead.set(r.lead_id, arr);
    }
    const out: Array<{ lead: Lead; totalLeads: number; totalClosingan: number; activeDays: number }> = [];
    for (const lead of leads) {
      const rowsForLead = byLead.get(lead.id) || [];
      if (rowsForLead.length === 0) continue;
      const byDate = new Map<string, { leads: number; closingan: number }>();
      for (const r of rowsForLead) {
        const key = String(r.tanggal).slice(0, 10);
        const cur = byDate.get(key) || { leads: 0, closingan: 0 };
        cur.leads += Number(r.jumlah_leads) || 0;
        cur.closingan += Number(r.jumlah_closingan) || 0;
        byDate.set(key, cur);
      }
      let totalLeads = 0, totalClosingan = 0, activeDays = 0;
      for (const v of byDate.values()) {
        totalLeads += v.leads; totalClosingan += v.closingan;
        if (v.leads > 0 || v.closingan > 0) activeDays++;
      }
      out.push({ lead, totalLeads, totalClosingan, activeDays });
    }
    out.sort((a, b) => b.totalLeads - a.totalLeads);
    return out;
  }, [leads, filteredRows]);

  const totalSeries = useMemo(() => {
    const byDate = new Map<string, { leads: number; closingan: number }>();
    for (const r of filteredRows) {
      const key = String(r.tanggal).slice(0, 10);
      const cur = byDate.get(key) || { leads: 0, closingan: 0 };
      cur.leads += Number(r.jumlah_leads) || 0;
      cur.closingan += Number(r.jumlah_closingan) || 0;
      byDate.set(key, cur);
    }
    const data: DailyPoint[] = dayList.map(d => {
      const v = byDate.get(d) || { leads: 0, closingan: 0 };
      return { tanggal: d, label: fmtDayShort(d), leads: v.leads, closingan: v.closingan };
    });
    const totalLeads = data.reduce((s, p) => s + p.leads, 0);
    const totalClosingan = data.reduce((s, p) => s + p.closingan, 0);
    const activeDays = data.filter(p => p.leads > 0 || p.closingan > 0).length;
    return { data, totalLeads, totalClosingan, activeDays };
  }, [filteredRows, dayList]);

  const grandLeads = perLeadSeries.reduce((s, l) => s + l.totalLeads, 0);
  const grandClosingan = perLeadSeries.reduce((s, l) => s + l.totalClosingan, 0);
  const activeDaysTotal = totalSeries.data.filter(p => p.leads > 0 || p.closingan > 0);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-80 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.14] via-blue-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 border border-cyan-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Rekap Leads</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Leads &amp; closingan per sumber + tren harian · <span className="text-white font-medium">{monthLabel}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-slate-400">Bulan:</label>
            <input type="month" value={month} max={todayIsoLocal().slice(0, 7)}
              onChange={e => setMonth(e.target.value || currentYm())}
              className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/40 date-input" />
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Leads" value={grandLeads.toLocaleString('id-ID')} color="text-blue-400" bg="bg-blue-500/15" />
        <StatCard label="Total Closingan" value={grandClosingan.toLocaleString('id-ID')} color="text-emerald-400" bg="bg-emerald-500/15" />
        <StatCard label="Konversi" value={konv(grandClosingan, grandLeads)} color="text-fuchsia-400" bg="bg-fuchsia-500/15" />
        <StatCard label="Hari Aktif" value={totalSeries.activeDays.toLocaleString('id-ID')} color="text-amber-400" bg="bg-amber-500/15" />
      </div>

      {/* Tabel per Sumber Leads */}
      <TableCard title="Rekap per Sumber Leads" subtitle={`Total leads, closingan & konversi per sumber · ${monthLabel}`} countLabel={`${perLeadSeries.length} sumber`}>
        {perLeadSeries.length === 0 ? (
          <EmptyState text={`Belum ada input Form Leads Harian di ${monthLabel}.`} />
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th className="text-left w-10">#</Th>
                <Th className="text-left">Sumber Leads</Th>
                <Th className="text-left">Jenis CS</Th>
                <Th className="text-right">Leads</Th>
                <Th className="text-right">Closingan</Th>
                <Th className="text-right">Konversi</Th>
                <Th className="text-right">Hari Aktif</Th>
              </tr>
            </thead>
            <tbody>
              {perLeadSeries.map((row, i) => (
                <tr key={row.lead.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-500 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-white">{row.lead.nama}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{row.lead.jenis_cs || '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-blue-300 font-semibold tabular-nums">{row.totalLeads.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3 text-right text-sm text-emerald-400 font-semibold tabular-nums">{row.totalClosingan.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3 text-right text-sm text-fuchsia-300 tabular-nums">{konv(row.totalClosingan, row.totalLeads)}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-300 tabular-nums">{row.activeDays}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-white/[0.02] font-semibold">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-sm text-white" colSpan={2}>TOTAL</td>
                <td className="px-4 py-3 text-right text-sm text-blue-300 tabular-nums">{grandLeads.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-right text-sm text-emerald-400 tabular-nums">{grandClosingan.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-right text-sm text-fuchsia-300 tabular-nums">{konv(grandClosingan, grandLeads)}</td>
                <td className="px-4 py-3 text-right text-sm text-slate-300 tabular-nums">{totalSeries.activeDays}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </TableCard>

      {/* Tabel Tren Harian (total semua sumber) */}
      <TableCard title="Tren Harian (Semua Sumber)" subtitle="Leads & closingan per tanggal — hanya hari yang ada aktivitas." countLabel={`${activeDaysTotal.length} hari`}>
        {activeDaysTotal.length === 0 ? (
          <EmptyState text="Belum ada aktivitas harian di bulan ini." />
        ) : (
          <table className="w-full min-w-[420px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th className="text-left">Tanggal</Th>
                <Th className="text-right">Leads</Th>
                <Th className="text-right">Closingan</Th>
                <Th className="text-right">Konversi</Th>
              </tr>
            </thead>
            <tbody>
              {activeDaysTotal.map(p => (
                <tr key={p.tanggal} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 text-sm text-white tabular-nums">{p.label}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-blue-300 tabular-nums">{p.leads.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-emerald-400 tabular-nums">{p.closingan.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-fuchsia-300 tabular-nums">{konv(p.closingan, p.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${bg} grid place-items-center ${color} shrink-0`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-lg font-bold text-white mt-1 truncate" title={value}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function TableCard({ title, subtitle, countLabel, children }: {
  title: string; subtitle: string; countLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-xs text-slate-500 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">{countLabel}</span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-[11px] text-slate-500 font-medium px-4 py-3 uppercase tracking-wider ${className}`}>{children}</th>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-16 text-center">
      <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
