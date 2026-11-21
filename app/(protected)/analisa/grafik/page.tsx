'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DateRangePicker, { daysAgo, today, formatPeriod } from '../../laporan/date-range-picker';

type PaketRow = { paket: string; total_qty: number; order_count: number; nominal: number };
type KabupatenRow = {
  kabupaten: string;
  total_qty: number;
  customer_count: number;
  order_count: number;
};
type Totals = { orders: number; qty: number; nominal: number; paket_count: number; kabupaten_count: number };

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// Rentang awal–akhir sebuah bulan YYYY-MM (tombol "Bulan": sekali pilih bulan,
// rentang Dari–Sampai langsung keisi se-bulan penuh).
function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ['', ''];
  const last = new Date(y, m, 0).getDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
}
function fmtRp(n: number): string { return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID'); }
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export default function GrafikPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [month, setMonth] = useState('');
  const [basis, setBasis] = useState<'order' | 'deadline'>('order');
  const [paket, setPaket] = useState<PaketRow[]>([]);
  const [kabupaten, setKabupaten] = useState<KabupatenRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ orders: 0, qty: 0, nominal: 0, paket_count: 0, kabupaten_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      qs.set('basis', basis);
      const res = await fetch(`/api/analisa/grafik?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat data');
      setPaket(json.data.paket || []);
      setKabupaten(json.data.kabupaten || []);
      setTotals(json.data.totals || { orders: 0, qty: 0, nominal: 0, paket_count: 0, kabupaten_count: 0 });
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, basis]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  // Pilih bulan → set rentang se-bulan. Kalau user ganti tanggal manual,
  // kosongkan pilihan bulan supaya tidak membingungkan.
  const pickMonth = (ym: string) => {
    setMonth(ym);
    if (!ym) return;
    const [f, t] = monthRange(ym);
    if (f && t) { setFrom(f); setTo(t); }
  };
  const setFromManual = (v: string) => { setMonth(''); setFrom(v); };
  const setToManual = (v: string) => { setMonth(''); setTo(v); };

  const periode = formatPeriod(from, to);
  const topPaket = paket[0];
  const topKabupaten = kabupaten[0];

  if (loading) return (
    <div className="space-y-4">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white/[0.03] rounded-xl animate-pulse" />)}
      </div>
      <div className="h-96 bg-white/[0.03] rounded-xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-blue-500/[0.14] via-cyan-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/25 to-blue-500/5 border border-blue-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Analisa Penjualan</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Tabel penjualan per paket &amp; distribusi customer per kabupaten · <span className="text-white font-medium">{periode}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0d1117] border border-white/[0.06]">
              {([
                { key: 'order' as const, label: 'Tgl Order' },
                { key: 'deadline' as const, label: 'Deadline' },
              ]).map(b => (
                <button key={b.key} onClick={() => setBasis(b.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${basis === b.key ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'}`}>
                  {b.label}
                </button>
              ))}
            </div>
            {/* Tombol Bulan — sekali pilih, rentang Dari–Sampai keisi se-bulan */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Bulan</label>
              <input type="month" value={month} onChange={e => pickMonth(e.target.value)}
                title="Pilih bulan — rentang otomatis se-bulan penuh"
                className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500/40 date-input" />
              <button onClick={() => pickMonth(currentYm())}
                className="text-xs font-medium text-slate-300 hover:text-white px-2.5 py-2 rounded-xl border border-white/10 bg-[#0d1117] hover:bg-white/[0.04] transition-colors">Bulan Ini</button>
            </div>
            <DateRangePicker from={from} to={to} onFromChange={setFromManual} onToChange={setToManual} />
          </div>
        </div>
        <p className="relative mt-2 text-[11px] text-slate-400/80">
          Basis: <strong className="text-slate-200">{basis === 'deadline' ? 'Deadline order' : 'Tanggal order masuk (penjualan)'}</strong>
          {basis === 'deadline'
            ? ' — order yang DEADLINE-nya di rentang ini (sama seperti pengelompokan bulan di Rincian Order).'
            : ' — order yang TANGGAL ORDER-nya di rentang ini.'}
          {' '}Qty & nominal sudah mengecualikan barang aksesoris.
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
          iconBg="bg-blue-500/15" iconColor="text-blue-400"
          label="Total Order" value={totals.orders.toLocaleString('id-ID')}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          iconBg="bg-emerald-500/15" iconColor="text-emerald-400"
          label="Total Qty (pcs)" value={totals.qty.toLocaleString('id-ID')}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          iconBg="bg-amber-500/15" iconColor="text-amber-400"
          label="Total Nominal" value={fmtRp(totals.nominal)}
          sub={topPaket ? `Terlaris: ${topPaket.paket}` : 'Belum ada data'}
        />
        <StatCard
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>}
          iconBg="bg-purple-500/15" iconColor="text-purple-400"
          label="Kabupaten Terbanyak" value={topKabupaten?.kabupaten || '—'}
          sub={topKabupaten ? `${topKabupaten.total_qty.toLocaleString('id-ID')} qty · ${topKabupaten.customer_count} cust` : 'Belum ada data'}
        />
      </div>

      {/* Tabel Penjualan per Paket */}
      <TableCard
        title="Penjualan per Paket"
        subtitle="Jumlah order, qty, kontribusi %, dan nominal per paket (aksesoris dikecualikan)."
        countLabel={`${paket.length} paket`}
      >
        {paket.length === 0 ? (
          <EmptyState text="Belum ada data paket dari order." />
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th className="text-left w-10">#</Th>
                <Th className="text-left">Paket</Th>
                <Th className="text-right">Jml Order</Th>
                <Th className="text-right">Total Qty</Th>
                <Th className="text-left w-40">% Qty</Th>
                <Th className="text-right">Nominal</Th>
              </tr>
            </thead>
            <tbody>
              {paket.map((row, i) => {
                const p = pct(row.total_qty, totals.qty);
                return (
                  <tr key={row.paket} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-white">{row.paket}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-300 tabular-nums">{row.order_count.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-400 font-semibold tabular-nums">{row.total_qty.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden min-w-[60px]">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(p, 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums w-10 text-right">{p}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-200 tabular-nums">{row.nominal > 0 ? fmtRp(row.nominal) : <span className="text-slate-600">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-white/[0.02] font-semibold">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-sm text-white">TOTAL ({totals.orders} order)</td>
                <td className="px-4 py-3 text-right text-sm text-slate-400 tabular-nums">—</td>
                <td className="px-4 py-3 text-right text-sm text-emerald-400 tabular-nums">{totals.qty.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-left text-[11px] text-slate-500">100%</td>
                <td className="px-4 py-3 text-right text-sm text-white tabular-nums">{fmtRp(totals.nominal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </TableCard>

      {/* Tabel Customer per Kabupaten */}
      <TableCard
        title="Customer per Kabupaten/Kota"
        subtitle="Distribusi qty & customer per kabupaten — acuan rencana buka cabang."
        countLabel={`${kabupaten.length} kabupaten`}
      >
        {kabupaten.length === 0 ? (
          <EmptyState text="Belum ada data kabupaten dari order." />
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th className="text-left w-10">#</Th>
                <Th className="text-left">Kabupaten/Kota</Th>
                <Th className="text-right">Total Qty</Th>
                <Th className="text-left w-40">% Qty</Th>
                <Th className="text-right">Customer</Th>
                <Th className="text-right">Order</Th>
              </tr>
            </thead>
            <tbody>
              {kabupaten.map((row, i) => {
                const p = pct(row.total_qty, totals.qty);
                return (
                  <tr key={row.kabupaten} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-white">{row.kabupaten}</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-400 font-semibold tabular-nums">{row.total_qty.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden min-w-[60px]">
                          <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(p, 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums w-10 text-right">{p}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-300 tabular-nums">{row.customer_count.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-300 tabular-nums">{row.order_count.toLocaleString('id-ID')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>
  );
}

function StatCard({ icon, iconBg, iconColor, label, value, sub }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; label: string; value: string | number; sub?: string;
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
