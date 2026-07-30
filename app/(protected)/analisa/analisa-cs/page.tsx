'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import DateRangePicker, { daysAgo, today } from '../../laporan/date-range-picker';

interface Totals {
  total_orders: number;
  sudah_dp_design: number;
  sudah_dp_produksi: number;
  belum_dp_produksi: number;
  stuck_dp_design: number;
  conversion_pct: number;
  drop_off_pct: number;
  total_nilai_order: number;
  total_dp_design_tercatat: number;
  potensi_kekurangan: number;
}

interface Pending {
  id: number;
  no_order: string;
  customer_nama: string;
  customer_phone: string;
  nominal_order: number;
  dp_desain: number;
  dp_produksi: number;
  tanggal_order: string;
}

function fmtRupiah(n: number): string {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}
function fmtDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m - 1]} ${y}`;
}

export default function AnalisaCsPage() {
  const [totals, setTotals] = useState<Totals>({
    total_orders: 0, sudah_dp_design: 0, sudah_dp_produksi: 0,
    belum_dp_produksi: 0, stuck_dp_design: 0, conversion_pct: 0, drop_off_pct: 0,
    total_nilai_order: 0, total_dp_design_tercatat: 0, potensi_kekurangan: 0,
  });
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'newest' | 'oldest'>('newest');
  // Default: 30 hari terakhir. Filter by tanggal_order.
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`/api/analisa/analisa-cs?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat');
      setTotals(json.data.totals);
      setPending(json.data.pending);
      setError('');
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const donutData = [
    { name: 'Sudah DP Produksi', value: totals.sudah_dp_produksi, color: '#10b981' },
    { name: 'Belum DP Produksi', value: totals.belum_dp_produksi, color: '#f59e0b' },
  ];

  const filteredPending = pending
    .filter(p => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return String(p.no_order || '').toLowerCase().includes(q)
        || String(p.customer_nama || '').toLowerCase().includes(q)
        || String(p.customer_phone || '').toLowerCase().includes(q);
    })
    .slice()
    .sort((a, b) => {
      const ta = String(a.tanggal_order || '').slice(0, 10);
      const tb = String(b.tanggal_order || '').slice(0, 10);
      const cmp = ta.localeCompare(tb);
      return sortDir === 'newest' ? -cmp : cmp;
    });

  const totalNominalPending = filteredPending.reduce((s, p) => s + p.nominal_order, 0);
  const totalDpDesainPending = filteredPending.reduce((s, p) => s + p.dp_desain, 0);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-amber-500/[0.14] via-orange-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-500/5 border border-amber-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Analisa CS</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Customer yang sudah DP Design namun belum DP Produksi (funnel drop-off).
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Order" value={totals.total_orders.toLocaleString('id-ID')} accent="blue" />
        <KpiCard label="Sudah DP Design" value={totals.sudah_dp_design.toLocaleString('id-ID')} accent="cyan" />
        <KpiCard label="Sudah DP Produksi" value={totals.sudah_dp_produksi.toLocaleString('id-ID')} sub={`${totals.conversion_pct}% konversi`} accent="emerald" />
        <KpiCard
          label="Belum DP Produksi"
          value={totals.belum_dp_produksi.toLocaleString('id-ID')}
          sub={`${totals.drop_off_pct}% · ${totals.stuck_dp_design} stuck di DP Design`}
          accent="amber"
          highlight
        />
      </div>

      {/* Chart + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5">
        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-white">Konversi Order → DP Produksi</p>
              <p className="text-[11px] text-slate-500">
                Dari total {totals.total_orders} order · {totals.stuck_dp_design} stuck di DP Design
              </p>
            </div>
          </div>
          <div className="h-72">
            {totals.total_orders === 0 ? (
              <div className="h-full grid place-items-center text-slate-500 text-sm">
                Belum ada order di periode ini.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `${Number(value || 0).toLocaleString('id-ID')} order`}
                    contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 12 }}
                    formatter={(value: string) => <span className="text-slate-300 text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5 space-y-3">
          <p className="text-sm font-semibold text-white">Ringkasan Finansial</p>
          <div className="space-y-3">
            <RowStat
              label="Total Nilai Order"
              value={fmtRupiah(totals.total_nilai_order)}
              hint="Dari customer yang sudah DP Produksi (revenue confirmed)"
            />
            <RowStat
              label="Total DP Design Tercatat"
              value={fmtRupiah(totals.total_dp_design_tercatat)}
              hint="Total DP Design dari semua customer yang sudah bayar DP Design"
            />
            <RowStat
              label="Potensi Kekurangan"
              value={fmtRupiah(totals.potensi_kekurangan)}
              hint="Sisa nominal dari customer yang stuck di DP Design (belum lanjut ke DP Produksi)"
              danger
            />
            <RowStat label="Jumlah Order Pending" value={pending.length.toLocaleString('id-ID')} />
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed pt-2 border-t border-white/[0.06]">
            <strong className="text-slate-300">Potensi Kekurangan</strong> = omset yang bisa hilang kalau customer pending drop-off. Follow up CS supaya progress lanjut ke DP Produksi.
          </p>
        </div>
      </div>

      {/* Table list pending */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="p-4 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Daftar Pending DP Produksi</p>
            <p className="text-[11px] text-slate-500">{filteredPending.length} order · {fmtRupiah(totalDpDesainPending)} sudah DP Design · {fmtRupiah(totalNominalPending)} total nilai</p>
          </div>
          <div className="relative w-full sm:w-72">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari no order / customer / no HP..."
              className="w-full pl-9 pr-3 py-2 bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg focus:outline-none focus:border-amber-500/40"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider border-b border-white/[0.06]">
                <th className="text-left px-4 py-2.5">No Order</th>
                <th className="text-left px-4 py-2.5">Customer</th>
                <th className="text-left px-4 py-2.5">No HP</th>
                <th className="text-right px-4 py-2.5">Nominal Order</th>
                <th className="text-right px-4 py-2.5">DP Design</th>
                <th className="text-right px-4 py-2.5">Kekurangan</th>
                <th className="text-left px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setSortDir(sortDir === 'newest' ? 'oldest' : 'newest')}
                    className="inline-flex items-center gap-1 hover:text-white transition-colors"
                    title={`Sort ${sortDir === 'newest' ? 'terbaru' : 'terlama'} dulu — klik untuk toggle`}
                  >
                    Tgl Order
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      {sortDir === 'newest' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      )}
                    </svg>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPending.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    {pending.length === 0
                      ? 'Semua order sudah DP Produksi. Tidak ada pending.'
                      : 'Tidak ada hasil untuk pencarian tersebut.'}
                  </td>
                </tr>
              ) : (
                filteredPending.map(p => (
                  <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-300">{p.no_order || `#${p.id}`}</td>
                    <td className="px-4 py-2.5 text-white font-medium">{p.customer_nama || '-'}</td>
                    <td className="px-4 py-2.5 text-slate-400 tabular-nums">{p.customer_phone || '-'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{fmtRupiah(p.nominal_order)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-300 tabular-nums font-semibold">{fmtRupiah(p.dp_desain)}</td>
                    <td className="px-4 py-2.5 text-right text-rose-300 tabular-nums font-semibold">{fmtRupiah(Math.max(p.nominal_order - p.dp_desain, 0))}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{fmtDate(p.tanggal_order)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, accent, highlight }: {
  label: string;
  value: string;
  sub?: string;
  accent: 'blue' | 'cyan' | 'emerald' | 'amber';
  highlight?: boolean;
}) {
  const map = {
    blue: { border: 'border-blue-500/25', bg: 'from-blue-500/10 to-transparent', accent: 'text-blue-300' },
    cyan: { border: 'border-cyan-500/25', bg: 'from-cyan-500/10 to-transparent', accent: 'text-cyan-300' },
    emerald: { border: 'border-emerald-500/25', bg: 'from-emerald-500/10 to-transparent', accent: 'text-emerald-300' },
    amber: { border: 'border-amber-500/25', bg: 'from-amber-500/10 to-transparent', accent: 'text-amber-300' },
  };
  const c = map[accent];
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${c.bg} bg-[#111827] border ${c.border} p-4 ${highlight ? 'ring-1 ring-amber-500/30' : ''}`}>
      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums text-white`}>{value}</p>
      {sub && <p className={`text-xs mt-1 font-medium ${c.accent}`}>{sub}</p>}
    </div>
  );
}

function RowStat({ label, value, hint, danger }: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-sm gap-3">
        <span className="text-slate-400">{label}</span>
        <span className={`font-semibold tabular-nums ${danger ? 'text-amber-300' : 'text-white'}`}>{value}</span>
      </div>
      {hint && <p className="text-[10px] text-slate-500 leading-tight">{hint}</p>}
    </div>
  );
}
