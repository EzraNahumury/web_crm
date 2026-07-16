'use client';
import { useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtDateTime(v: string) {
  if (!v) return '-';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function HistoryMonitoringPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [mps, orders, items] = await Promise.all([
        dbGet('monitoring_produksi', undefined, { board: 'history' }),
        dbGet('orders'),
        dbGet('order_items'),
      ]);

      const orderMap: Record<string, Row> = {};
      for (const o of orders) orderMap[String(o.id)] = o;
      const qtyByOrder: Record<string, number> = {};
      const paketByOrder: Record<string, string[]> = {};
      for (const it of items) {
        const k = String(it.order_id);
        qtyByOrder[k] = (qtyByOrder[k] || 0) + (Number(it.qty) || 0);
        if (it.paket_nama) (paketByOrder[k] ||= []).push(String(it.paket_nama));
      }

      const enriched = mps
        .filter((m: Row) => orderMap[String(m.order_id)])
        .map((m: Row) => {
          const o = orderMap[String(m.order_id)];
          return {
            mpId: m.id,
            tim: o.nama_tim || '',
            customer: o.customer_nama || '',
            qty: qtyByOrder[String(m.order_id)] || 0,
            paket: (paketByOrder[String(m.order_id)] || []).join(', ') || '-',
            keterangan: m.keterangan || '-',
            completedAt: m.completed_at || '',
          };
        })
        .sort((a: Row, b: Row) => String(b.completedAt).localeCompare(String(a.completedAt)));
      setRows(enriched);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.tim).toLowerCase().includes(q) ||
      String(r.customer).toLowerCase().includes(q) ||
      String(r.paket).toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">History Monitoring</h1>
          <p className="text-sm text-slate-400 mt-1">
            Order yang sudah selesai melewati semua tahap monitoring (Proofing → Print Grando).
          </p>
        </div>
        <div className="text-sm text-slate-500 shrink-0">
          Total: <span className="text-white font-semibold">{rows.length}</span>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-4">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari tim, customer, atau paket..."
            className="w-full bg-transparent border-0 text-white placeholder-slate-500 pl-10 pr-4 py-2 text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['NO', 'TIM / CUSTOMER', 'QTY', 'PAKET', 'KETERANGAN', 'TGL SELESAI'].map(h => (
                  <th key={h} className={`text-[11px] text-slate-500 font-medium ${h === 'QTY' ? 'text-center' : 'text-left'} px-5 py-3.5 uppercase tracking-wider`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">Belum ada history monitoring</td></tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={r.mpId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 text-sm text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-slate-200 font-semibold">{r.customer || r.tim || '-'}</span>
                      {r.tim && r.customer && r.tim !== r.customer && <span className="block text-[11px] text-slate-500">{r.tim}</span>}
                    </td>
                    <td className="px-5 py-4 text-center text-sm text-slate-300 tabular-nums">{r.qty > 0 ? r.qty : '-'}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{r.paket}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{r.keterangan}</td>
                    <td className="px-5 py-4 text-sm text-emerald-400">{fmtDateTime(r.completedAt)}</td>
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
