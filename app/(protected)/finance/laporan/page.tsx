'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import { sanitizeNbHtml } from '@/lib/utils';

/**
 * Laporan Finance — arsip customer yang sudah 'Status Terkirim' di
 * History Produksi. Data juga masuk sini otomatis.
 *
 * Kolom: No Order, Customer, No HP, Paket, Nominal, DP Produksi, Kekurangan,
 *   Tgl Order, Tgl Terkirim, Aksi Lihat.
 *
 * Tombol Lihat → modal rincian order awal (yang di-buat CS Order).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtRp(n: number): string {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, y, mo, d] = m;
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${d} ${B[Number(mo) - 1]} ${y}`;
}

function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?/);
  if (!m) return s;
  const [, y, mo, d, hh, mi] = m;
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const time = hh && mi ? ` · ${hh}:${mi}` : '';
  return `${d} ${B[Number(mo) - 1]} ${y}${time}`;
}

export default function LaporanFinancePage() {
  const [orders, setOrders] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(currentYm());
  const [search, setSearch] = useState('');
  const [detailOrder, setDetailOrder] = useState<Row | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, it, p] = await Promise.all([
        dbGet('orders'),
        dbGet('order_items').catch(() => []),
        dbGet('order_payments').catch(() => []),
      ]);
      setOrders(o);
      setItems(it);
      setPayments(p);
      setError('');
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Order yang muncul: status_terkirim = 1.
  const rows = useMemo(() => {
    return orders
      .filter(o => Number(o.status_terkirim) === 1)
      .sort((a, b) => String(b.status_terkirim_at || '').localeCompare(String(a.status_terkirim_at || '')));
  }, [orders]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (month) {
      list = list.filter(r => String(r.status_terkirim_at || '').slice(0, 7) === month);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        String(r.no_order || '').toLowerCase().includes(q)
        || String(r.customer_nama || '').toLowerCase().includes(q)
        || String(r.customer_phone || '').toLowerCase().includes(q)
        || String(r.paket || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, month, search]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${BULAN_ID[m - 1] || ''} ${y}`;
  }, [month]);

  const totalNominal = useMemo(() => filteredRows.reduce((s, r) => s + (Number(r.nominal_order) || 0), 0), [filteredRows]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-cyan-500/[0.14] via-blue-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 border border-cyan-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Laporan Finance</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Customer yang sudah dikirim (produksi centang <strong className="text-emerald-300">Status Terkirim</strong>). Klik <strong className="text-white">Lihat</strong> untuk rincian order.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500/40 date-input"
            />
            <button
              onClick={() => setMonth('')}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors"
            >
              Semua Bulan
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-5 py-4 text-sm text-rose-200">{error}</div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Periode" value={month ? monthLabel : 'Semua Bulan'} accent="cyan" />
        <StatCard label="Total Customer" value={filteredRows.length.toLocaleString('id-ID')} accent="emerald" />
        <StatCard label="Total Nominal" value={fmtRp(totalNominal)} accent="blue" />
      </div>

      {/* Search */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-4">
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari No Order, customer, no HP, atau paket..."
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-cyan-500/40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 w-28">No Order</th>
                <th className="text-left px-4 py-3 min-w-[220px]">Customer</th>
                <th className="text-left px-4 py-3 w-32">No HP</th>
                <th className="text-left px-4 py-3 min-w-[160px]">Paket</th>
                <th className="text-right px-4 py-3 w-32">Nominal</th>
                <th className="text-right px-4 py-3 w-32">DP Diterima</th>
                <th className="text-left px-4 py-3 w-32">Tgl Order</th>
                <th className="text-left px-4 py-3 w-40">Tgl Terkirim</th>
                <th className="text-center px-4 py-3 w-20">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                    {rows.length === 0
                      ? 'Belum ada order yang dicentang Status Terkirim. Data muncul otomatis setelah tim produksi centang di History Produksi.'
                      : 'Tidak ada hasil untuk filter tersebut.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map(o => {
                  const dpTotal = (Number(o.dp_desain) || 0) + (Number(o.dp_produksi) || 0);
                  return (
                    <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-blue-300 font-mono text-xs">{o.no_order || `#${o.id}`}</td>
                      <td className="px-4 py-3 text-white font-medium">{o.customer_nama || '-'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs tabular-nums">{o.customer_phone || '-'}</td>
                      <td className="px-4 py-3 text-slate-300">{o.paket || '-'}</td>
                      <td className="px-4 py-3 text-right text-emerald-300 font-semibold tabular-nums">{fmtRp(Number(o.nominal_order) || 0)}</td>
                      <td className="px-4 py-3 text-right text-amber-300 font-semibold tabular-nums">{fmtRp(dpTotal)}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(o.tanggal_order)}</td>
                      <td className="px-4 py-3 text-emerald-400 text-xs">{fmtDateTime(o.status_terkirim_at)}</td>
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => setDetailOrder(o)}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-300 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-1 rounded-md transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Lihat
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 0 && (
          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500">
            <span>{filteredRows.length} order ditampilkan</span>
            <span>Sort: Terkirim terbaru dulu</span>
          </div>
        )}
      </div>

      {detailOrder && (
        <RincianOrderModal
          order={detailOrder}
          items={items.filter(i => Number(i.order_id) === Number(detailOrder.id))}
          payments={payments.filter(p => Number(p.order_id) === Number(detailOrder.id))}
          onClose={() => setDetailOrder(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: {
  label: string;
  value: string;
  accent: 'cyan' | 'emerald' | 'blue' | 'amber';
}) {
  const map = {
    cyan: { border: 'border-cyan-500/25', bg: 'from-cyan-500/10 to-transparent' },
    emerald: { border: 'border-emerald-500/25', bg: 'from-emerald-500/10 to-transparent' },
    blue: { border: 'border-blue-500/25', bg: 'from-blue-500/10 to-transparent' },
    amber: { border: 'border-amber-500/25', bg: 'from-amber-500/10 to-transparent' },
  };
  const c = map[accent];
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${c.bg} bg-[#111827] border ${c.border} p-5`}>
      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold mt-1 tabular-nums text-white truncate" title={value}>{value}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   RincianOrderModal — modal read-only rincian order yg CS Order buat.
   ───────────────────────────────────────────────────────────────────── */
function RincianOrderModal({ order, items, payments, onClose }: {
  order: Row;
  items: Row[];
  payments: Row[];
  onClose: () => void;
}) {
  const dpDesain = Number(order.dp_desain) || 0;
  const dpProduksi = Number(order.dp_produksi) || 0;
  const nominal = Number(order.nominal_order) || 0;
  const kekurangan = Number(order.kekurangan) || 0;
  const dpTotal = dpDesain + dpProduksi;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-cyan-500/[0.08] to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">Rincian Order</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="text-blue-300 font-mono">{order.no_order}</span> · {order.customer_nama || '(Tanpa nama)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Customer info */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Data Customer</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoRow label="Nama" value={order.customer_nama} />
              <InfoRow label="No HP" value={order.customer_phone} />
              <InfoRow label="Alamat" value={order.customer_alamat} span={2} />
              <InfoRow label="Provinsi" value={order.customer_provinsi} />
              <InfoRow label="Kota" value={order.customer_kabupaten} />
            </div>
          </div>

          {/* Order info */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Data Order</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoRow label="Nama Tim" value={order.nama_tim || '-'} />
              <InfoRow label="Paket" value={order.paket || order.pilihan_paket || '-'} />
              <InfoRow label="Tanggal Order" value={fmtDate(order.tanggal_order)} />
              <InfoRow label="Estimasi Deadline" value={fmtDate(order.estimasi_deadline)} />
              <InfoRow label="Tgl Terkirim" value={fmtDateTime(order.status_terkirim_at)} highlight />
              <div className="md:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Keterangan</p>
                {order.keterangan
                  ? <div className="text-sm mt-0.5 text-white break-words whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: sanitizeNbHtml(String(order.keterangan)) }} />
                  : <p className="text-sm mt-0.5 text-slate-500">—</p>}
              </div>
            </div>
          </div>

          {/* Order items */}
          {items.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Item Order ({items.length})</p>
              <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider border-b border-white/[0.06] bg-white/[0.015]">
                      <th className="text-left px-3 py-2">Paket / Bahan</th>
                      <th className="text-right px-3 py-2 w-20">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} className="border-b border-white/[0.04]">
                        <td className="px-3 py-2 text-slate-200">
                          <div>{it.paket_nama || '-'}</div>
                          {it.bahan_kain && <div className="text-[11px] text-slate-500">{it.bahan_kain}</div>}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{Number(it.qty) || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Finance summary */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Ringkasan Finance</p>
            <div className="rounded-lg border border-white/[0.06] p-4 space-y-2 bg-white/[0.015]">
              <FinanceRow label="Nominal Order" value={nominal} color="text-white" />
              <FinanceRow label="DP Desain" value={dpDesain} color="text-amber-300" />
              <FinanceRow label="DP Produksi" value={dpProduksi} color="text-amber-300" />
              <div className="border-t border-white/[0.06] pt-2 mt-2">
                <FinanceRow label="Total DP Diterima" value={dpTotal} color="text-emerald-300" bold />
                <FinanceRow label="Kekurangan" value={kekurangan} color="text-rose-300" bold />
              </div>
            </div>
          </div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Riwayat Pembayaran ({payments.length})</p>
              <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider border-b border-white/[0.06] bg-white/[0.015]">
                      <th className="text-left px-3 py-2">Tipe</th>
                      <th className="text-right px-3 py-2 w-32">Amount</th>
                      <th className="text-left px-3 py-2 w-24">Bank</th>
                      <th className="text-left px-3 py-2 w-20">Method</th>
                      <th className="text-left px-3 py-2 w-32">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))).map(p => (
                      <tr key={p.id} className="border-b border-white/[0.04]">
                        <td className="px-3 py-2 text-slate-200 uppercase text-[11px] font-medium">{String(p.tipe || '').replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-right text-emerald-300 tabular-nums font-semibold">{fmtRp(Number(p.amount) || 0)}</td>
                        <td className="px-3 py-2 text-slate-400 text-xs">{p.bank_name || '-'}</td>
                        <td className="px-3 py-2 text-slate-400 text-xs">{p.method || '-'}</td>
                        <td className="px-3 py-2 text-slate-400 text-xs">{fmtDateTime(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-white/10 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, span, highlight }: { label: string; value: string | number | null | undefined; span?: number; highlight?: boolean }) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className={`text-sm mt-0.5 break-words ${highlight ? 'text-emerald-300 font-semibold' : 'text-white'}`}>
        {value || <span className="text-slate-500">—</span>}
      </p>
    </div>
  );
}

function FinanceRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`${color} tabular-nums ${bold ? 'font-bold text-base' : 'font-semibold'}`}>{fmtRp(value)}</span>
    </div>
  );
}
