'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, AreaChart, Area,
} from 'recharts';

/**
 * Grafik Leads — trending harian jumlah_leads dan jumlah_closingan per
 * sumber leads (ORGANIK, ADS INTERNAL, ADS EKSTERNAL, AYRES SOLO, dll).
 *
 * Data dari table `cs_form_leads` (form input CS Selling → Form Leads
 * Harian). Setiap card grafik = 1 sumber leads. Card TOTAL di paling
 * atas menggabungkan semua sumber.
 *
 * Chart type: AreaChart (2 series overlay) — jumlah_leads garis biru,
 * jumlah_closingan garis emerald. Interaktif tooltip.
 */

interface Lead {
  id: number;
  nama: string;
  jenis_cs?: string;
}

interface FormLeadsRow {
  id: number;
  lead_id: number;
  tanggal: string;
  jumlah_leads: number;
  jumlah_closingan: number;
}

const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

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
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
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
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return `${bulan[m - 1] || ''} ${y}`;
  }, [month]);

  // Filter rows by bulan yang dipilih.
  const filteredRows = useMemo(() => {
    return rows.filter(r => String(r.tanggal || '').slice(0, 7) === month);
  }, [rows, month]);

  const dayList = useMemo(() => daysInMonth(month), [month]);

  // Build daily series per lead. Kalau lead punya 0 aktivitas seluruh
  // bulan, di-skip dari card (tapi tetap masuk total).
  const perLeadSeries = useMemo(() => {
    const byLead = new Map<number, FormLeadsRow[]>();
    for (const r of filteredRows) {
      const arr = byLead.get(r.lead_id) || [];
      arr.push(r);
      byLead.set(r.lead_id, arr);
    }
    const out: Array<{ lead: Lead; data: DailyPoint[]; totalLeads: number; totalClosingan: number }> = [];
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
      const data: DailyPoint[] = dayList.map(d => {
        const v = byDate.get(d) || { leads: 0, closingan: 0 };
        return { tanggal: d, label: fmtDayShort(d), leads: v.leads, closingan: v.closingan };
      });
      const totalLeads = data.reduce((s, p) => s + p.leads, 0);
      const totalClosingan = data.reduce((s, p) => s + p.closingan, 0);
      out.push({ lead, data, totalLeads, totalClosingan });
    }
    // Sort by totalLeads desc supaya yang paling produktif di atas.
    out.sort((a, b) => b.totalLeads - a.totalLeads);
    return out;
  }, [leads, filteredRows, dayList]);

  // Total keseluruhan = sum semua leads per hari.
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

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-80 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />)}
      </div>
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
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Grafik Leads</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Tren harian leads &amp; closingan per sumber · <span className="text-white font-medium">{monthLabel}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-slate-400">Bulan:</label>
            <input
              type="month"
              value={month}
              max={todayIsoLocal().slice(0, 7)}
              onChange={e => setMonth(e.target.value || currentYm())}
              className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/40 date-input"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {/* Card TOTAL — combined semua leads */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/25 grid place-items-center">
              <svg className="w-4 h-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Total Keseluruhan</h2>
              <p className="text-xs text-slate-400 mt-0.5">Gabungan semua sumber leads · {monthLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ChipStat label="Total Leads" value={totalSeries.totalLeads} color="blue" />
            <ChipStat label="Total Closingan" value={totalSeries.totalClosingan} color="emerald" />
            <ChipStat label="Hari Aktif" value={totalSeries.activeDays} color="fuchsia" />
          </div>
        </div>
        <div className="p-4">
          {totalSeries.totalLeads === 0 && totalSeries.totalClosingan === 0 ? (
            <EmptyState text={`Belum ada data leads di ${monthLabel}.`} />
          ) : (
            <ChartCard data={totalSeries.data} height={320} kind="area" />
          )}
        </div>
      </div>

      {/* Grid card per sumber leads */}
      {perLeadSeries.length === 0 && totalSeries.totalLeads === 0 ? (
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-10 text-center">
          <p className="text-sm text-slate-400">Belum ada input Form Leads Harian di bulan ini.</p>
          <p className="text-xs text-slate-500 mt-1">Isi dari menu <span className="text-cyan-300 font-medium">CS Selling → Form Leads Harian</span>.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {perLeadSeries.map(({ lead, data, totalLeads, totalClosingan }) => (
            <div key={lead.id} className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-white truncate">{lead.nama}</h3>
                  {lead.jenis_cs && <p className="text-[11px] text-slate-500 mt-0.5">{lead.jenis_cs}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ChipStat label="Leads" value={totalLeads} color="blue" small />
                  <ChipStat label="Closing" value={totalClosingan} color="emerald" small />
                </div>
              </div>
              <div className="p-3">
                <ChartCard data={data} height={220} kind="line" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   ChartCard — LineChart / AreaChart 2 series (leads + closingan).
   ───────────────────────────────────────────────────────────────────── */
function ChartCard({ data, height, kind }: { data: DailyPoint[]; height: number; kind: 'line' | 'area' }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        {kind === 'area' ? (
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="grad-leads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="grad-closing" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} width={32} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend wrapperStyle={{ paddingTop: 4, fontSize: 11 }} formatter={(v) => <span style={{ color: '#cbd5e1' }}>{v}</span>} />
            <Area type="monotone" name="Leads" dataKey="leads" stroke="#3b82f6" strokeWidth={2} fill="url(#grad-leads)" activeDot={{ r: 4 }} />
            <Area type="monotone" name="Closingan" dataKey="closingan" stroke="#10b981" strokeWidth={2} fill="url(#grad-closing)" activeDot={{ r: 4 }} />
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} width={28} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend wrapperStyle={{ paddingTop: 4, fontSize: 11 }} formatter={(v) => <span style={{ color: '#cbd5e1' }}>{v}</span>} />
            <Line type="monotone" name="Leads" dataKey="leads" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            <Line type="monotone" name="Closingan" dataKey="closingan" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-[#0c1120] border border-white/[0.1] px-3 py-2 shadow-xl min-w-[140px]">
      <p className="text-xs text-slate-400 mb-1">Tgl {label}</p>
      <div className="space-y-0.5">
        {payload.map(p => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-slate-300 flex-1">{p.name}</span>
            <span className="text-white font-semibold tabular-nums">{Number(p.value).toLocaleString('id-ID')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChipStat({ label, value, color, small = false }: {
  label: string;
  value: number;
  color: 'blue' | 'emerald' | 'fuchsia';
  small?: boolean;
}) {
  const scheme = {
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    fuchsia: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200',
  }[color];
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-lg border ${scheme} ${small ? 'px-2 py-1' : 'px-3 py-1.5'}`}>
      <span className={`${small ? 'text-[9px]' : 'text-[10px]'} font-bold uppercase tracking-widest opacity-70`}>{label}</span>
      <span className={`${small ? 'text-xs' : 'text-sm'} font-bold tabular-nums`}>{value.toLocaleString('id-ID')}</span>
    </div>
  );
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
