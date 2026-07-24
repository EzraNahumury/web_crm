'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtDateLabel(iso: string): string {
  if (!iso) return '-';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${d} ${B[m - 1]} ${y}`;
}

function fmtDateTime(v: string): string {
  if (!v) return '-';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(v);
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const day = String(d.getDate()).padStart(2, '0');
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${day} ${B[d.getMonth()]} ${d.getFullYear()} · ${time}`;
}

export default function HistoryRejectPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [o, l] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('leads').catch(() => []),
      ]);
      setOrders(o);
      setLeads(l);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const leadById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const l of leads) m[Number(l.id)] = String(l.nama || '');
    return m;
  }, [leads]);

  const rejected = useMemo(() => {
    const list = orders
      .filter(o => {
        if (!isVisibleTanggalOrder(o.tanggal_order)) return false;
        return String(o.design_stage || '').toUpperCase() === 'REJECTED';
      })
      .sort((a, b) => {
        // Terbaru di atas.
        const ta = String(a.design_rejected_at || '');
        const tb = String(b.design_rejected_at || '');
        return tb.localeCompare(ta);
      });
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(o =>
      String(o.customer_nama || '').toLowerCase().includes(q)
      || String(o.no_order || '').toLowerCase().includes(q)
      || String(o.customer_phone || '').toLowerCase().includes(q)
    );
  }, [orders, search]);

  async function restoreOrder(order: Row) {
    const yes = await toast.confirm({
      title: 'Kembalikan ke Antrian?',
      message: `${order.customer_nama || order.no_order} akan dikembalikan ke Design Awal. Tanggal reject dihapus.`,
      type: 'warning',
      confirmText: 'Ya, Kembalikan',
    });
    if (!yes) return;
    setBusyId(Number(order.id));
    try {
      // Clear kolom reject supaya History Reject bersih dari data lama
      // kalau order sampai di-reject lagi nanti.
      try {
        await dbUpdate('orders', Number(order.id), {
          design_stage: 'AWAL',
          design_rejected_at: null,
          design_reject_reason: null,
        });
      } catch (err) {
        console.warn('restore with reason clear failed, retrying without:', err);
        await dbUpdate('orders', Number(order.id), {
          design_stage: 'AWAL',
          design_rejected_at: null,
        });
      }
      toast.success('Order Dikembalikan', `${order.customer_nama || order.no_order} kembali ke Design Awal.`);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setBusyId(null);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-14 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-rose-500/[0.14] via-rose-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500/25 to-rose-500/5 border border-rose-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">History Reject</h1>
              <p className="text-[13px] text-slate-300 mt-0.5 max-w-2xl">
                Order yang dibatalkan oleh CS Design — customer tidak lanjut pesanan.
                Sudah tidak bisa muncul di CS Order.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 bg-[#111827] border border-white/10 rounded-xl px-4 py-2.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Total</span>
            <span className="text-lg font-bold text-white tabular-nums">{rejected.length}</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-3">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari No Order, nama customer, atau no HP..."
            className="w-full bg-transparent text-white placeholder-slate-500 pl-10 pr-3 py-2.5 text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest bg-white/[0.015]">
                <th className="text-left px-4 py-3.5">No Order</th>
                <th className="text-left px-4 py-3.5">Customer</th>
                <th className="text-left px-4 py-3.5">Leads</th>
                <th className="text-left px-4 py-3.5">No HP</th>
                <th className="text-left px-4 py-3.5">Tgl Reject</th>
                <th className="text-left px-4 py-3.5">Alasan</th>
                <th className="text-right px-4 py-3.5">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rejected.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center" data-colspan-note="7 = No Order, Customer, Leads, No HP, Tgl Reject, Alasan, Aksi">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/15 to-transparent border border-rose-500/20 grid place-items-center">
                      <svg className="w-6 h-6 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-300 font-medium">Belum ada order yang di-reject</p>
                    <p className="text-xs text-slate-500 max-w-xs">Order muncul di sini setelah CS Design klik <strong className="text-white">Batalkan</strong> di menu Antrian.</p>
                  </div>
                </td></tr>
              ) : rejected.map(o => (
                <tr key={o.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3.5 text-sm text-fuchsia-300 font-semibold">{o.no_order}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500/20 to-rose-500/5 border border-rose-500/20 grid place-items-center text-[11px] font-bold text-rose-200 shrink-0">
                        {String(o.customer_nama || '?').trim().charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-white font-medium truncate max-w-[220px]" title={o.customer_nama}>{o.customer_nama || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{leadById[Number(o.lead_id)] || '-'}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-400 tabular-nums">{o.customer_phone || '-'}</td>
                  <td className="px-4 py-3.5 text-sm text-rose-300 font-medium tabular-nums">{fmtDateTime(o.design_rejected_at)}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300 max-w-[280px]">
                    {o.design_reject_reason ? (
                      <span
                        className="line-clamp-2 leading-snug whitespace-pre-wrap"
                        title={String(o.design_reject_reason)}
                      >
                        {String(o.design_reject_reason)}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => restoreOrder(o)}
                        disabled={busyId === Number(o.id)}
                        className="text-xs font-medium text-slate-300 border border-white/10 hover:text-white hover:bg-white/[0.04] disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
                        title="Kembalikan ke Design Awal"
                      >
                        {busyId === Number(o.id) ? 'Memproses...' : 'Kembalikan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
