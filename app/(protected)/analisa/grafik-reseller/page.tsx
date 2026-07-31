'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, Cell,
} from 'recharts';

/**
 * Grafik Reseller — distribusi pendaftar reseller per kota.
 *
 * Data dari /api/reseller/pendaftar (same source as Data Reseller table).
 * Aggregate client-side: group by kota (city / kota field), count, sort desc.
 *
 * Layout:
 * 1. Hero + stat cards (total pendaftar, total kota unik, kota terbanyak)
 * 2. Bar chart horizontal — 1 bar per kota, di-sort dari terbanyak
 * 3. Table breakdown per kota dengan count + persentase
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResellerRow = Record<string, any>;

const ALIAS_KOTA = ['city', 'kota'];
const ALIAS_PROVINSI = ['province', 'provinsi'];

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#a855f7',
  '#14b8a6', '#eab308', '#6366f1', '#22c55e', '#d946ef',
];

function pick(row: ResellerRow, keys: string[]): string {
  for (const k of keys) {
    for (const variant of [k, k.toUpperCase(), k.toLowerCase()]) {
      const v = row[variant];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return '';
}

function fmtRp(n: number): string {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = Record<string, any>;

export default function GrafikResellerPage() {
  const [rows, setRows] = useState<ResellerRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errHint, setErrHint] = useState('');
  const [topN, setTopN] = useState(15);
  const [orderTopN, setOrderTopN] = useState(15);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrHint('');
    try {
      // Fetch reseller list + orders paralel. Orders filter client-side
      // by reseller_id IS NOT NULL supaya cuma order dari reseller
      // yang di-count di chart history.
      const [resellerRes, ordersRes] = await Promise.all([
        fetch('/api/reseller/pendaftar').then(r => r.json()),
        dbGet('orders').catch(() => []),
      ]);
      if (!resellerRes.success) {
        setError(resellerRes.error || 'Gagal memuat');
        setErrHint(resellerRes.hint || '');
      } else {
        setRows(resellerRes.data.rows || []);
      }
      setOrders(ordersRes as OrderRow[]);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // History order dari reseller: filter orders yang punya
  // reseller_id, group by reseller_kota (kalau kosong pakai
  // reseller_nama sebagai fallback label). Untuk lihat trend
  // per-reseller siapa yang paling produktif.
  const orderHistoryData = useMemo(() => {
    const counter = new Map<string, { count: number; nominal: number; reseller_nama_set: Set<string> }>();
    for (const o of orders) {
      const rid = String(o.reseller_id || '').trim();
      if (!rid) continue;
      const kota = String(o.reseller_kota || '').trim() || String(o.reseller_nama || '').trim() || '(Tanpa kota)';
      const nom = Number(o.nominal_order) || 0;
      const nama = String(o.reseller_nama || '').trim();
      const cur = counter.get(kota) || { count: 0, nominal: 0, reseller_nama_set: new Set<string>() };
      cur.count++;
      cur.nominal += nom;
      if (nama) cur.reseller_nama_set.add(nama);
      counter.set(kota, cur);
    }
    return Array.from(counter.entries())
      .map(([kota, v]) => ({
        kota,
        count: v.count,
        nominal: v.nominal,
        reseller_names: Array.from(v.reseller_nama_set).join(', '),
      }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);
  const totalOrderReseller = useMemo(() => orderHistoryData.reduce((s, d) => s + d.count, 0), [orderHistoryData]);
  const totalNominalReseller = useMemo(() => orderHistoryData.reduce((s, d) => s + d.nominal, 0), [orderHistoryData]);
  const orderChartData = useMemo(() => {
    const top = orderHistoryData.slice(0, orderTopN);
    return top.map((d, i) => ({
      ...d,
      pct: totalOrderReseller > 0 ? (d.count / totalOrderReseller) * 100 : 0,
      color: PALETTE[i % PALETTE.length],
    }));
  }, [orderHistoryData, orderTopN, totalOrderReseller]);

  // Group by kota, count, sort desc.
  const kotaData = useMemo(() => {
    const counter = new Map<string, { count: number; provinsi: Set<string> }>();
    for (const r of rows) {
      const kota = pick(r, ALIAS_KOTA);
      if (!kota) continue;
      const prov = pick(r, ALIAS_PROVINSI);
      const cur = counter.get(kota) || { count: 0, provinsi: new Set() };
      cur.count++;
      if (prov) cur.provinsi.add(prov);
      counter.set(kota, cur);
    }
    return Array.from(counter.entries())
      .map(([kota, v]) => ({
        kota,
        count: v.count,
        provinsi: Array.from(v.provinsi).join(', '),
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const withoutKotaCount = useMemo(() => {
    return rows.filter(r => !pick(r, ALIAS_KOTA)).length;
  }, [rows]);

  const totalPendaftar = rows.length;
  const totalKota = kotaData.length;
  const topKota = kotaData[0];

  // Data untuk chart — top N supaya bar tidak crowded.
  const chartData = useMemo(() => {
    const top = kotaData.slice(0, topN);
    return top.map((d, i) => ({
      ...d,
      pct: totalPendaftar > 0 ? (d.count / totalPendaftar) * 100 : 0,
      color: PALETTE[i % PALETTE.length],
    }));
  }, [kotaData, topN, totalPendaftar]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/[0.03] rounded-xl animate-pulse" />)}
      </div>
      <div className="h-96 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-rose-500/[0.14] via-pink-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500/25 to-rose-500/5 border border-rose-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Grafik Reseller</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Distribusi pendaftar reseller per kota · <span className="text-white font-medium">{totalPendaftar} pendaftar</span> di <span className="text-white font-medium">{totalKota} kota</span>
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-5 py-4 text-sm text-rose-200 space-y-2">
          <p className="font-semibold">Gagal ambil data reseller</p>
          <p className="text-xs font-mono text-rose-300 break-all">{error}</p>
          {errHint && <p className="text-xs text-rose-300/80">{errHint}</p>}
        </div>
      )}

      {!error && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Total Pendaftar"
              value={totalPendaftar.toLocaleString('id-ID')}
              sub={withoutKotaCount > 0 ? `${withoutKotaCount} tanpa kota` : 'Semua ada kota'}
              accent="blue"
            />
            <StatCard
              label="Kota Unik"
              value={totalKota.toLocaleString('id-ID')}
              sub="Menyebar di seluruh Indonesia"
              accent="emerald"
            />
            <StatCard
              label="Kota Terbanyak"
              value={topKota?.kota || '—'}
              sub={topKota ? `${topKota.count} pendaftar` : 'Belum ada data'}
              accent="rose"
              highlight
            />
          </div>

          {/* Bar chart */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-bold text-white">Pendaftar per Kota</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {kotaData.length > topN
                    ? `Top ${topN} dari ${kotaData.length} kota — sort by jumlah pendaftar`
                    : `${kotaData.length} kota total — sort by jumlah pendaftar`}
                </p>
              </div>
              {kotaData.length > 10 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="text-[11px] text-slate-400">Tampil:</label>
                  <select
                    value={topN}
                    onChange={e => setTopN(Number(e.target.value))}
                    className="bg-[#0d1117] border border-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-rose-500/40"
                  >
                    <option value={10}>Top 10</option>
                    <option value={15}>Top 15</option>
                    <option value={25}>Top 25</option>
                    <option value={50}>Top 50</option>
                    <option value={kotaData.length}>Semua ({kotaData.length})</option>
                  </select>
                </div>
              )}
            </div>
            <div className="p-4">
              {chartData.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  Belum ada data reseller dengan kota terisi.
                </div>
              ) : (
                <div style={{ width: '100%', height: Math.max(360, chartData.length * 32 + 40) }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 8, right: 80, bottom: 8, left: 8 }}
                    >
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        stroke="#64748b"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickLine={{ stroke: '#334155' }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="kota"
                        stroke="#64748b"
                        width={160}
                        tick={{ fontSize: 11, fill: '#cbd5e1' }}
                        tickLine={{ stroke: '#334155' }}
                      />
                      <Tooltip content={<KotaTooltip totalPendaftar={totalPendaftar} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                        <LabelList
                          dataKey="count"
                          position="right"
                          style={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* History Order dari Reseller — chart baru */}
          <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-bold text-white">History Order dari Reseller</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {orderHistoryData.length > 0 ? (
                    <>{totalOrderReseller} order dari {orderHistoryData.length} kota reseller · total nilai {fmtRp(totalNominalReseller)}</>
                  ) : (
                    <>Belum ada order dari reseller. Data mulai terkumpul saat CS Selling pick reseller di Buat Order Baru.</>
                  )}
                </p>
              </div>
              {orderHistoryData.length > 10 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="text-[11px] text-slate-400">Tampil:</label>
                  <select
                    value={orderTopN}
                    onChange={e => setOrderTopN(Number(e.target.value))}
                    className="bg-[#0d1117] border border-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-rose-500/40"
                  >
                    <option value={10}>Top 10</option>
                    <option value={15}>Top 15</option>
                    <option value={25}>Top 25</option>
                    <option value={50}>Top 50</option>
                    <option value={orderHistoryData.length}>Semua ({orderHistoryData.length})</option>
                  </select>
                </div>
              )}
            </div>
            <div className="p-4">
              {orderChartData.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  <p>Belum ada order tertaut ke reseller.</p>
                  <p className="text-xs mt-1 text-slate-600">Buka <span className="text-rose-300 font-medium">Orders → Buat Order Baru</span>, cari nama reseller di dropdown Customer. Order otomatis ke-tag.</p>
                </div>
              ) : (
                <div style={{ width: '100%', height: Math.max(300, orderChartData.length * 32 + 40) }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={orderChartData}
                      layout="vertical"
                      margin={{ top: 8, right: 100, bottom: 8, left: 8 }}
                    >
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        stroke="#64748b"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickLine={{ stroke: '#334155' }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="kota"
                        stroke="#64748b"
                        width={160}
                        tick={{ fontSize: 11, fill: '#cbd5e1' }}
                        tickLine={{ stroke: '#334155' }}
                      />
                      <Tooltip content={<OrderHistoryTooltip totalOrders={totalOrderReseller} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                        {orderChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                        <LabelList
                          dataKey="count"
                          position="right"
                          style={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }}
                          formatter={(v: unknown) => `${v} order`}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Table breakdown */}
          {kotaData.length > 0 && (
            <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
              <div className="px-6 py-4 border-b border-white/[0.06]">
                <h2 className="text-base font-bold text-white">Breakdown Detail</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{kotaData.length} kota · sort by jumlah pendaftar</p>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#111827]">
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider w-16">Rank</th>
                      <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider">Kota</th>
                      <th className="text-[11px] text-slate-500 font-medium text-left px-6 py-3 uppercase tracking-wider min-w-[200px]">Provinsi</th>
                      <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3 uppercase tracking-wider w-32">Jumlah</th>
                      <th className="text-[11px] text-slate-500 font-medium text-right px-6 py-3 uppercase tracking-wider w-24">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kotaData.map((row, i) => {
                      const pct = totalPendaftar > 0 ? (row.count / totalPendaftar) * 100 : 0;
                      return (
                        <tr key={row.kota} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-3 text-slate-500 tabular-nums">#{i + 1}</td>
                          <td className="px-6 py-3 text-white font-medium">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                              {row.kota}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-slate-400 text-xs">{row.provinsi || '—'}</td>
                          <td className="px-6 py-3 text-right text-emerald-400 font-semibold tabular-nums">{row.count.toLocaleString('id-ID')}</td>
                          <td className="px-6 py-3 text-right text-slate-300 tabular-nums">{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent, highlight }: {
  label: string;
  value: string;
  sub?: string;
  accent: 'blue' | 'emerald' | 'rose';
  highlight?: boolean;
}) {
  const map = {
    blue: { border: 'border-blue-500/25', bg: 'from-blue-500/10 to-transparent', accent: 'text-blue-300' },
    emerald: { border: 'border-emerald-500/25', bg: 'from-emerald-500/10 to-transparent', accent: 'text-emerald-300' },
    rose: { border: 'border-rose-500/25', bg: 'from-rose-500/10 to-transparent', accent: 'text-rose-300' },
  };
  const c = map[accent];
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${c.bg} bg-[#111827] border ${c.border} p-5 ${highlight ? 'ring-1 ring-rose-500/30' : ''}`}>
      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums text-white truncate" title={value}>{value}</p>
      {sub && <p className={`text-xs mt-1 font-medium ${c.accent} truncate`} title={sub}>{sub}</p>}
    </div>
  );
}

function OrderHistoryTooltip({ active, payload, totalOrders }: {
  active?: boolean;
  payload?: Array<{ payload: { kota: string; count: number; nominal: number; reseller_names: string; pct: number; color: string } }>;
  totalOrders: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg bg-[#0c1120] border border-white/[0.1] px-3 py-2 shadow-xl min-w-[220px]">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: row.color }} />
        <p className="text-sm font-semibold text-white">{row.kota}</p>
      </div>
      {row.reseller_names && (
        <p className="text-[10px] text-slate-500 mt-0.5 pl-4.5 truncate max-w-[200px]" title={row.reseller_names}>
          Reseller: {row.reseller_names}
        </p>
      )}
      <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-0.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Jumlah Order</span>
          <span className="text-white font-semibold tabular-nums">{row.count.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Total Nilai</span>
          <span className="text-emerald-300 font-semibold tabular-nums">{fmtRp(row.nominal)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Persentase</span>
          <span className="text-emerald-300 font-semibold tabular-nums">
            {totalOrders > 0 ? row.pct.toFixed(1) : '0'}%
          </span>
        </div>
      </div>
    </div>
  );
}

function KotaTooltip({ active, payload, totalPendaftar }: {
  active?: boolean;
  payload?: Array<{ payload: { kota: string; count: number; provinsi: string; pct: number; color: string } }>;
  totalPendaftar: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg bg-[#0c1120] border border-white/[0.1] px-3 py-2 shadow-xl min-w-[180px]">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: row.color }} />
        <p className="text-sm font-semibold text-white">{row.kota}</p>
      </div>
      {row.provinsi && <p className="text-[10px] text-slate-500 mt-0.5 pl-4.5">{row.provinsi}</p>}
      <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-0.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Pendaftar</span>
          <span className="text-white font-semibold tabular-nums">{row.count.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Persentase</span>
          <span className="text-emerald-300 font-semibold tabular-nums">
            {totalPendaftar > 0 ? row.pct.toFixed(1) : '0'}%
          </span>
        </div>
      </div>
    </div>
  );
}
