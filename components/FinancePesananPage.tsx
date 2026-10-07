'use client';

// Finance — "Pekerjaan Pesanan" (mode='pekerjaan') & "Finalisasi Pekerjaan
// Pesanan" (mode='finalisasi'). Satu komponen, dibedakan prop `mode`.
//
// Sumber data: wo_pengeluaran (Real Pengeluaran Bahan dari gudang) + wo_finance
// (tracking finalisasi). Alur:
//   - pekerjaan  : daftar WO yang sudah punya Real Pengeluaran Bahan TAPI belum
//                  difinalisasi. Finance klik checklist (tanda sudah diinput ke
//                  Accurate) → WO pindah ke Finalisasi. Checklist bisa lebih
//                  dari 1 (tiap kali WO di-revisi & diinput ulang).
//   - finalisasi : daftar WO yang sudah difinalisasi. Menampilkan berapa kali
//                  diinput/direvisi. Bisa dibatalkan manual (balik ke pekerjaan).
//   - Kalau gudang mengubah kuantitas pengeluaran WO yang sudah finalized →
//     otomatis unfinalized (server, save-pengeluaran) → muncul lagi di pekerjaan.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet } from '@/lib/api-db';
import { useAuth } from '@/lib/auth-context';
import { buildAksesorisSet } from '@/lib/qty-aksesoris';
import { Pagination, paginate } from '@/lib/pagination';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface ChecklistMark { ke: number; at: string; by: string | null }
interface FinanceInfo { finalized: boolean; revisiCount: number; checklist: ChecklistMark[]; finalizedAt: string | null; finalizedBy: string | null }

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '-';
  const s = d instanceof Date ? d.toISOString() : String(d);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return s; }
}
function fmtDateTime(d: string | null) {
  if (!d) return '-';
  try { return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
}
function parseChecklist(raw: unknown): ChecklistMark[] {
  try { const o = JSON.parse(String(raw || '[]')); return Array.isArray(o) ? o : []; } catch { return []; }
}

export default function FinancePesananPage({ mode }: { mode: 'pekerjaan' | 'finalisasi' }) {
  const toast = useToast();
  const { user } = useAuth();
  const myName = user?.nama || user?.username || '';
  const isPekerjaan = mode === 'pekerjaan';

  const [woAll, setWoAll] = useState<Row[]>([]);
  const [pengeluaran, setPengeluaran] = useState<Row[]>([]);
  const [financeRows, setFinanceRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailWo, setDetailWo] = useState<Row | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [wos, orders, items, barangCs, pg, fin] = await Promise.all([
        dbGet('work_orders'),
        dbGet('orders'),
        dbGet('order_items'),
        dbGet('barang_cs').catch(() => []),
        dbGet('wo_pengeluaran').catch(() => []),
        dbGet('wo_finance').catch(() => []),
      ]);
      const aksesorisSet = buildAksesorisSet(barangCs as Row[]);
      const orderMap: Record<string, Row> = {};
      for (const o of orders as Row[]) orderMap[String(o.id)] = o;
      const itemsByOrder: Record<string, { paket: string[]; qty: number }> = {};
      for (const it of items as Row[]) {
        const key = String(it.order_id);
        if (!itemsByOrder[key]) itemsByOrder[key] = { paket: [], qty: 0 };
        if (it.paket_nama) itemsByOrder[key].paket.push(String(it.paket_nama));
        const nama = String(it.paket_nama || '').trim().toLowerCase();
        if (!aksesorisSet.has(nama)) itemsByOrder[key].qty += Number(it.qty) || 0;
      }
      const mapped = (wos as Row[]).map(w => {
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
      });
      setWoAll(mapped);
      setPengeluaran(pg as Row[]);
      setFinanceRows(fin as Row[]);
    } catch { setWoAll([]); setPengeluaran([]); setFinanceRows([]); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const woById = useMemo(() => {
    const m = new Map<number, Row>();
    for (const w of woAll) m.set(Number(w.id), w);
    return m;
  }, [woAll]);

  // Info finance per WO.
  const financeByWo = useMemo(() => {
    const m = new Map<number, FinanceInfo>();
    for (const f of financeRows) {
      m.set(Number(f.work_order_id), {
        finalized: Number(f.finalized) === 1,
        revisiCount: Number(f.revisi_count) || 0,
        checklist: parseChecklist(f.checklist_json),
        finalizedAt: f.finalized_at ? String(f.finalized_at) : null,
        finalizedBy: f.finalized_by ? String(f.finalized_by) : null,
      });
    }
    return m;
  }, [financeRows]);

  // Daftar WO yang punya Real Pengeluaran Bahan (header wo_pengeluaran).
  const pengeluaranWos = useMemo(
    () => pengeluaran
      .map(p => woById.get(Number(p.work_order_id)))
      .filter((w): w is Row => Boolean(w))
      .sort((a, b) => String(b.tanggal_order || '').localeCompare(String(a.tanggal_order || ''))),
    [pengeluaran, woById],
  );

  // Pisahkan sesuai mode: pekerjaan = belum final; finalisasi = sudah final.
  const scoped = useMemo(
    () => pengeluaranWos.filter(w => {
      const fin = financeByWo.get(Number(w.id));
      const finalized = fin?.finalized ?? false;
      return isPekerjaan ? !finalized : finalized;
    }),
    [pengeluaranWos, financeByWo, isPekerjaan],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(w =>
      String(w.no_wo || '').toLowerCase().includes(q)
      || String(w.customer_nama || '').toLowerCase().includes(q)
      || String(w.paket || '').toLowerCase().includes(q)
    );
  }, [scoped, search]);

  const paged = paginate(filtered, page, pageSize);
  const cols = isPekerjaan ? 7 : 7;

  async function handleFinalize(wo: Row) {
    const fin = financeByWo.get(Number(wo.id));
    const nextKe = (fin?.revisiCount ?? 0) + 1;
    const yes = await toast.confirm({
      title: 'Checklist & Finalisasi?',
      message: nextKe > 1
        ? `Tandai ${wo.no_wo} sudah diinput ulang ke Accurate (input ke-${nextKe})? WO akan pindah ke Finalisasi Pekerjaan Pesanan.`
        : `Tandai ${wo.no_wo} sudah diinput ke Accurate? WO akan pindah ke Finalisasi Pekerjaan Pesanan.`,
      confirmText: 'Ya, Checklist',
    });
    if (!yes) return;
    setBusyId(Number(wo.id));
    try {
      const res = await fetch('/api/finance/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wo_id: Number(wo.id), action: 'finalize', by: myName }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Gagal finalisasi');
      toast.success('Terfinalisasi', `${wo.no_wo} pindah ke Finalisasi Pekerjaan Pesanan.`);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setBusyId(null);
  }

  async function handleUnfinalize(wo: Row) {
    const yes = await toast.confirm({
      title: 'Batalkan Finalisasi?',
      message: `${wo.no_wo} akan kembali ke menu Pekerjaan Pesanan untuk disesuaikan lagi.`,
      confirmText: 'Ya, Batalkan', type: 'danger',
    });
    if (!yes) return;
    setBusyId(Number(wo.id));
    try {
      const res = await fetch('/api/finance/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wo_id: Number(wo.id), action: 'unfinalize', by: myName }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Gagal membatalkan');
      toast.success('Dibatalkan', `${wo.no_wo} kembali ke Pekerjaan Pesanan.`);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setBusyId(null);
  }

  const accent = isPekerjaan
    ? { grad: 'from-amber-500/[0.14] via-orange-500/[0.06]', blob: 'bg-amber-500/10', iconWrap: 'from-amber-500/25 to-amber-500/5 border-amber-500/25', icon: 'text-amber-300', ring: 'focus:border-amber-500/40' }
    : { grad: 'from-emerald-500/[0.14] via-green-500/[0.06]', blob: 'bg-emerald-500/10', iconWrap: 'from-emerald-500/25 to-emerald-500/5 border-emerald-500/25', icon: 'text-emerald-300', ring: 'focus:border-emerald-500/40' };

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br ${accent.grad} to-transparent p-5 sm:p-6`}>
        <div aria-hidden className={`absolute -top-16 -right-16 w-48 h-48 rounded-full ${accent.blob} blur-3xl pointer-events-none`} />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accent.iconWrap} border grid place-items-center shrink-0`}>
              <svg className={`w-5 h-5 ${accent.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                {isPekerjaan
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />}
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{isPekerjaan ? 'Pekerjaan Pesanan' : 'Finalisasi Pekerjaan Pesanan'}</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                {isPekerjaan
                  ? <>Real pengeluaran bahan dari gudang. Klik <span className="text-amber-300 font-medium">checklist</span> kalau sudah diinput ke Accurate → pindah ke Finalisasi.</>
                  : <>WO yang sudah diinput finance ke Accurate. Jika pengeluaran berubah, WO otomatis kembali ke Pekerjaan Pesanan.</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="relative w-full sm:w-72">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Cari WO, customer, paket..."
                className={`w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none ${accent.ring}`} />
            </div>
            <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
              <span className="text-white tabular-nums">{filtered.length}</span> WO
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                {(isPekerjaan
                  ? ['NO WO', 'CUSTOMER', 'PAKET', 'QTY', 'TGL ORDER', 'CHECKLIST ACCURATE', 'AKSI']
                  : ['NO WO', 'CUSTOMER', 'PAKET', 'QTY', 'TGL ORDER', 'FINALISASI', 'AKSI']
                ).map(h => (
                  <th key={h} className={`text-[10px] text-slate-500 font-semibold ${h === 'QTY' ? 'text-right' : h === 'AKSI' ? 'text-right' : 'text-left'} px-5 py-3.5 uppercase tracking-widest`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={cols} className="px-5 py-16 text-center text-sm text-slate-500">Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={cols} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/5 to-transparent border border-white/10 grid place-items-center">
                      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <p className="text-sm text-slate-300 font-medium">{isPekerjaan ? 'Belum ada pekerjaan pesanan' : 'Belum ada yang difinalisasi'}</p>
                    <p className="text-xs text-slate-500 max-w-xs">
                      {isPekerjaan
                        ? 'WO muncul di sini setelah gudang membuat Real Pengeluaran Bahan-nya.'
                        : 'WO muncul di sini setelah di-checklist di menu Pekerjaan Pesanan.'}
                    </p>
                  </div>
                </td></tr>
              ) : (
                paged.slice.map((wo: Row) => {
                  const fin = financeByWo.get(Number(wo.id));
                  const revisi = fin?.revisiCount ?? 0;
                  const busy = busyId === Number(wo.id);
                  return (
                    <tr key={wo.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4"><span className="text-sm text-blue-300 font-semibold">{wo.no_wo}</span></td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white/10 to-white/5 border border-white/10 grid place-items-center text-[11px] font-bold text-slate-200 shrink-0">
                            {String(wo.customer_nama || '?').trim().charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-white font-medium truncate max-w-[220px]" title={wo.customer_nama}>{wo.customer_nama || '-'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-400 max-w-[300px]"><span className="line-clamp-2" title={wo.paket}>{wo.paket || '-'}</span></td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm text-slate-300 font-semibold tabular-nums">{wo.qty > 0 ? wo.qty : '-'}</span>
                        {wo.qty > 0 && <span className="text-slate-500 text-[11px] ml-1">pcs</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(wo.tanggal_order)}</td>

                      {isPekerjaan ? (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Checklist riwayat (sudah diinput sebelumnya) */}
                            {Array.from({ length: revisi }).map((_, i) => (
                              <span key={i} title={`Input ke-${i + 1} sudah pernah dilakukan`}
                                className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/40 grid place-items-center text-emerald-300">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              </span>
                            ))}
                            {/* Checklist aktif (klik untuk finalisasi) */}
                            <button onClick={() => handleFinalize(wo)} disabled={busy}
                              title={revisi > 0 ? `Checklist input ke-${revisi + 1} (revisi) → finalisasi` : 'Checklist: sudah diinput ke Accurate → finalisasi'}
                              className="w-6 h-6 rounded-md border border-white/20 bg-white/[0.03] hover:border-amber-400/60 hover:bg-amber-500/10 grid place-items-center text-slate-500 hover:text-amber-300 disabled:opacity-50 transition-colors">
                              {busy
                                ? <span className="w-3 h-3 rounded-full border-2 border-amber-400/30 border-t-amber-300 animate-spin" />
                                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
                            </button>
                            {revisi > 0 && <span className="text-[10px] text-amber-300/80 font-semibold">revisi ke-{revisi + 1}</span>}
                          </div>
                        </td>
                      ) : (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border text-emerald-300 bg-emerald-500/10 border-emerald-500/25">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              {revisi}× input
                            </span>
                            {revisi > 1 && <span className="text-[10px] text-slate-400">direvisi {revisi - 1}×</span>}
                            <span className="text-[10px] text-slate-500">
                              {fmtDateTime(fin?.finalizedAt ?? null)}{fin?.finalizedBy ? ` · ${fin.finalizedBy}` : ''}
                            </span>
                          </div>
                        </td>
                      )}

                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setDetailWo(wo)} title="Lihat detail pengeluaran bahan"
                            className="text-sky-300 hover:text-sky-200 p-1.5 rounded-lg hover:bg-sky-500/10 border border-transparent hover:border-sky-500/25 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                          {!isPekerjaan && (
                            <button onClick={() => handleUnfinalize(wo)} disabled={busy} title="Batalkan finalisasi → balik ke Pekerjaan Pesanan"
                              className="text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-amber-500/10 border border-transparent hover:border-amber-500/25 transition-colors disabled:opacity-50">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                            </button>
                          )}
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
            <Pagination current={paged.current} total={paged.total} count={paged.count} pageSize={pageSize}
              onChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          </div>
        )}
      </div>

      {detailWo && <DetailModal wo={detailWo} onClose={() => setDetailWo(null)} />}
    </div>
  );
}

/* Modal read-only: isi Real Pengeluaran Bahan sebuah WO. */
function DetailModal({ wo, onClose }: { wo: Row; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await dbGet<Row>('wo_pengeluaran_bahan', undefined, { work_order_id: Number(wo.id) }).catch(() => []);
        if (!cancelled) setRows((r as Row[]).slice().sort((a, b) => Number(a.urutan) - Number(b.urutan)));
      } catch { if (!cancelled) setRows([]); }
    })();
    return () => { cancelled = true; };
  }, [wo.id]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white truncate">Detail Pengeluaran Bahan</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              <span className="text-blue-400 font-medium">{String(wo.no_wo || '')}</span>{' · '}
              <span className="text-slate-300">{String(wo.customer_nama || '')}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/[0.05] transition-colors shrink-0" title="Tutup (Esc)">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {rows === null ? (
            <div className="h-40 grid place-items-center"><div className="w-8 h-8 rounded-full border-2 border-sky-500/20 border-t-sky-400 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-14 text-center"><p className="text-sm text-slate-400">Belum ada detail pengeluaran.</p></div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] bg-[#111827] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-200 font-bold text-center" style={{ background: '#f59e0b' }}>
                    <th className="border border-white/10 px-2 py-2 w-10" style={{ color: '#0f172a' }}>NO</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[150px]" style={{ color: '#0f172a' }}>ITEM</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[180px]" style={{ color: '#0f172a' }}>BAHAN</th>
                    <th className="border border-white/10 px-2 py-2 min-w-[100px]" style={{ color: '#0f172a' }}>WARNA</th>
                    <th className="border border-white/10 px-2 py-2 w-28" style={{ color: '#0f172a' }}>KUANTITAS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id ?? i} className="border-b border-white/[0.04]">
                      <td className="border border-white/10 text-center text-slate-500 px-2 py-1.5">{i + 1}</td>
                      <td className="border border-white/10 px-2 py-1.5 text-slate-200 font-semibold">{r.bagian || '—'}</td>
                      <td className="border border-white/10 px-2 py-1.5 text-slate-300">{r.bahan || <span className="text-slate-600">—</span>}</td>
                      <td className="border border-white/10 px-2 py-1.5 text-slate-300">{r.warna || <span className="text-slate-600">—</span>}</td>
                      <td className="border border-white/10 px-2 py-1.5 text-right tabular-nums text-white font-semibold">{String(r.kuantitas ?? 0).replace('.', ',')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
