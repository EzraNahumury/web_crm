'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';
import { buildAksesorisSet } from '@/lib/qty-aksesoris';
import { Pagination, paginate } from '@/lib/pagination';
import { buildWo4FormRows, detectWo4FormNos, type GudangRow } from '@/lib/wo4-form';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '-';
  const s = d instanceof Date ? d.toISOString() : String(d);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return s; }
}

export default function ForecastingBahanPage() {
  const toast = useToast();
  const [woList, setWoList] = useState<Row[]>([]);
  const [forecasts, setForecasts] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalWo, setModalWo] = useState<Row | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Row | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const [wos, orders, items, barangCs, fc] = await Promise.all([
        dbGet('work_orders'),
        dbGet('orders'),
        dbGet('order_items'),
        dbGet('barang_cs').catch(() => []),
        dbGet('wo_forecast').catch(() => []),
      ]);
      const aksesorisSet = buildAksesorisSet(barangCs as Row[]);
      const orderMap: Record<string, Row> = {};
      for (const o of orders) orderMap[String(o.id)] = o;
      const itemsByOrder: Record<string, { paket: string[]; qty: number }> = {};
      for (const it of items as Row[]) {
        const key = String(it.order_id);
        if (!itemsByOrder[key]) itemsByOrder[key] = { paket: [], qty: 0 };
        if (it.paket_nama) itemsByOrder[key].paket.push(String(it.paket_nama));
        const nama = String(it.paket_nama || '').trim().toLowerCase();
        if (!aksesorisSet.has(nama)) {
          itemsByOrder[key].qty += Number(it.qty) || 0;
        }
      }
      const merged = (wos as Row[])
        .filter(w => Number(w.wo_confirmed) === 1)
        .map(w => {
          const ord = orderMap[String(w.order_id)];
          const oi = itemsByOrder[String(w.order_id)];
          return {
            ...w,
            customer_nama: ord?.customer_nama || w.customer_nama,
            paket: oi ? oi.paket.join(', ') : w.paket || '-',
            qty: oi ? oi.qty : (Number(w.jumlah) || 0),
            deadline: ord?.estimasi_deadline || w.deadline,
            tanggal_order: ord?.tanggal_order || w.created_at,
            no_order: ord?.no_order || '',
          };
        })
        .filter(w => isVisibleTanggalOrder(w.tanggal_order));
      merged.sort((a, b) => String(b.tanggal_order || '').localeCompare(String(a.tanggal_order || '')));
      setWoList(merged);
      setForecasts(fc as Row[]);
    } catch { setWoList([]); setForecasts([]); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  // Set of WO IDs yang sudah punya forecast row → dipakai untuk filter list.
  const forecastedIds = useMemo(() => new Set(forecasts.map(f => Number(f.work_order_id))), [forecasts]);

  // List forecasting = WO yang ADA di wo_forecast.
  const forecastedWos = useMemo(
    () => woList.filter(w => forecastedIds.has(Number(w.id))),
    [woList, forecastedIds],
  );

  // Picker options = WO yang BELUM ada di wo_forecast.
  const pickerCandidates = useMemo(
    () => woList.filter(w => !forecastedIds.has(Number(w.id))),
    [woList, forecastedIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return forecastedWos;
    return forecastedWos.filter(w =>
      String(w.no_wo || '').toLowerCase().includes(q)
      || String(w.customer_nama || '').toLowerCase().includes(q)
      || String(w.paket || '').toLowerCase().includes(q)
    );
  }, [forecastedWos, search]);

  const paged = paginate(filtered, page, pageSize);

  async function handleCreateForecast(woId: number) {
    try {
      await dbCreate('wo_forecast', { work_order_id: woId });
      toast.success('Forecasting Dibuat', 'WO ditambahkan ke daftar forecasting.');
      setPickerOpen(false);
      await fetchData();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
  }

  async function handleDeleteForecast(fc: Row) {
    try {
      // Delete detail rows first (avoid orphans), then header.
      const details = await dbGet<Row>('wo_forecast_bahan', undefined, { work_order_id: fc.id });
      for (const d of details) {
        try { await dbDelete('wo_forecast_bahan', d.id); } catch {}
      }
      const header = forecasts.find(f => Number(f.work_order_id) === Number(fc.id));
      if (header) await dbDelete('wo_forecast', header.id);
      toast.success('Dihapus', 'Forecasting dihapus dari daftar.');
      setDeleteConfirm(null);
      await fetchData();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
  }

  const today = new Date(); today.setHours(0,0,0,0);

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-blue-500/[0.14] via-cyan-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/25 to-blue-500/5 border border-blue-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Forecasting Bahan</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Perkiraan kebutuhan bahan per WO (tidak mengurangi stok). Klik <span className="text-white font-medium">👁</span> untuk isi/edit.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="relative w-full sm:w-72">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Cari WO, customer, paket..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-blue-500/40" />
            </div>
            <button onClick={() => setPickerOpen(true)}
              className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-lg transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Buat Forecasting
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                {['NO WO', 'CUSTOMER', 'PAKET', 'QTY', 'TGL ORDER', 'DEADLINE', 'STATUS', 'AKSI'].map(h => (
                  <th key={h} className={`text-[10px] text-slate-500 font-semibold ${h === 'QTY' ? 'text-right' : h === 'AKSI' ? 'text-right' : 'text-left'} px-5 py-3.5 uppercase tracking-widest`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-500">Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/15 to-transparent border border-blue-500/20 grid place-items-center">
                      <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-300 font-medium">Belum ada forecasting</p>
                    <p className="text-xs text-slate-500 max-w-xs">Klik <strong className="text-white">Buat Forecasting</strong> untuk mulai membuat perkiraan bahan per WO.</p>
                  </div>
                </td></tr>
              ) : (
                paged.slice.map((wo: Row) => {
                  const deadline = wo.deadline ? new Date(wo.deadline) : null;
                  const daysLeft = deadline ? Math.floor((deadline.getTime() - today.getTime()) / 86400000) : null;
                  const isOverdue = daysLeft !== null && daysLeft < 0 && String(wo.status || '').toUpperCase() !== 'SELESAI';
                  const statusMap: Record<string, { label: string; cls: string }> = {
                    PENDING: { label: 'Pending', cls: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
                    PROSES_PRODUKSI: { label: 'Proses Produksi', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                    SELESAI: { label: 'Selesai', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                    TERLAMBAT: { label: 'Terlambat', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
                  };
                  const st = isOverdue ? statusMap.TERLAMBAT : (statusMap[String(wo.status || '').toUpperCase()] || statusMap.PENDING);
                  return (
                    <tr key={wo.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-blue-300 font-semibold">{wo.no_wo}</span>
                          {isOverdue && (
                            <span title="Terlambat" className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/25 text-red-300">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                              LATE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 grid place-items-center text-[11px] font-bold text-blue-200 shrink-0">
                            {String(wo.customer_nama || '?').trim().charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-white font-medium truncate max-w-[220px]" title={wo.customer_nama}>{wo.customer_nama || '-'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-400 max-w-[320px]">
                        <span className="line-clamp-2" title={wo.paket}>{wo.paket || '-'}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm text-slate-300 font-semibold tabular-nums">{wo.qty > 0 ? wo.qty : '-'}</span>
                        {wo.qty > 0 && <span className="text-slate-500 text-[11px] ml-1">pcs</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(wo.tanggal_order)}</td>
                      <td className={`px-5 py-4 text-sm font-medium ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                        {fmtDate(wo.deadline)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setModalWo(wo)}
                            title="Isi / edit forecasting"
                            className="text-sky-300 hover:text-sky-200 p-1.5 rounded-lg hover:bg-sky-500/10 border border-transparent hover:border-sky-500/25 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(wo)}
                            title="Hapus dari daftar forecasting"
                            className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/25 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.015]">
            <Pagination
              current={paged.current}
              total={paged.total}
              count={paged.count}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
          </div>
        )}
      </div>

      {pickerOpen && (
        <PickerModal
          candidates={pickerCandidates}
          onClose={() => setPickerOpen(false)}
          onPick={handleCreateForecast}
        />
      )}
      {modalWo && (
        <Wo4ForecastModal
          wo={modalWo}
          onClose={() => setModalWo(null)}
          onSaved={fetchData}
        />
      )}
      {deleteConfirm && (
        <ConfirmDialog
          title="Hapus Forecasting?"
          message={`Hapus forecasting untuk ${deleteConfirm.no_wo} — ${deleteConfirm.customer_nama}? Data forecast bahan (bahan/warna/kuantitas yang sudah diisi) juga akan hilang.`}
          onConfirm={() => handleDeleteForecast(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   PickerModal — pilih WO yang belum ada forecasting-nya.
   Layout mirror "Buat Work Order dari Order" (image #640).
   ──────────────────────────────────────────────────────────────── */
function PickerModal({ candidates, onClose, onPick }: {
  candidates: Row[];
  onClose: () => void;
  onPick: (woId: number) => void;
}) {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return candidates;
    return candidates.filter(w =>
      String(w.no_wo || '').toLowerCase().includes(s)
      || String(w.customer_nama || '').toLowerCase().includes(s)
      || String(w.no_order || '').toLowerCase().includes(s)
    );
  }, [candidates, q]);

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some(w => Number(w.id) === selectedId)) {
      setSelectedId(Number(filtered[0].id));
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function submit() {
    if (!selectedId) return;
    setSaving(true);
    try { await onPick(selectedId); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">Buat Forecasting Bahan</h3>
            <p className="text-xs text-slate-400 mt-1">Pilih Work Order yang mau dibuatkan forecasting-nya.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.05]" title="Tutup (Esc)">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-6 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-1.5">Cari WO</p>
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Ketik no WO, nama customer, atau no order..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500/40" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-1.5">Pilih WO</p>
            {filtered.length === 0 ? (
              <div className="border border-white/10 rounded-lg py-10 text-center bg-white/[0.02]">
                <p className="text-sm text-slate-400">
                  {candidates.length === 0
                    ? 'Semua WO sudah ada forecasting-nya.'
                    : 'Tidak ada WO yang cocok dengan pencarian.'}
                </p>
              </div>
            ) : (
              <select
                size={Math.min(10, Math.max(4, filtered.length))}
                value={selectedId ?? ''}
                onChange={e => setSelectedId(Number(e.target.value))}
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-2 py-2 focus:outline-none focus:border-blue-500/40"
                style={{ minHeight: 160 }}
              >
                {filtered.map(w => (
                  <option key={w.id} value={Number(w.id)} className="py-1">
                    {w.no_wo} — {w.customer_nama}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 mt-4 border-t border-white/10 bg-white/[0.02]">
          <p className="text-[11px] text-slate-500">
            {selectedId ? 'Klik "Buat Forecasting" untuk lanjut.' : 'Pilih WO dulu.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm font-medium text-slate-300 border border-white/10 bg-white/[0.03] px-4 py-2 rounded-lg hover:bg-white/[0.06] transition-colors">
              Batal
            </button>
            <button
              onClick={submit}
              disabled={!selectedId || saving}
              className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-500/20"
            >
              {saving ? 'Membuat...' : 'Buat Forecasting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Wo4ForecastModal — modal editable untuk isi forecasting bahan.
   Pakai template WO4 (KAIN/ACCESSORIS/SIZE) untuk baris. Data
   disimpan di wo_forecast_bahan (TERPISAH dari wo_permintaan_gudang).
   Warning kalau kuantitas > stok bahan.
   ──────────────────────────────────────────────────────────────── */
function Wo4ForecastModal({ wo, onClose, onSaved }: {
  wo: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<GudangRow[]>([]);
  const [barangList, setBarangList] = useState<Row[]>([]);
  const [stokMap, setStokMap] = useState<Record<string, { qty: number; satuan: string }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const woId = Number(wo.id);
        const [forecast, gudang, specRows, specBahanAll, ukuranTim, barang, stok] = await Promise.all([
          dbGet<Row>('wo_forecast_bahan', undefined, { work_order_id: woId }).catch(() => []),
          dbGet<Row>('wo_permintaan_gudang', undefined, { work_order_id: woId }).catch(() => []),
          dbGet<Row>('wo_spesifikasi', undefined, { work_order_id: woId }).catch(() => []),
          dbGet<Row>('wo_spesifikasi_bahan').catch(() => []),
          dbGet<Row>('wo_ukuran_tim', undefined, { work_order_id: woId }).catch(() => []),
          dbGet<Row>('barang').catch(() => []),
          dbGet<Row>('stok').catch(() => []),
        ]);
        if (cancelled) return;
        setBarangList(barang);
        // Build stok lookup: nama barang (upper) → qty & satuan.
        const sm: Record<string, { qty: number; satuan: string }> = {};
        for (const s of stok) {
          const nama = String(s.barang_nama || '').toUpperCase().trim();
          if (!nama) continue;
          sm[nama] = { qty: Number(s.qty) || 0, satuan: String(s.satuan || '') };
        }
        setStokMap(sm);

        // Kalau sudah ada forecast rows di DB, load itu.
        if (forecast.length > 0) {
          const loaded: GudangRow[] = forecast
            .slice()
            .sort((a, b) => Number(a.urutan) - Number(b.urutan))
            .map(r => ({
              id: Number(r.id),
              urutan: Number(r.urutan),
              kategori: String(r.kategori || 'BAHAN_UTAMA'),
              bagian: String(r.bagian || ''),
              bahan: String(r.bahan || ''),
              warna: String(r.warna || ''),
              kuantitas: Number(r.kuantitas) || 0,
              isFixed: true,
            }));
          // Restore section headers untuk visual (KAIN/ACCESSORIS/SIZE).
          setRows(injectSectionHeaders(loaded));
        } else {
          // Belum ada forecast → seed dari template WO4 (mirror wo_permintaan_gudang
          // atau derive dari WO1 kalau kosong). Semua kuantitas 0 (perlu diisi).
          const specIds = new Set(specRows.map(s => Number(s.id)));
          const specBahanForWo = specBahanAll.filter(b => specIds.has(Number(b.spesifikasi_id)));
          const masterBarangSet = new Set(barang.map(b => String(b.nama || '').toUpperCase().trim()));
          const formNos = detectWo4FormNos(gudang as Row[]);
          const template = buildWo4FormRows({
            sourceRows: gudang as Row[],
            formNo: formNos[0] || 1,
            woId,
            specs: specRows,
            specBahan: specBahanForWo,
            ukuranTim,
            masterBarangSet,
          });
          // Reset kuantitas ke 0 (forecast baru = belum diisi).
          const seeded = template.map(r => r.sectionHeader ? r : { ...r, kuantitas: 0, id: null });
          setRows(seeded);
        }
      } catch {
        if (!cancelled) setRows([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [wo.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const bahanOptions = useMemo(
    () => barangList.map(b => String(b.nama || '')).filter(Boolean).sort(),
    [barangList],
  );

  function setField(idx: number, field: 'bagian' | 'bahan' | 'warna' | 'kuantitas', val: string | number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  // Tambah baris kosong di akhir — team gudang bisa isi item/bahan/warna/qty sendiri.
  function addRow() {
    setRows(prev => [...prev, {
      id: null, urutan: 0, kategori: 'BAHAN_UTAMA',
      bagian: '', bahan: '', warna: '', kuantitas: 0, isFixed: false,
    }]);
  }
  // Hapus baris (persist saat Simpan — handleSave delete-all lalu re-insert dari rows).
  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }

  // Warnings: bagian yang kuantitas > stok. Aggregated per bahan (case beberapa
  // baris pakai bahan sama, sum kuantitas dan bandingkan stok tunggal).
  const warnings = useMemo(() => {
    const needed: Record<string, number> = {};
    for (const r of rows) {
      if (r.sectionHeader) continue;
      const b = r.bahan.trim().toUpperCase();
      if (!b) continue;
      needed[b] = (needed[b] || 0) + (Number(r.kuantitas) || 0);
    }
    const warns: { bahan: string; needed: number; stok: number; satuan: string }[] = [];
    for (const b in needed) {
      const stok = stokMap[b];
      if (!stok && needed[b] > 0) {
        warns.push({ bahan: b, needed: needed[b], stok: 0, satuan: '-' });
      } else if (stok && needed[b] > stok.qty) {
        warns.push({ bahan: b, needed: needed[b], stok: stok.qty, satuan: stok.satuan });
      }
    }
    return warns;
  }, [rows, stokMap]);

  async function handleSave() {
    setSaving(true);
    try {
      const woId = Number(wo.id);
      // Delete semua existing forecast rows untuk WO ini, lalu re-insert.
      const existing = await dbGet<Row>('wo_forecast_bahan', undefined, { work_order_id: woId }).catch(() => []);
      for (const e of existing) {
        try { await dbDelete('wo_forecast_bahan', e.id); } catch {}
      }
      let ordinal = 0;
      for (const r of rows) {
        if (r.sectionHeader) continue;
        ordinal++;
        await dbCreate('wo_forecast_bahan', {
          work_order_id: woId,
          form_no: 1,
          urutan: ordinal,
          kategori: r.kategori || 'BAHAN_UTAMA',
          bagian: r.bagian || '',
          bahan: r.bahan || null,
          warna: r.warna || null,
          kuantitas: Number(r.kuantitas) || 0,
        });
      }
      toast.success('Tersimpan', 'Forecasting bahan berhasil disimpan.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white truncate">Forecasting Bahan (WO 4)</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              <span className="text-blue-400 font-medium">{String(wo.no_wo || '')}</span>
              {' · '}
              <span className="text-slate-300">{String(wo.customer_nama || '')}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/[0.05] transition-colors shrink-0" title="Tutup (Esc)">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {warnings.length > 0 && (
          <div className="px-6 py-3 border-b border-white/10 bg-amber-500/[0.06]">
            <div className="flex items-start gap-2.5">
              <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-amber-200 mb-1">Stok tidak cukup untuk {warnings.length} bahan</p>
                <ul className="text-[11px] text-amber-100/80 space-y-0.5">
                  {warnings.slice(0, 5).map(w => (
                    <li key={w.bahan}>
                      <span className="font-semibold text-white">{w.bahan}</span> — perlu {w.needed}, stok {w.stok} {w.satuan}
                    </li>
                  ))}
                  {warnings.length > 5 && <li>… dan {warnings.length - 5} lainnya</li>}
                </ul>
                <p className="text-[10px] text-amber-200/60 mt-1 italic">Forecasting tetap bisa disimpan — stok asli tidak dikurangi.</p>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {loading ? (
            <div className="h-64 grid place-items-center">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500/20 border-t-blue-400 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-14 text-center">
              <p className="text-sm text-slate-400">Template tidak bisa di-load.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] bg-[#111827] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-200 font-bold text-center" style={{ background: '#f59e0b' }}>
                    <th className="border border-white/10 px-2 py-2 w-10" style={{ color: '#0f172a' }}>NO</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[160px]" style={{ color: '#0f172a' }}>ITEM</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[200px]" style={{ color: '#0f172a' }}>BAHAN</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[100px]" style={{ color: '#0f172a' }}>WARNA</th>
                    <th className="border border-white/10 px-2 py-2 w-28" style={{ color: '#0f172a' }}>KUANTITAS</th>
                    <th className="border border-white/10 px-2 py-2 w-32" style={{ color: '#0f172a' }}>STOK</th>
                    <th className="border border-white/10 px-2 py-2 w-12" style={{ color: '#0f172a' }}>AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let no = 0;
                    return rows.map((r, i) => {
                      if (r.sectionHeader) {
                        return (
                          <tr key={i}>
                            <td colSpan={7} className="border border-white/10 px-3 py-2 text-center font-extrabold text-[13px] tracking-wider" style={{ background: '#fde68a', color: '#0f172a' }}>
                              {r.sectionHeader}
                            </td>
                          </tr>
                        );
                      }
                      no++;
                      const stok = r.bahan ? stokMap[r.bahan.toUpperCase().trim()] : undefined;
                      const stokQty = stok?.qty ?? 0;
                      const satuan = stok?.satuan || '-';
                      const isDefisit = r.bahan && Number(r.kuantitas) > stokQty;
                      return (
                        <tr key={i} className="border-b border-white/[0.04]">
                          <td className="border border-white/10 text-center text-slate-500 px-2 py-1">{no}</td>
                          <td className="border border-white/10 p-1">
                            <input
                              value={r.bagian}
                              onChange={e => setField(i, 'bagian', e.target.value)}
                              className="w-full bg-transparent text-slate-200 font-semibold text-xs px-2 py-1 focus:bg-white/[0.05] focus:outline-none rounded"
                              placeholder="Item..."
                            />
                          </td>
                          <td className="border border-white/10 p-1">
                            <BahanCombobox
                              value={r.bahan}
                              options={bahanOptions}
                              onChange={v => setField(i, 'bahan', v)}
                            />
                          </td>
                          <td className="border border-white/10 p-1">
                            <input
                              value={r.warna}
                              onChange={e => setField(i, 'warna', e.target.value)}
                              className="w-full bg-transparent text-white text-xs px-2 py-1 focus:bg-white/[0.05] focus:outline-none rounded"
                              placeholder="Warna..."
                            />
                          </td>
                          <td className="border border-white/10 p-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.kuantitas || ''}
                              onChange={e => {
                                const v = e.target.value.replace(/[^\d.]/g, '');
                                setField(i, 'kuantitas', v === '' ? 0 : Number(v));
                              }}
                              className={`w-full bg-transparent text-right tabular-nums text-xs px-2 py-1 focus:bg-white/[0.05] focus:outline-none rounded ${isDefisit ? 'text-amber-300 font-semibold' : 'text-white'}`}
                              placeholder="0"
                            />
                          </td>
                          <td className="border border-white/10 px-2 py-1.5 text-right text-xs">
                            {r.bahan && stok ? (
                              <span className={isDefisit ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                                {stokQty} <span className="text-slate-600 text-[10px]">{satuan}</span>
                              </span>
                            ) : r.bahan ? (
                              <span className="text-rose-400 text-[10px]">Belum ada di stok</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="border border-white/10 text-center px-1 py-1">
                            <button onClick={() => removeRow(i)} title="Hapus baris"
                              className="text-rose-500 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-slate-500">
            Forecasting = perkiraan kebutuhan. <span className="text-slate-400 font-medium">Tidak mengurangi stok asli.</span>
          </p>
          <div className="flex items-center gap-2">
            <button onClick={addRow} disabled={loading}
              className="text-xs font-semibold text-blue-300 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Tambah Baris
            </button>
            <button onClick={onClose} className="text-xs font-semibold text-slate-300 border border-white/10 bg-white/[0.03] px-4 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
              Tutup
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Restore section headers untuk visual di forecast rows yang diload dari DB.
   Insert 'KAIN' sebelum baris pertama BAHAN_UTAMA, 'ACCESSORIS' sebelum
   baris pertama AUTENTIC..DTF SIZE, 'SIZE' sebelum baris pertama XS..XXL. */
function injectSectionHeaders(rows: GudangRow[]): GudangRow[] {
  const ACCESSORIS_SET = new Set(['AUTENTIC', 'WEBBING', 'WASHTAG', 'ELASTIC PANTS', 'DTF SPONSOR', 'POLIFLEX', 'DTF SIZE']);
  const SIZE_SET = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL']);
  const out: GudangRow[] = [];
  let seenKain = false, seenAcc = false, seenSize = false;
  const mk = (label: string): GudangRow => ({
    id: null, urutan: 0, kategori: 'SECTION', bagian: '', bahan: '',
    warna: '', kuantitas: 0, sectionHeader: label,
  });
  for (const r of rows) {
    const bg = r.bagian.toUpperCase();
    if (ACCESSORIS_SET.has(bg)) {
      if (!seenAcc) { out.push(mk('ACCESSORIS')); seenAcc = true; }
    } else if (SIZE_SET.has(bg)) {
      if (!seenSize) { out.push(mk('SIZE')); seenSize = true; }
    } else {
      if (!seenKain) { out.push(mk('KAIN')); seenKain = true; }
    }
    out.push(r);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────
   ConfirmDialog — dialog konfirmasi untuk delete.
   ──────────────────────────────────────────────────────────────── */
function ConfirmDialog({ title, message, onConfirm, onCancel }: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/25 grid place-items-center shrink-0">
            <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="text-sm text-slate-400 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-sm font-medium text-slate-300 border border-white/10 bg-white/[0.03] px-4 py-2 rounded-lg hover:bg-white/[0.06] transition-colors">
            Batal
          </button>
          <button onClick={onConfirm} className="text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-lg transition-colors shadow-lg shadow-rose-500/20">
            Ya, Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   BahanCombobox — pengganti native <datalist> yang UI-nya mentah.
   Input bisa diketik (filter) + dropdown terstyle, dirender via portal
   (position: fixed di bawah input) supaya tidak ke-clip oleh scroll
   container tabel/modal.
   ──────────────────────────────────────────────────────────────── */
function BahanCombobox({ value, options, onChange }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const q = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = q ? options.filter(o => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 60);
  }, [q, options]);

  function reposition() {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) {
      // Kalau ruang bawah sempit, buka ke atas.
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < 220 && r.top > spaceBelow;
      setRect({ left: r.left, top: openUp ? r.top - Math.min(256, filtered.length * 32) - 4 : r.bottom + 2, width: r.width });
    }
  }
  function openList() { reposition(); setOpen(true); }

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); if (!open) openList(); else reposition(); }}
        onFocus={openList}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Pilih / ketik bahan..."
        autoComplete="off"
        className="w-full bg-transparent text-white text-xs px-2 py-1 focus:bg-white/[0.05] focus:outline-none rounded"
      />
      {open && rect && filtered.length > 0 && createPortal(
        <div
          style={{ position: 'fixed', left: rect.left, top: rect.top, width: Math.max(rect.width, 240), zIndex: 80 }}
          className="max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#0d1117] shadow-2xl shadow-black/60"
        >
          {filtered.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(o); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs border-b border-white/[0.04] last:border-0 transition-colors ${o.toLowerCase() === q ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/[0.06]'}`}
            >
              {o}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
