'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';

/**
 * Grafik Reseller (tabel) — distribusi pendaftar reseller per kota +
 * history order dari reseller per kota. Bentuk tabel data (bukan grafik).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResellerRow = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = Record<string, any>;

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
function fmtRp(n: number): string { return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID'); }
function pct(part: number, whole: number): number { return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0; }

export default function GrafikResellerPage() {
  const [rows, setRows] = useState<ResellerRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errHint, setErrHint] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrHint('');
    try {
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

  // History order dari reseller: group by reseller_kota (fallback nama).
  const orderHistoryData = useMemo(() => {
    const counter = new Map<string, { count: number; nominal: number; reseller_nama_set: Set<string> }>();
    for (const o of orders) {
      const rid = String(o.reseller_id || '').trim();
      if (!rid) continue;
      const kota = String(o.reseller_kota || '').trim() || String(o.reseller_nama || '').trim() || '(Tanpa kota)';
      const cur = counter.get(kota) || { count: 0, nominal: 0, reseller_nama_set: new Set<string>() };
      cur.count++;
      cur.nominal += Number(o.nominal_order) || 0;
      const nama = String(o.reseller_nama || '').trim();
      if (nama) cur.reseller_nama_set.add(nama);
      counter.set(kota, cur);
    }
    return Array.from(counter.entries())
      .map(([kota, v]) => ({ kota, count: v.count, nominal: v.nominal, reseller_names: Array.from(v.reseller_nama_set).join(', ') }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);
  const totalOrderReseller = useMemo(() => orderHistoryData.reduce((s, d) => s + d.count, 0), [orderHistoryData]);
  const totalNominalReseller = useMemo(() => orderHistoryData.reduce((s, d) => s + d.nominal, 0), [orderHistoryData]);

  const kotaData = useMemo(() => {
    const counter = new Map<string, { count: number; provinsi: Set<string> }>();
    for (const r of rows) {
      const kota = pick(r, ALIAS_KOTA);
      if (!kota) continue;
      const prov = pick(r, ALIAS_PROVINSI);
      const cur = counter.get(kota) || { count: 0, provinsi: new Set<string>() };
      cur.count++;
      if (prov) cur.provinsi.add(prov);
      counter.set(kota, cur);
    }
    return Array.from(counter.entries())
      .map(([kota, v]) => ({ kota, count: v.count, provinsi: Array.from(v.provinsi).join(', ') }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const withoutKotaCount = useMemo(() => rows.filter(r => !pick(r, ALIAS_KOTA)).length, [rows]);
  const totalPendaftar = rows.length;
  const totalKota = kotaData.length;
  const topKota = kotaData[0];

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
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Rekap Reseller</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Pendaftar reseller per kota &amp; history order · <span className="text-white font-medium">{totalPendaftar} pendaftar</span> di <span className="text-white font-medium">{totalKota} kota</span>
              </p>
            </div>
          </div>
          <button onClick={fetchData}
            className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Pendaftar" value={totalPendaftar.toLocaleString('id-ID')} sub={withoutKotaCount > 0 ? `${withoutKotaCount} tanpa kota` : 'Semua ada kota'} accent="blue" />
            <StatCard label="Kota Unik" value={totalKota.toLocaleString('id-ID')} sub="Sebaran pendaftar" accent="emerald" />
            <StatCard label="Order dari Reseller" value={totalOrderReseller.toLocaleString('id-ID')} sub={totalOrderReseller > 0 ? fmtRp(totalNominalReseller) : 'Belum ada'} accent="rose" />
            <StatCard label="Kota Terbanyak" value={topKota?.kota || '—'} sub={topKota ? `${topKota.count} pendaftar` : 'Belum ada data'} accent="rose" highlight />
          </div>

          {/* Tabel Pendaftar per Kota */}
          <TableCard title="Pendaftar Reseller per Kota" subtitle={`${kotaData.length} kota · urut dari pendaftar terbanyak`} countLabel={`${kotaData.length} kota`}>
            {kotaData.length === 0 ? (
              <EmptyState text="Belum ada data reseller dengan kota terisi." />
            ) : (
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th className="text-left w-14">Rank</Th>
                    <Th className="text-left">Kota</Th>
                    <Th className="text-left min-w-[180px]">Provinsi</Th>
                    <Th className="text-right">Jumlah</Th>
                    <Th className="text-left w-40">%</Th>
                  </tr>
                </thead>
                <tbody>
                  {kotaData.map((row, i) => {
                    const p = pct(row.count, totalPendaftar);
                    return (
                      <tr key={row.kota} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-sm text-slate-500 tabular-nums">#{i + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-white">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                            {row.kota}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{row.provinsi || '—'}</td>
                        <td className="px-4 py-3 text-right text-sm text-emerald-400 font-semibold tabular-nums">{row.count.toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden min-w-[60px]">
                              <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(p, 100)}%` }} />
                            </div>
                            <span className="text-[11px] text-slate-400 tabular-nums w-10 text-right">{p}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TableCard>

          {/* Tabel History Order dari Reseller */}
          <TableCard
            title="History Order dari Reseller"
            subtitle={orderHistoryData.length > 0
              ? `${totalOrderReseller} order dari ${orderHistoryData.length} kota · total nilai ${fmtRp(totalNominalReseller)}`
              : 'Belum ada order dari reseller. Data terisi saat CS pilih reseller di Buat Order Baru.'}
            countLabel={`${orderHistoryData.length} kota`}
          >
            {orderHistoryData.length === 0 ? (
              <EmptyState text="Belum ada order tertaut ke reseller." />
            ) : (
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th className="text-left w-14">Rank</Th>
                    <Th className="text-left">Kota</Th>
                    <Th className="text-left min-w-[180px]">Reseller</Th>
                    <Th className="text-right">Jml Order</Th>
                    <Th className="text-right">Total Nilai</Th>
                    <Th className="text-right">%</Th>
                  </tr>
                </thead>
                <tbody>
                  {orderHistoryData.map((row, i) => (
                    <tr key={row.kota} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-500 tabular-nums">#{i + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-white">{row.kota}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[220px] truncate" title={row.reseller_names}>{row.reseller_names || '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-emerald-400 font-semibold tabular-nums">{row.count.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-200 tabular-nums">{fmtRp(row.nominal)}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-300 tabular-nums">{pct(row.count, totalOrderReseller)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-white/[0.02] font-semibold">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-sm text-white" colSpan={2}>TOTAL</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-400 tabular-nums">{totalOrderReseller.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-right text-sm text-white tabular-nums">{fmtRp(totalNominalReseller)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-400 tabular-nums">100%</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </TableCard>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent, highlight }: {
  label: string; value: string; sub?: string; accent: 'blue' | 'emerald' | 'rose'; highlight?: boolean;
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
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">{children}</div>
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
