'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList,
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

  const paketChartData = useMemo(() => paket.slice(0, 12), [paket]);
  const leadsChartData = useMemo(() => leads.slice(0, 12), [leads]);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Grafik CS</h1>
          <p className="text-sm text-slate-400 mt-1">
            Visualisasi paket dan sumber leads dari order.
          </p>
        </div>
        <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      </div>

      {/* Periode badge */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
        Periode: {periode}
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

      {/* Paket Chart */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Penjualan per Paket</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Total qty per paket dalam periode. {paketChartData.length < paket.length && `Menampilkan top ${paketChartData.length} dari ${paket.length} paket.`}
            </p>
          </div>
          <span className="text-xs text-slate-500 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
            {paket.length} paket
          </span>
        </div>
        <div className="p-4">
          {paketChartData.length === 0 ? (
            <EmptyState text="Belum ada data paket pada periode ini." />
          ) : (
            <div style={{ width: '100%', height: Math.max(320, paketChartData.length * 36 + 60) }}>
              <ResponsiveContainer>
                <BarChart
                  data={paketChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 60, bottom: 8, left: 8 }}
                >
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} />
                  <YAxis type="category" dataKey="paket" stroke="#64748b" width={140} tick={{ fontSize: 12, fill: '#cbd5e1' }} tickLine={{ stroke: '#334155' }} />
                  <Tooltip content={<PaketTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="total_qty" radius={[0, 6, 6, 0]}>
                    {paketChartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                    <LabelList
                      dataKey="total_qty"
                      position="right"
                      style={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }}
                      formatter={(v: unknown) => Number(v).toLocaleString('id-ID')}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Leads Chart */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Sumber Leads</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Qty (bar) dan jumlah order (label) per sumber leads dalam periode.
              {leadsChartData.length < leads.length && ` Menampilkan top ${leadsChartData.length} dari ${leads.length} leads.`}
            </p>
          </div>
          <span className="text-xs text-slate-500 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
            {leads.length} leads
          </span>
        </div>
        <div className="p-4">
          {leadsChartData.length === 0 ? (
            <EmptyState text="Belum ada data leads pada periode ini." />
          ) : (
            <div style={{ width: '100%', height: Math.max(320, leadsChartData.length * 36 + 60) }}>
              <ResponsiveContainer>
                <BarChart
                  data={leadsChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 110, bottom: 8, left: 8 }}
                >
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={{ stroke: '#334155' }} />
                  <YAxis type="category" dataKey="lead_nama" stroke="#64748b" width={170} tick={{ fontSize: 12, fill: '#cbd5e1' }} tickLine={{ stroke: '#334155' }} />
                  <Tooltip content={<LeadsTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="total_qty" radius={[0, 6, 6, 0]}>
                    {leadsChartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[(i + 5) % PALETTE.length]} />
                    ))}
                    <LabelList
                      dataKey="total_qty"
                      position="right"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={(props: any) => {
                        const x = Number(props?.x ?? 0);
                        const y = Number(props?.y ?? 0);
                        const width = Number(props?.width ?? 0);
                        const height = Number(props?.height ?? 0);
                        const index = Number(props?.index ?? 0);
                        const row = leadsChartData[index];
                        if (!row) return null;
                        return (
                          <text
                            x={x + width + 8}
                            y={y + height / 2}
                            dominantBaseline="middle"
                            style={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }}
                          >
                            {row.total_qty.toLocaleString('id-ID')}
                            <tspan style={{ fill: '#94a3b8', fontWeight: 400 }}>
                              {` · ${row.order_count} order`}
                            </tspan>
                          </text>
                        );
                      }}
                    />
                  </Bar>
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
                {leads.map(row => (
                  <tr key={`${row.lead_id ?? 'none'}-${row.lead_nama}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-white">{row.lead_nama}</td>
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

function PaketTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PaketRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg bg-[#0c1120] border border-white/[0.1] px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-white">{row.paket}</p>
      <p className="text-xs text-emerald-400 mt-1">{row.total_qty.toLocaleString('id-ID')} qty</p>
      <p className="text-xs text-slate-400">{row.order_count} order</p>
    </div>
  );
}

function LeadsTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: LeadRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg bg-[#0c1120] border border-white/[0.1] px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-white">{row.lead_nama}</p>
      {row.jenis_cs && <p className="text-[10px] text-slate-500 uppercase tracking-wider">{row.jenis_cs}</p>}
      <p className="text-xs text-emerald-400 mt-1">{row.total_qty.toLocaleString('id-ID')} qty</p>
      <p className="text-xs text-slate-300">{row.order_count} order</p>
      <p className="text-xs text-slate-400">{row.customer_count} customer</p>
    </div>
  );
}
