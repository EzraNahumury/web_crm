'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

/**
 * History Produksi — 2 tab:
 * - Belum Terkirim (default): WO SELESAI + orders.status=DONE tapi
 *   status_terkirim=0. Operator centang → pindah ke tab kedua.
 * - Sudah Terkirim: WO yg sudah di-centang. Data juga muncul di
 *   Laporan Finance.
 *
 * Data source:
 * - work_orders WHERE status='SELESAI'
 * - orders WHERE status='DONE'
 * - wo_progress untuk Shipment.completed_at (tgl selesai produksi)
 * - production_stages lookup Shipment
 * - wo_detail_items untuk qty
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

interface HistoryRow {
  woId: number;
  no_wo: string;
  customer: string;
  paket: string;
  qty: number;
  tanggal_order: string;
  tanggal_selesai: string;
  order_id: number;
  no_order: string;
  status_terkirim: number;
  status_terkirim_at: string;
}

type Tab = 'belum' | 'sudah';

export default function HistoryProduksiPage() {
  const toast = useToast();
  const [wos, setWos] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Row[]>([]);
  const [progress, setProgress] = useState<Row[]>([]);
  const [stages, setStages] = useState<Row[]>([]);
  const [detailItems, setDetailItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(currentYm());
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('belum');
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [w, o, p, s, di] = await Promise.all([
        dbGet('work_orders').catch(() => []),
        dbGet('orders').catch(() => []),
        dbGet('wo_progress').catch(() => []),
        dbGet('production_stages').catch(() => []),
        dbGet('wo_detail_items').catch(() => []),
      ]);
      setWos(w);
      setOrders(o);
      setProgress(p);
      setStages(s);
      setDetailItems(di);
      setError('');
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const historyRows = useMemo<HistoryRow[]>(() => {
    const shipmentStage = stages.find(s => String(s.nama) === 'Shipment');
    const shipmentId = shipmentStage ? Number(shipmentStage.id) : null;
    const ordersById: Record<number, Row> = {};
    for (const o of orders) ordersById[Number(o.id)] = o;

    const qtyByWo: Record<number, number> = {};
    for (const di of detailItems) {
      const woId = Number(di.work_order_id);
      const q = Number(di.qty) || Number(di.jumlah) || 0;
      qtyByWo[woId] = (qtyByWo[woId] || 0) + q;
    }

    const out: HistoryRow[] = [];
    for (const w of wos) {
      const st = String(w.status || '').toUpperCase();
      if (st !== 'SELESAI') continue;
      const order = ordersById[Number(w.order_id)];
      if (!order || String(order.status || '').toUpperCase() !== 'DONE') continue;

      let tanggalSelesai = '';
      if (shipmentId) {
        const sp = progress.find(p =>
          Number(p.work_order_id) === Number(w.id) && Number(p.stage_id) === shipmentId
        );
        if (sp?.completed_at) tanggalSelesai = String(sp.completed_at);
      }
      if (!tanggalSelesai && order.pelunasan_approved_at) {
        tanggalSelesai = String(order.pelunasan_approved_at);
      }

      out.push({
        woId: Number(w.id),
        no_wo: String(w.no_wo || ''),
        customer: String(w.customer_nama || order.customer_nama || ''),
        paket: String(w.paket || order.paket || ''),
        qty: qtyByWo[Number(w.id)] || 0,
        tanggal_order: String(order.tanggal_order || ''),
        tanggal_selesai: tanggalSelesai,
        order_id: Number(order.id),
        no_order: String(order.no_order || ''),
        status_terkirim: Number(order.status_terkirim) || 0,
        status_terkirim_at: String(order.status_terkirim_at || ''),
      });
    }
    return out.sort((a, b) => String(b.tanggal_selesai).localeCompare(String(a.tanggal_selesai)));
  }, [wos, orders, progress, stages, detailItems]);

  // Partition per tab.
  const belumRows = useMemo(() => historyRows.filter(r => r.status_terkirim !== 1), [historyRows]);
  const sudahRows = useMemo(() => historyRows.filter(r => r.status_terkirim === 1), [historyRows]);
  const activeRows = tab === 'belum' ? belumRows : sudahRows;

  const filteredRows = useMemo(() => {
    let list = activeRows;
    if (month) {
      list = list.filter(r => String(r.tanggal_selesai || '').slice(0, 7) === month);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.no_wo.toLowerCase().includes(q)
        || r.customer.toLowerCase().includes(q)
        || r.paket.toLowerCase().includes(q)
        || r.no_order.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeRows, month, search]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return `${BULAN_ID[m - 1] || ''} ${y}`;
  }, [month]);

  const totalQty = useMemo(() => filteredRows.reduce((s, r) => s + r.qty, 0), [filteredRows]);
  const totalWo = filteredRows.length;

  // Toggle status_terkirim untuk 1 order. Optimistic update untuk feedback
  // cepat, roll back kalau server error.
  async function toggleStatusTerkirim(row: HistoryRow, checked: boolean) {
    setBusyId(row.woId);
    // Optimistic update
    setOrders(prev => prev.map(o =>
      Number(o.id) === row.order_id
        ? { ...o, status_terkirim: checked ? 1 : 0, status_terkirim_at: checked ? nowSql() : null }
        : o
    ));
    try {
      await dbUpdate('orders', row.order_id, {
        status_terkirim: checked ? 1 : 0,
        status_terkirim_at: checked ? nowSql() : null,
      });
      toast.success(
        checked ? 'Status Terkirim' : 'Status Terkirim Dibatalkan',
        checked
          ? `${row.customer} pindah ke tab Sudah Terkirim + muncul di Laporan Finance.`
          : `${row.customer} kembali ke tab Belum Terkirim.`,
      );
      await fetchAll();
    } catch (e) {
      toast.error('Gagal', String(e));
      await fetchAll(); // sync ulang dari server
    }
    setBusyId(null);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.14] via-teal-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">History Produksi</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                WO yang sudah selesai. Centang <strong className="text-emerald-300">Status Terkirim</strong> saat barang dikirim ke customer.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">Bulan</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500/40 date-input"
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
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-5 py-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Tab switcher */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#111827] border border-white/[0.06]">
        <button
          onClick={() => setTab('belum')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === 'belum'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          Belum Terkirim
          <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full ${
            tab === 'belum' ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-300'
          }`}>{belumRows.length}</span>
        </button>
        <button
          onClick={() => setTab('sudah')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === 'sudah'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          Sudah Terkirim
          <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full ${
            tab === 'sudah' ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-300'
          }`}>{sudahRows.length}</span>
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Periode" value={month ? monthLabel : 'Semua Bulan'} accent="cyan" />
        <StatCard label={tab === 'belum' ? 'Belum Terkirim' : 'Sudah Terkirim'} value={totalWo.toLocaleString('id-ID')} accent={tab === 'belum' ? 'amber' : 'emerald'} />
        <StatCard label="Total Pcs" value={totalQty.toLocaleString('id-ID')} accent="blue" />
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
            placeholder="Cari No WO, No Order, customer, atau paket..."
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-emerald-500/40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 w-32">No WO</th>
                <th className="text-left px-4 py-3 w-28">No Order</th>
                <th className="text-left px-4 py-3 min-w-[220px]">Customer</th>
                <th className="text-left px-4 py-3 min-w-[160px]">Paket</th>
                <th className="text-right px-4 py-3 w-20">Qty</th>
                <th className="text-left px-4 py-3 w-32">Tgl Order</th>
                <th className="text-left px-4 py-3 w-36">Tgl Selesai</th>
                {tab === 'sudah' && <th className="text-left px-4 py-3 w-36">Tgl Terkirim</th>}
                <th className="text-center px-4 py-3 w-32">
                  {tab === 'belum' ? 'Status Terkirim' : 'Aksi'}
                </th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={tab === 'sudah' ? 10 : 9} className="px-4 py-10 text-center text-sm text-slate-500">
                    {tab === 'belum'
                      ? (activeRows.length === 0
                          ? 'Belum ada WO yang siap kirim. Data muncul setelah Finance approve pelunasan.'
                          : 'Tidak ada hasil untuk filter tersebut.')
                      : (activeRows.length === 0
                          ? 'Belum ada WO yang di-centang Status Terkirim.'
                          : 'Tidak ada hasil untuk filter tersebut.')
                    }
                  </td>
                </tr>
              ) : (
                filteredRows.map(r => (
                  <tr key={r.woId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-emerald-300 font-mono text-xs">{r.no_wo || `#${r.woId}`}</td>
                    <td className="px-4 py-3 text-blue-300 font-mono text-xs">{r.no_order || `#${r.order_id}`}</td>
                    <td className="px-4 py-3 text-white font-medium">{r.customer || '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{r.paket || '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{r.qty.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(r.tanggal_order)}</td>
                    <td className="px-4 py-3 text-emerald-400 text-xs">{fmtDateTime(r.tanggal_selesai)}</td>
                    {tab === 'sudah' && (
                      <td className="px-4 py-3 text-emerald-300 text-xs">{fmtDateTime(r.status_terkirim_at)}</td>
                    )}
                    <td className="px-4 py-3 text-center">
                      {tab === 'belum' ? (
                        <label className={`inline-flex items-center gap-2 cursor-pointer group ${busyId === r.woId ? 'opacity-50 pointer-events-none' : ''}`}>
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={e => toggleStatusTerkirim(r, e.target.checked)}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer"
                          />
                          <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">
                            Centang
                          </span>
                        </label>
                      ) : (
                        <button
                          onClick={() => toggleStatusTerkirim(r, false)}
                          disabled={busyId === r.woId}
                          className="text-[10px] font-medium text-amber-300 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 px-2 py-1 rounded-md transition-colors"
                          title="Kembalikan ke tab Belum Terkirim"
                        >
                          Batalkan
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <Link
                        href={`/work-orders/${r.woId}`}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-2 py-1 rounded-md transition-colors"
                      >
                        Lihat
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 0 && (
          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500">
            <span>{filteredRows.length} WO ditampilkan</span>
            <span>Sort: Terbaru dulu</span>
          </div>
        )}
      </div>
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
      <p className="text-2xl font-bold mt-1 tabular-nums text-white truncate" title={value}>{value}</p>
    </div>
  );
}
