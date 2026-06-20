'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList,
} from 'recharts';

type PaketRow = { paket: string; total_qty: number; order_count: number };
type ProvinsiRow = {
  provinsi: string;
  total_qty: number;
  customer_count: number;
  order_count: number;
};
type Totals = { orders: number; qty: number; paket_count: number; provinsi_count: number };

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#a855f7',
  '#14b8a6', '#eab308', '#6366f1', '#22c55e', '#d946ef',
];

export default function GrafikPage() {
  const [paket, setPaket] = useState<PaketRow[]>([]);
  const [provinsi, setProvinsi] = useState<ProvinsiRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ orders: 0, qty: 0, paket_count: 0, provinsi_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/analisa/grafik');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat data');
      setPaket(json.data.paket || []);
      setProvinsi(json.data.provinsi || []);
      setTotals(json.data.totals || { orders: 0, qty: 0, paket_count: 0, provinsi_count: 0 });
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const topPaket = paket[0];
  const topProvinsi = provinsi[0];

  const paketChartData = useMemo(() => paket.slice(0, 12), [paket]);
  const provinsiChartData = useMemo(() => provinsi.slice(0, 12), [provinsi]);

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
      <div>
        <h1 className="text-2xl font-bold text-white">Grafik Analisa</h1>
        <p className="text-sm text-slate-400 mt-1">
          Visualisasi paket terlaris dan distribusi customer per provinsi.
        </p>
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
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>}
          iconBg="bg-purple-500/15"
          iconColor="text-purple-400"
          label="Provinsi Terbanyak"
          value={topProvinsi?.provinsi || '—'}
          sub={topProvinsi ? `${topProvinsi.total_qty.toLocaleString('id-ID')} qty · ${topProvinsi.customer_count} customer` : 'Belum ada data'}
        />
      </div>

      {/* Paket Chart */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Penjualan per Paket</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Total qty per paket dari semua order. {paketChartData.length < paket.length && `Menampilkan top ${paketChartData.length} dari ${paket.length} paket.`}
            </p>
          </div>
          <span className="text-xs text-slate-500 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
            {paket.length} paket
          </span>
        </div>
        <div className="p-4">
          {paketChartData.length === 0 ? (
            <EmptyState text="Belum ada data paket dari order." />
          ) : (
            <div style={{ width: '100%', height: Math.max(320, paketChartData.length * 36 + 60) }}>
              <ResponsiveContainer>
                <BarChart
                  data={paketChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 60, bottom: 8, left: 8 }}
                >
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={{ stroke: '#334155' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="paket"
                    stroke="#64748b"
                    width={140}
                    tick={{ fontSize: 12, fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#334155' }}
                  />
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

      {/* Provinsi Chart */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Customer per Provinsi</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Total qty (bar) dan jumlah customer (label) per provinsi. {provinsiChartData.length < provinsi.length && `Menampilkan top ${provinsiChartData.length} dari ${provinsi.length} provinsi.`}
            </p>
          </div>
          <span className="text-xs text-slate-500 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
            {provinsi.length} provinsi
          </span>
        </div>
        <div className="p-4">
          {provinsiChartData.length === 0 ? (
            <EmptyState text="Belum ada data provinsi dari order." />
          ) : (
            <div style={{ width: '100%', height: Math.max(320, provinsiChartData.length * 36 + 60) }}>
              <ResponsiveContainer>
                <BarChart
                  data={provinsiChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 90, bottom: 8, left: 8 }}
                >
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={{ stroke: '#334155' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="provinsi"
                    stroke="#64748b"
                    width={170}
                    tick={{ fontSize: 12, fill: '#cbd5e1' }}
                    tickLine={{ stroke: '#334155' }}
                  />
                  <Tooltip content={<ProvinsiTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="total_qty" radius={[0, 6, 6, 0]}>
                    {provinsiChartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />
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
                        const row = provinsiChartData[index];
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
                              {` · ${row.customer_count} cust`}
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

        {/* Detail table */}
        {provinsi.length > 0 && (
          <div className="border-t border-white/[0.06] overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">Provinsi</th>
                  <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3 uppercase tracking-wider">Total Qty</th>
                  <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3 uppercase tracking-wider">Customer</th>
                  <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3 uppercase tracking-wider">Order</th>
                </tr>
              </thead>
              <tbody>
                {provinsi.map(row => (
                  <tr key={row.provinsi} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-white">{row.provinsi}</td>
                    <td className="px-6 py-3 text-right text-sm text-emerald-400 font-semibold">{row.total_qty.toLocaleString('id-ID')}</td>
                    <td className="px-6 py-3 text-right text-sm text-slate-300">{row.customer_count.toLocaleString('id-ID')}</td>
                    <td className="px-6 py-3 text-right text-sm text-slate-300">{row.order_count.toLocaleString('id-ID')}</td>
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

function ProvinsiTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ProvinsiRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg bg-[#0c1120] border border-white/[0.1] px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-white">{row.provinsi}</p>
      <p className="text-xs text-emerald-400 mt-1">{row.total_qty.toLocaleString('id-ID')} qty</p>
      <p className="text-xs text-slate-300">{row.customer_count} customer</p>
      <p className="text-xs text-slate-400">{row.order_count} order</p>
    </div>
  );
}
