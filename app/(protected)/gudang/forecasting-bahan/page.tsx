'use client';
import { useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';
import { buildAksesorisSet } from '@/lib/qty-aksesoris';
import { Pagination, paginate } from '@/lib/pagination';
import { buildWo4FormRows, detectWo4FormNos, type GudangRow } from '@/lib/wo4-form';

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
  const [woList, setWoList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // Modal WO4 — buka read-only preview form permintaan gudang untuk 1 WO.
  const [modalWo, setModalWo] = useState<Row | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const [wos, orders, items, barangCs] = await Promise.all([
        dbGet('work_orders'),
        dbGet('orders'),
        dbGet('order_items'),
        dbGet('barang_cs').catch(() => []),
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
          };
        })
        .filter(w => isVisibleTanggalOrder(w.tanggal_order));
      merged.sort((a, b) => String(b.tanggal_order || '').localeCompare(String(a.tanggal_order || '')));
      setWoList(merged);
    } catch { setWoList([]); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return woList;
    return woList.filter(w =>
      String(w.no_wo || '').toLowerCase().includes(q)
      || String(w.customer_nama || '').toLowerCase().includes(q)
      || String(w.paket || '').toLowerCase().includes(q)
    );
  }, [woList, search]);

  const paged = paginate(filtered, page, pageSize);

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
                Daftar work order aktif · Klik <span className="text-white font-medium">👁</span> untuk lihat Form Permintaan Gudang (WO 4)
              </p>
            </div>
          </div>
          <div className="w-full lg:w-80">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Cari WO, customer, paket..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-blue-500/40" />
            </div>
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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-300 font-medium">Belum ada work order</p>
                    <p className="text-xs text-slate-500 max-w-xs">Data customer akan muncul di sini setelah Work Order dibuat dari menu Work Orders.</p>
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
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => setModalWo(wo)}
                            title="Lihat Form Permintaan Gudang (WO 4)"
                            className="text-sky-300 hover:text-sky-200 p-1.5 rounded-lg hover:bg-sky-500/10 border border-transparent hover:border-sky-500/25 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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

      {modalWo && <Wo4PreviewModal wo={modalWo} onClose={() => setModalWo(null)} />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Wo4PreviewModal — read-only preview Form Permintaan Gudang
   untuk 1 WO. Fetch on-demand supaya tidak bloat list utama.
   Pakai buildWo4FormRows shared helper supaya persis sama dengan
   tab WO4 di halaman detail work-order.
   ──────────────────────────────────────────────────────────────── */
function Wo4PreviewModal({ wo, onClose }: { wo: Row; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [formsData, setFormsData] = useState<Record<number, GudangRow[]>>({});
  const [formNos, setFormNos] = useState<number[]>([]);
  const [activeForm, setActiveForm] = useState<number>(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const woId = Number(wo.id);
        const [gudang, specRows, specBahanAll, ukuranTim, barang] = await Promise.all([
          dbGet<Row>('wo_permintaan_gudang', undefined, { work_order_id: woId }),
          dbGet<Row>('wo_spesifikasi', undefined, { work_order_id: woId }),
          dbGet<Row>('wo_spesifikasi_bahan').catch(() => []),
          dbGet<Row>('wo_ukuran_tim', undefined, { work_order_id: woId }).catch(() => []),
          dbGet<Row>('barang').catch(() => []),
        ]);
        if (cancelled) return;
        const specIds = new Set(specRows.map(s => Number(s.id)));
        const specBahanForWo = specBahanAll.filter(b => specIds.has(Number(b.spesifikasi_id)));
        const masterBarangSet = new Set(barang.map(b => String(b.nama || '').toUpperCase().trim()));
        const nos = detectWo4FormNos(gudang as Row[]);
        const next: Record<number, GudangRow[]> = {};
        for (const fn of nos) {
          next[fn] = buildWo4FormRows({
            sourceRows: gudang as Row[],
            formNo: fn, woId,
            specs: specRows, specBahan: specBahanForWo, ukuranTim,
            masterBarangSet,
          });
        }
        setFormsData(next);
        setFormNos(nos);
        setActiveForm(nos[0] || 1);
      } catch {
        if (!cancelled) { setFormsData({}); setFormNos([1]); }
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

  const rows = formsData[activeForm] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white truncate">Form Permintaan Gudang (WO 4)</h3>
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

        {/* Multi-form tabs — hidden kalau cuma 1 form */}
        {formNos.length > 1 && (
          <div className="px-6 py-2 border-b border-white/10 flex items-center gap-2 flex-wrap">
            {formNos.map(fn => (
              <button key={fn}
                onClick={() => setActiveForm(fn)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  activeForm === fn
                    ? 'text-white bg-blue-500/20 border-blue-500/40'
                    : 'text-slate-400 bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                }`}
              >
                Form #{fn}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {loading ? (
            <div className="h-64 grid place-items-center">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500/20 border-t-blue-400 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-14 text-center">
              <p className="text-sm text-slate-400">Belum ada data Form Permintaan Gudang untuk WO ini.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] bg-[#111827] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-200 font-bold text-center" style={{ background: '#f59e0b' }}>
                    <th className="border border-white/10 px-2 py-2 w-10" style={{ color: '#0f172a' }}>NO</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[180px]" style={{ color: '#0f172a' }}>ITEM</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[200px]" style={{ color: '#0f172a' }}>BAHAN</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[120px]" style={{ color: '#0f172a' }}>WARNA</th>
                    <th className="border border-white/10 px-2 py-2 w-24" style={{ color: '#0f172a' }}>KUANTITAS</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let no = 0;
                    return rows.map((r, i) => {
                      if (r.sectionHeader) {
                        return (
                          <tr key={i}>
                            <td colSpan={5} className="border border-white/10 px-3 py-2 text-center font-extrabold text-[13px] tracking-wider" style={{ background: '#fde68a', color: '#0f172a' }}>
                              {r.sectionHeader}
                            </td>
                          </tr>
                        );
                      }
                      no++;
                      return (
                        <tr key={i} className={`border-b border-white/[0.04] ${!r.isFixed ? 'bg-blue-500/[0.03]' : ''}`}>
                          <td className="border border-white/10 text-center text-slate-500 px-2 py-1.5">{no}</td>
                          <td className="border border-white/10 px-2 py-1.5 text-slate-200 font-semibold">{r.bagian}</td>
                          <td className="border border-white/10 px-2 py-1.5 text-slate-300">{r.bahan || <span className="text-slate-600">—</span>}</td>
                          <td className="border border-white/10 px-2 py-1.5 text-slate-300">{r.warna || <span className="text-slate-600">—</span>}</td>
                          <td className="border border-white/10 px-2 py-1.5 text-right tabular-nums text-slate-200 font-semibold">{r.kuantitas || 0}</td>
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
          <p className="text-[11px] text-slate-500">Preview read-only. Edit form di menu <span className="text-slate-300 font-medium">Work Orders → tab WO 4</span>.</p>
          <button onClick={onClose} className="text-xs font-semibold text-slate-300 border border-white/10 bg-white/[0.03] px-4 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
