'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import DateRangePicker, { formatPeriod } from '../../laporan/date-range-picker';

type OrderRow = {
  id: number; no_order: string; customer: string; tanggal: string;
  nominal: number; reseller: string; kota: string; paket: string; qty: number;
};
type Totals = { reseller_count: number; order_count: number; qty: number; nominal: number };

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today() { return new Date().toISOString().split('T')[0]; }
function fmtRp(n: number) { return `Rp ${(n || 0).toLocaleString('id-ID')}`; }
function fmtDate(iso: string) {
  if (!iso) return '-';
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default function ResellerOrderPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ reseller_count: 0, order_count: 0, qty: 0, nominal: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`/api/reseller/order-breakdown?${qs.toString()}`);
      const json = await res.json();
      if (json.success) {
        setOrders(json.data.orders || []);
        setTotals(json.data.totals || { reseller_count: 0, order_count: 0, qty: 0, nominal: 0 });
      } else setError(json.error || 'Gagal memuat data');
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Group by reseller (filter by search on reseller / customer / paket).
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? orders.filter(o =>
          o.reseller.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.paket.toLowerCase().includes(q))
      : orders;
    const map = new Map<string, OrderRow[]>();
    for (const o of filtered) {
      const key = o.reseller || '(Tanpa Reseller)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries())
      .map(([reseller, rows]) => ({
        reseller,
        kota: rows[0]?.kota || '',
        rows,
        qty: rows.reduce((s, r) => s + r.qty, 0),
        nominal: rows.reduce((s, r) => s + r.nominal, 0),
      }))
      .sort((a, b) => b.nominal - a.nominal);
  }, [orders, search]);

  const cards = [
    { label: 'Reseller', value: totals.reseller_count.toLocaleString('id-ID'), color: 'text-fuchsia-300', ring: 'from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/20' },
    { label: 'Order', value: totals.order_count.toLocaleString('id-ID'), color: 'text-blue-300', ring: 'from-blue-500/20 to-blue-500/5 border-blue-500/20' },
    { label: 'Total Qty', value: totals.qty.toLocaleString('id-ID'), color: 'text-sky-300', ring: 'from-sky-500/20 to-sky-500/5 border-sky-500/20' },
    { label: 'Total Nominal', value: fmtRp(totals.nominal), color: 'text-emerald-300', ring: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-fuchsia-500/[0.14] via-purple-500/[0.05] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-fuchsia-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-500/25 to-fuchsia-500/5 border border-fuchsia-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Order per Reseller</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Customer yang jadi reseller — order paket & nominalnya. {from && to && <span className="text-slate-400">Periode: {formatPeriod(from, to)}.</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <DateRangePicker from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <div className="relative flex-1 min-w-[200px]">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari reseller, customer, paket..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-fuchsia-500/40" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.ring} border p-4`}>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{c.label}</p>
            <p className={`text-xl sm:text-2xl font-bold tabular-nums mt-1 ${c.color}`}>{loading ? '…' : c.value}</p>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl bg-red-500/[0.06] border border-red-500/20 p-4 text-sm text-red-300">{error}</div>}

      {/* Per-reseller breakdown */}
      {loading ? (
        <div className="h-40 grid place-items-center"><div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/20 border-t-fuchsia-400 animate-spin" /></div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-slate-400">Belum ada order dari reseller pada periode ini.</div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.reseller} className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06] bg-fuchsia-500/[0.06] flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="text-sm font-bold text-white">{g.reseller}</span>
                  {g.kota && <span className="text-[11px] text-slate-400 ml-2">· {g.kota}</span>}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-400">{g.rows.length} order</span>
                  <span className="text-sky-300 font-semibold">{g.qty.toLocaleString('id-ID')} pcs</span>
                  <span className="text-emerald-300 font-bold">{fmtRp(g.nominal)}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/[0.05]">
                      <th className="text-left px-5 py-2 w-8">#</th>
                      <th className="text-left px-4 py-2">No Order</th>
                      <th className="text-left px-4 py-2">Customer</th>
                      <th className="text-left px-4 py-2">Paket</th>
                      <th className="text-right px-4 py-2 w-16">Qty</th>
                      <th className="text-right px-4 py-2 w-32">Nominal</th>
                      <th className="text-left px-4 py-2 w-24">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="px-5 py-2 text-slate-500 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2 text-blue-300 font-medium">{r.no_order || '-'}</td>
                        <td className="px-4 py-2 text-slate-200">{r.customer || '-'}</td>
                        <td className="px-4 py-2 text-slate-400">{r.paket}</td>
                        <td className="px-4 py-2 text-right text-sky-300 tabular-nums">{r.qty > 0 ? r.qty : '-'}</td>
                        <td className="px-4 py-2 text-right text-emerald-300 font-medium tabular-nums">{fmtRp(r.nominal)}</td>
                        <td className="px-4 py-2 text-slate-400 tabular-nums">{fmtDate(r.tanggal)}</td>
                      </tr>
                    ))}
                    <tr className="bg-white/[0.02] font-bold">
                      <td className="px-5 py-2" />
                      <td className="px-4 py-2 text-slate-300 uppercase text-[11px]" colSpan={3}>Total</td>
                      <td className="px-4 py-2 text-right text-sky-300 tabular-nums">{g.qty.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-2 text-right text-emerald-300 tabular-nums">{fmtRp(g.nominal)}</td>
                      <td className="px-4 py-2" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
