'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LabelList,
} from 'recharts';
import DateRangePicker, { daysAgo, today, formatPeriod } from '../../laporan/date-range-picker';

type PaketRow = { paket: string; total_qty: number; order_count: number };
type LeadRow = {
  lead_id: number | null;
  lead_nama: string;
  jenis_cs: string;
  total_qty: number;
  order_count: number;
  customer_count: number;
};
type MatrixRow = { paket: string; lead_nama: string; qty: number };
type Totals = { orders: number; qty: number; paket_count: number; leads_count: number };

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#a855f7',
  '#14b8a6', '#eab308', '#6366f1', '#22c55e', '#d946ef',
];

export default function GrafikCsPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [paket, setPaket] = useState<PaketRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ orders: 0, qty: 0, paket_count: 0, leads_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`/api/analisa/grafik-cs?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat data');
      setPaket(json.data.paket || []);
      setLeads(json.data.leads || []);
      setMatrix(json.data.matrix || []);
      setTotals(json.data.totals || { orders: 0, qty: 0, paket_count: 0, leads_count: 0 });
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  const periode = formatPeriod(from, to);
  const topPaket = paket[0];
  const topLead = leads[0];

  // Pivot matrix → one row per paket with one numeric key per lead source.
  // Result feeds a stacked horizontal bar chart (1 bar per paket, segments
  // colored per lead). Limited to top 12 paket by total qty.
  const { stackedData, leadKeys } = useMemo(() => {
    const topPaketNames = new Set(paket.slice(0, 12).map(p => p.paket));
    const keys = leads.map(l => l.lead_nama);
    const byPaket = new Map<string, Record<string, number | string>>();
    for (const m of matrix) {
      if (!topPaketNames.has(m.paket)) continue;
      const row = byPaket.get(m.paket) || { paket: m.paket };
      row[m.lead_nama] = (Number(row[m.lead_nama]) || 0) + m.qty;
      byPaket.set(m.paket, row);
    }
    // Preserve paket order from `paket` (sorted by total_qty desc)
    const data = paket
      .filter(p => topPaketNames.has(p.paket))
      .map(p => {
        const row = byPaket.get(p.paket) || { paket: p.paket };
        // Make sure every lead key exists so Recharts renders consistent bars
        for (const k of keys) if (row[k] == null) row[k] = 0;
        // Stash the total so the LabelList can show it on the last segment
        row.__total = p.total_qty;
        return row;
      });
    return { stackedData: data, leadKeys: keys };
  }, [paket, leads, matrix]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white/[0.03] rounded-xl animate-pulse" />)}
      </div>
      <div className="h-96 bg-white/[0.03] rounded-xl animate-pulse" />
      <div className="h-96 bg-white/[0.03] rounded-xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-fuchsia-500/[0.14] via-pink-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-fuchsia-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-500/25 to-fuchsia-500/5 border border-fuchsia-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Grafik CS</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Visualisasi paket dan sumber leads dari order · <span className="text-white font-medium">{periode}</span>
              </p>
            </div>
          </div>
          <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
          iconBg="bg-blue-500/15"
          iconColor="text-blue-400"
          label="Total Order"
          value={totals.orders.toLocaleString('id-ID')}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          iconBg="bg-emerald-500/15"
          iconColor="text-emerald-400"
          label="Total Qty"
          value={totals.qty.toLocaleString('id-ID')}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>}
          iconBg="bg-amber-500/15"
          iconColor="text-amber-400"
          label="Paket Terlaris"
          value={topPaket?.paket || '—'}
          sub={topPaket ? `${topPaket.total_qty.toLocaleString('id-ID')} qty` : 'Belum ada data'}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
          iconBg="bg-purple-500/15"
          iconColor="text-purple-400"
          label="Leads Teratas"
          value={topLead?.lead_nama || '—'}
          sub={topLead ? `${topLead.total_qty.toLocaleString('id-ID')} qty · ${topLead.order_count} order` : 'Belum ada data'}
        />
      </div>

      {/* Combined: Paket × Leads stacked bar chart */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Penjualan per Paket × Sumber Leads</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tiap bar = 1 paket. Tiap segmen warna = qty dari sumber leads tertentu.
              {stackedData.length < paket.length && ` Menampilkan top ${stackedData.length} dari ${paket.length} paket.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
              {paket.length} paket
            </span>
            <span className="text-xs text-slate-500 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
              {leads.length} leads
            </span>
          </div>
        </div>
        <div className="p-4">
          {stackedData.length === 0 ? (
            <EmptyState text="Belum ada data pada periode ini." />
          ) : (
            <div style={{ width: '100%', height: Math.max(360, stackedData.length * 38 + 100) }}>
              <ResponsiveContainer>
                <BarChart
                  data={stackedData}
                  layout="vertical"
                  margin={{ top: 8, right: 80, bottom: 8, left: 8 }}
                >
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} />
                  <YAxis type="category" dataKey="paket" stroke="#64748b" width={140} tick={{ fontSize: 12, fill: '#cbd5e1' }} tickLine={{ stroke: '#334155' }} />
                  <Tooltip content={<StackedTooltip leadKeys={leadKeys} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    wrapperStyle={{ paddingBottom: 12 }}
                    formatter={(value) => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{value}</span>}
                  />
                  {leadKeys.map((leadName, i) => {
                    const isLast = i === leadKeys.length - 1;
                    return (
                      <Bar
                        key={leadName}
                        dataKey={leadName}
                        stackId="leads"
                        fill={PALETTE[i % PALETTE.length]}
                        radius={isLast ? [0, 6, 6, 0] : [0, 0, 0, 0]}
                      >
                        {isLast && (
                          <LabelList
                            dataKey="__total"
                            position="right"
                            style={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }}
                            formatter={(v: unknown) => Number(v).toLocaleString('id-ID')}
                          />
                        )}
                      </Bar>
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Leads detail table */}
        {leads.length > 0 && (
          <div className="border-t border-white/[0.06] overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">Leads</th>
                  <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">Jenis CS</th>
                  <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3 uppercase tracking-wider">Total Qty</th>
                  <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3 uppercase tracking-wider">Order</th>
                  <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3 uppercase tracking-wider">Customer</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((row, i) => (
                  <tr key={`${row.lead_id ?? 'none'}-${row.lead_nama}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-white">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                        {row.lead_nama}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-400">{row.jenis_cs || '—'}</td>
                    <td className="px-6 py-3 text-right text-sm text-emerald-400 font-semibold">{row.total_qty.toLocaleString('id-ID')}</td>
                    <td className="px-6 py-3 text-right text-sm text-slate-300">{row.order_count.toLocaleString('id-ID')}</td>
                    <td className="px-6 py-3 text-right text-sm text-slate-300">{row.customer_count.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, iconBg, iconColor, label, value, sub }: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} grid place-items-center ${iconColor} shrink-0`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-lg font-bold text-white mt-1 truncate" title={String(value)}>{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-0.5 truncate" title={sub}>{sub}</p>}
        </div>
      </div>
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

function StackedTooltip({ active, payload, leadKeys }: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, number | string>; name: string; value: number; color: string }>;
  leadKeys: string[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const paketName = String(row.paket || '');
  const segments = leadKeys
    .map(k => ({ key: k, value: Number(row[k]) || 0 }))
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = Number(row.__total) || segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="rounded-lg bg-[#0c1120] border border-white/[0.1] px-3 py-2 shadow-xl min-w-[200px]">
      <p className="text-sm font-semibold text-white">{paketName}</p>
      <p className="text-xs text-emerald-400 mt-1 mb-2">Total {total.toLocaleString('id-ID')} qty</p>
      <div className="space-y-1">
        {segments.map(s => {
          const pl = payload.find(p => p.name === s.key);
          return (
            <div key={s.key} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: pl?.color || '#64748b' }} />
              <span className="text-slate-300 flex-1 truncate">{s.key}</span>
              <span className="text-white font-medium">{s.value.toLocaleString('id-ID')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
