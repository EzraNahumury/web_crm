'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { dbGet, dbUpdate, dbCreate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

function fmtRp(n: number) { return new Intl.NumberFormat('id-ID').format(n); }
function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(v);
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2}):?(\d{2})?/);
  if (!m) return String(v);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5] || '00'}`;
}

export default function ApprovalFinancePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // Full-screen image preview when Finance clicks the bukti TF thumbnail.
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, l, it] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('order_payments').catch(() => []),
        dbGet('leads').catch(() => []),
        dbGet('order_items').catch(() => []),
      ]);
      setOrders(o);
      setPayments(p);
      setLeads(l);
      setItems(it);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Finance's scope covers three review moments:
  //   • DP Desain review — order still at status='SELLING' (initial
  //     handoff from CS Selling).
  //   • Invoice review — CS Order finished both Rincian and Bukti
  //     Pembayaran, so bukti_uploaded=1. Until Bukti step is done,
  //     the order sits with CS Order and is NOT queued for Finance.
  //   • Pelunasan review — produksi klik Submit di stage QC Final
  //     dan Packing, pelunasan_status='PENDING'. Approve di sini
  //     akan advance WO ke Shipment.
  //   • Anything Finance already stamped (APPROVED/REJECTED) also
  //     shows in the "Semua" tab as history — plus rejects go into
  //     the Ditolak tab so CS Selling can see the note.
  // DONE is excluded — no work left for Finance there.
  const scoped = useMemo(() => {
    return orders.filter(o => {
      const st = String(o.status || '').toUpperCase();
      const via = String(o.created_via || '').toUpperCase();
      const fs = String(o.finance_status || '').toUpperCase();
      const ps = String(o.pelunasan_status || '').toUpperCase();
      const buktiDone = Number(o.bukti_uploaded) === 1;
      if (st === 'DONE') return false;
      // Pelunasan review flow overrides — any pelunasan_status keeps
      // the row here (PENDING for review, APPROVED/REJECTED for
      // history).
      if (ps !== '') return true;
      if (via !== 'CS_SELLING' && fs === '') return false;
      // Menunggu Bukti belum masuk Finance.
      const rincianDone = st !== 'SELLING';
      if (rincianDone && !buktiDone && fs === '') return false;
      return true;
    });
  }, [orders]);

  // Effective review status per row: pelunasan review takes priority
  // when a pelunasan_status is set, otherwise fall back to
  // finance_status (DP Desain / Invoice review flows).
  function reviewStatus(o: Row): string {
    const ps = String(o.pelunasan_status || '').toUpperCase();
    if (ps) return ps;
    return String(o.finance_status || '').toUpperCase();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(o => {
      const rs = reviewStatus(o);
      if (filter === 'PENDING' && !(rs === '' || rs === 'PENDING')) return false;
      if (filter === 'APPROVED' && rs !== 'APPROVED') return false;
      if (filter === 'REJECTED' && rs !== 'REJECTED') return false;
      if (q) {
        const hay =
          `${String(o.no_order || '')} ${String(o.customer_nama || '')} ${String(o.customer_phone || '')}`
            .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a: Row, b: Row) => Number(b.id) - Number(a.id));
  }, [scoped, filter, search]);

  const counts = useMemo(() => {
    return {
      PENDING: scoped.filter(o => {
        const rs = reviewStatus(o);
        return rs === '' || rs === 'PENDING';
      }).length,
      APPROVED: scoped.filter(o => reviewStatus(o) === 'APPROVED').length,
      REJECTED: scoped.filter(o => reviewStatus(o) === 'REJECTED').length,
      ALL: scoped.length,
    };
  }, [scoped]);

  const paymentsByOrder = useMemo(() => {
    const m: Record<number, Row[]> = {};
    for (const p of payments) {
      const oid = Number(p.order_id);
      if (!m[oid]) m[oid] = [];
      m[oid].push(p);
    }
    return m;
  }, [payments]);

  const leadById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const l of leads) m[Number(l.id)] = String(l.nama || '');
    return m;
  }, [leads]);

  function openDetail(o: Row) {
    setDetail(o);
    // Pre-fill notes from the right column depending on which review
    // this order is at right now.
    const isPelunasan = String(o.pelunasan_status || '') !== '';
    setNotes(String(isPelunasan ? (o.pelunasan_notes || '') : (o.finance_notes || '')));
  }
  function closeDetail() {
    setDetail(null);
    setNotes('');
    setSaving(false);
  }

  async function decide(fs: 'APPROVED' | 'REJECTED') {
    if (!detail) return;
    if (fs === 'REJECTED' && !notes.trim()) {
      toast.error('Catatan Wajib', 'Isi catatan alasan penolakan agar CS Selling tahu harus perbaiki apa.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const decidedBy = user?.nama || user?.username || 'finance';
      const isPelunasanReview = String(detail.pelunasan_status || '') !== '';

      if (isPelunasanReview) {
        // Update pelunasan_* columns instead of finance_status.
        await dbUpdate('orders', Number(detail.id), {
          pelunasan_status: fs,
          pelunasan_approved_by: decidedBy,
          pelunasan_approved_at: now,
          pelunasan_notes: notes.trim() || null,
        });

        if (fs === 'APPROVED') {
          // Pelunasan sekarang di stage Shipment (stage terakhir).
          // Approve → WO ditandai SELESAI:
          //   • wo_progress Shipment → SELESAI (started_at + completed_at)
          //   • work_orders.status → SELESAI
          //   • orders.status → DONE
          try {
            const [wos, stagesRaw, wp] = await Promise.all([
              dbGet('work_orders').catch(() => []),
              dbGet('production_stages').catch(() => []),
              dbGet('wo_progress').catch(() => []),
            ]);
            const orderWos = (wos as Row[]).filter(w => Number(w.order_id) === Number(detail.id));
            const sortedStages = (stagesRaw as Row[])
              .filter(s => s.active === undefined || s.active === 1 || s.active === true)
              .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
            const shipment = sortedStages.find(s => String(s.nama) === 'Shipment');
            for (const wo of orderWos) {
              const woId = Number(wo.id);
              if (shipment) {
                const shipmentProgress = (wp as Row[]).find(
                  p => Number(p.work_order_id) === woId && Number(p.stage_id) === Number(shipment.id)
                );
                if (shipmentProgress) {
                  try {
                    await dbUpdate('wo_progress', Number(shipmentProgress.id), {
                      status: 'SELESAI',
                      started_at: shipmentProgress.started_at || now,
                      completed_at: now,
                    });
                  } catch (err) { console.warn('finalize shipment progress failed:', err); }
                } else {
                  try {
                    await dbCreate('wo_progress', {
                      work_order_id: woId,
                      stage_id: shipment.id,
                      status: 'SELESAI',
                      started_at: now,
                      completed_at: now,
                    });
                  } catch (err) { console.warn('create shipment wo_progress failed:', err); }
                }
              }
              try {
                await dbUpdate('work_orders', woId, {
                  status: 'SELESAI',
                  current_stage_id: shipment ? shipment.id : wo.current_stage_id,
                });
              } catch (err) { console.warn('set wo status SELESAI failed:', err); }
            }
            try {
              await dbUpdate('orders', Number(detail.id), { status: 'DONE' });
            } catch (err) { console.warn('set order status DONE failed:', err); }
          } catch (err) {
            console.warn('pelunasan approve: finalize WO failed:', err);
          }
        }

        toast.success(
          fs === 'APPROVED' ? 'Pelunasan Di-approve' : 'Pelunasan Ditolak',
          fs === 'APPROVED'
            ? 'Order otomatis ditandai selesai — Shipment SELESAI.'
            : 'Produksi menerima catatan penolakan. Bukti bisa di-upload ulang.'
        );
      } else {
        // Existing DP / Invoice review flow.
        // Deteksi apakah ini review DP Design awal (dari CS Selling)
        // atau review Invoice (setelah bukti_uploaded=1). Kalau approve
        // DP Design awal → order masuk Antrian Design (design_stage='AWAL').
        // Kalau approve Invoice, jangan sentuh design_stage.
        const buktiSudahUpload = Number(detail.bukti_uploaded) === 1;
        const alreadyInAntrian = !!detail.design_stage;
        const shouldEnterAntrianDesign =
          fs === 'APPROVED' && !buktiSudahUpload && !alreadyInAntrian;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updatePayload: Record<string, any> = {
          finance_status: fs,
          finance_approved_by: decidedBy,
          finance_approved_at: now,
          finance_notes: notes.trim() || null,
        };
        if (shouldEnterAntrianDesign) {
          updatePayload.design_stage = 'AWAL';
          updatePayload.design_awal_at = now;
          updatePayload.design_stage_started_at = now;
        }

        try {
          await dbUpdate('orders', Number(detail.id), updatePayload);
        } catch (err) {
          // Fallback: kolom design_stage mungkin belum ada (migration 039
          // belum jalan). Retry tanpa field antrian.
          console.warn('finance approve with design_stage failed, retrying:', err);
          await dbUpdate('orders', Number(detail.id), {
            finance_status: fs,
            finance_approved_by: decidedBy,
            finance_approved_at: now,
            finance_notes: notes.trim() || null,
          });
        }

        toast.success(
          fs === 'APPROVED' ? 'Order Di-approve' : 'Order Ditolak',
          fs === 'APPROVED'
            ? (shouldEnterAntrianDesign
                ? 'Order masuk Antrian Design. Selesai design → CS Order lanjut.'
                : 'CS Order sudah bisa lanjut proses berikutnya.')
            : 'CS Selling menerima catatan penolakan.'
        );
      }

      closeDetail();
      await fetchAll();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
    setSaving(false);
  }

  if (loading) return (
    <div className="space-y-3">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-14 bg-white/[0.03] rounded-lg animate-pulse" />)}
    </div>
  );

  const tabs: { key: Filter; label: string; count: number; cls: string }[] = [
    { key: 'PENDING', label: 'Menunggu', count: counts.PENDING, cls: 'text-amber-400' },
    { key: 'APPROVED', label: 'Disetujui', count: counts.APPROVED, cls: 'text-emerald-400' },
    { key: 'REJECTED', label: 'Ditolak', count: counts.REJECTED, cls: 'text-rose-400' },
    { key: 'ALL', label: 'Semua', count: counts.ALL, cls: 'text-slate-400' },
  ];

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.14] via-teal-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 border border-emerald-500/25 grid place-items-center shrink-0">
            <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Approval Finance</h1>
            <p className="text-[13px] text-slate-300 mt-0.5 max-w-xl">
              Verifikasi bukti transfer DP Desain dari CS Selling. Approve untuk membuka gate CS Order.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs — pill style */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-2 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map(t => {
            const isActiveTab = filter === t.key;
            return (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all ${
                  isActiveTab
                    ? 'text-white bg-gradient-to-b from-blue-500/25 to-blue-500/10 border border-blue-500/30 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
                }`}>
                {t.label}
                {t.count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full ${
                    isActiveTab ? 'bg-white/20 text-white' : `bg-white/[0.06] ${t.cls}`
                  }`}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search bar — filter di dalam tab aktif. Match No Order,
          customer, dan no HP. Berlaku untuk semua 4 tab. */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-3">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari No Order, nama customer, atau nomor HP..."
            className="w-full bg-transparent text-white placeholder-slate-500 pl-10 pr-10 py-2.5 text-sm focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              title="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 font-semibold uppercase tracking-widest bg-white/[0.015]">
                <th className="text-left px-4 py-3.5">No Order</th>
                <th className="text-left px-4 py-3.5">Customer</th>
                <th className="text-left px-4 py-3.5">Leads</th>
                <th className="text-left px-4 py-3.5">No HP</th>
                <th className="text-right px-4 py-3.5">DP Desain</th>
                <th className="text-center px-4 py-3.5">Bukti TF</th>
                <th className="text-left px-4 py-3.5">Tgl Order</th>
                <th className="text-left px-4 py-3.5">Status</th>
                <th className="text-right px-4 py-3.5">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-transparent border border-emerald-500/20 grid place-items-center">
                      <svg className="w-6 h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-300 font-medium">Tidak ada order di kategori ini</p>
                    <p className="text-xs text-slate-500 max-w-xs">Coba pilih tab lain untuk melihat order dengan status berbeda.</p>
                  </div>
                </td></tr>
              ) : filtered.map((o: Row) => {
                const p = paymentsByOrder[Number(o.id)] || [];
                const dpDesain = p.find((x: Row) => String(x.tipe) === 'dp_desain');
                const dpAmt = Number(dpDesain?.amount || o.dp_desain || 0);
                const hasBukti = !!dpDesain?.bukti_tf;
                const rs = reviewStatus(o);
                const stCls =
                  rs === 'APPROVED' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : rs === 'REJECTED' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                const stLabel =
                  rs === 'APPROVED' ? 'Disetujui'
                  : rs === 'REJECTED' ? 'Ditolak'
                  : 'Menunggu';
                return (
                  <tr key={o.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3.5 text-sm text-blue-300 font-semibold">{o.no_order}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 grid place-items-center text-[11px] font-bold text-emerald-200 shrink-0">
                          {String(o.customer_nama || '?').trim().charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-white font-medium truncate max-w-[220px]" title={o.customer_nama}>{o.customer_nama}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{leadById[Number(o.lead_id)] || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-400 tabular-nums">{o.customer_phone || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 text-right tabular-nums">
                      {dpAmt > 0 ? `Rp ${fmtRp(dpAmt)}` : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {hasBukti ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          Ada
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-400">{fmtDate(o.tanggal_order)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${stCls}`}>{stLabel}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {(() => {
                          // Stage differentiator:
                          //   pelunasan_status set → review pelunasan
                          //     dari Produksi (stage QC Final).
                          //   SELLING → approval pertama: DP Desain
                          //     dari CS Selling.
                          //   bukti_uploaded=1 → approval kedua:
                          //     full invoice + semua bukti DP Produksi
                          //     dari CS Order.
                          const st = String(o.status || '').toUpperCase();
                          const ps = String(o.pelunasan_status || '').toUpperCase();
                          const buktiDone = Number(o.bukti_uploaded) === 1;
                          const isPelunasan = ps !== '';
                          const isCsOrder = !isPelunasan && st !== 'SELLING' && buktiDone;
                          const chipCls = isPelunasan
                            ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                            : isCsOrder
                              ? 'text-blue-300 bg-blue-500/10 border-blue-500/30'
                              : 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30';
                          const chipLabel = isPelunasan
                            ? 'Pelunasan'
                            : isCsOrder ? 'dari CS Order' : 'dari CS Selling';
                          const chipTitle = isPelunasan
                            ? 'Review pelunasan dari Produksi (Shipment) — approve untuk mark order selesai'
                            : isCsOrder
                              ? 'Approval invoice lengkap — Finance review Rincian Order + semua bukti DP Produksi'
                              : 'Approval pertama — Finance verifikasi DP Desain dari CS Selling';
                          return (
                            <span title={chipTitle}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${chipCls}`}>
                              {chipLabel}
                            </span>
                          );
                        })()}
                        <button onClick={() => openDetail(o)}
                          className="text-xs font-medium text-blue-400 border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors">
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (() => {
        const p = paymentsByOrder[Number(detail.id)] || [];
        const dpDesain = p.find((x: Row) => String(x.tipe) === 'dp_desain');
        const dpProduksi = p
          .filter((x: Row) => String(x.tipe) === 'dp_produksi')
          .sort((a: Row, b: Row) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
        const dpAmt = Number(dpDesain?.amount || detail.dp_desain || 0);
        const ps = String(detail.pelunasan_status || '').toUpperCase();
        const isPelunasanReview = ps !== '';
        const fs = isPelunasanReview ? ps : String(detail.finance_status || '').toUpperCase();
        const isPending = fs === '' || fs === 'PENDING';
        const isDone = fs === 'APPROVED' || fs === 'REJECTED';
        // Stage-aware detail: post-Bukti orders show a full Rincian
        // Order block (items + ekspedisi + all DP schedule) so Finance
        // can approve the whole invoice, not just the initial DP.
        const st = String(detail.status || '').toUpperCase();
        const buktiDone = Number(detail.bukti_uploaded) === 1;
        const isInvoiceStage = !isPelunasanReview && st !== 'SELLING' && buktiDone;
        const decidedBy = isPelunasanReview
          ? String(detail.pelunasan_approved_by || 'finance')
          : String(detail.finance_approved_by || 'finance');
        const decidedAt = isPelunasanReview
          ? detail.pelunasan_approved_at
          : detail.finance_approved_at;
        const detailItems = items
          .filter((it: Row) => Number(it.order_id) === Number(detail.id))
          .sort((a: Row, b: Row) => Number(a.id) - Number(b.id));
        const totalItems = detailItems.reduce(
          (s, it) => s + (Number(it.qty) || 0) * (Number(it.harga) || 0),
          0
        );
        const grandTotal = totalItems + (Number(detail.ekspedisi_biaya) || 0);
        const diskonPct = Number(detail.diskon_pct) || 0;
        const diskonAmount = Math.round((grandTotal * diskonPct) / 100);
        // DP Design + DP Produksi ambil dari order_payments (yg baru
        // di-write oleh Rincian Order Save).
        const dpDesainFromPay = p.find((x: Row) => String(x.tipe) === 'dp_desain');
        const dpProduksiFromPay = p.find((x: Row) => String(x.tipe) === 'dp_produksi');
        const dpDesainAmt = Number(dpDesainFromPay?.amount) || Number(detail.dp_desain) || 0;
        const dpProduksiAmt = Number(dpProduksiFromPay?.amount) || Number(detail.dp_produksi) || 0;
        const sisaTagihanRow = grandTotal - diskonAmount - dpDesainAmt - dpProduksiAmt;
        return (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={closeDetail} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className={`w-full ${isInvoiceStage ? 'max-w-4xl' : 'max-w-2xl'} bg-[#111827] border border-white/[0.06] rounded-xl shadow-2xl shadow-black/50 flex flex-col max-h-[92vh]`}>
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-start justify-between shrink-0">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {isPelunasanReview
                        ? 'Review Pelunasan'
                        : isInvoiceStage ? 'Review Invoice' : 'Review DP Desain'} — {detail.no_order}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {detail.customer_nama} · {detail.customer_phone || '-'}
                    </p>
                  </div>
                  <button onClick={closeDetail} className="text-slate-500 hover:text-white p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="px-6 py-4 space-y-4 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <InfoRow label="Nama Customer" value={String(detail.customer_nama || '-')} />
                    <InfoRow label="No HP" value={String(detail.customer_phone || '-')} />
                    <InfoRow label="Leads" value={leadById[Number(detail.lead_id)] || '-'} />
                    <InfoRow label="Tgl Order" value={fmtDate(detail.tanggal_order)} />
                    <InfoRow label="Alamat" value={String(detail.customer_alamat || '-')} full />
                    {detail.keterangan && (
                      <InfoRow label="Keterangan" value={String(detail.keterangan)} full />
                    )}
                  </div>

                  {isPelunasanReview && (() => {
                    const buktiRef = String(detail.pelunasan_bukti_tf || '');
                    const buktiName = String(detail.pelunasan_bukti_tf_name || '');
                    const isImage = buktiRef && (
                      buktiRef.startsWith('data:image')
                      || /\.(png|jpe?g|gif|webp)$/i.test(buktiName)
                      || /\.(png|jpe?g|gif|webp)$/i.test(buktiRef)
                    );
                    const isPdf = buktiRef && (
                      buktiRef.startsWith('data:application/pdf')
                      || /\.pdf$/i.test(buktiName)
                      || /\.pdf$/i.test(buktiRef)
                    );
                    return (
                      <div>
                        <div className="text-xs text-slate-500 mb-1.5">Bukti Pelunasan (dari Produksi)</div>
                        <div className="border border-white/10 rounded-lg p-3 bg-[#0d1117] space-y-2">
                          <div className="text-[11px] text-slate-500">
                            Approve untuk menandai pelunasan lunas. Order otomatis dinyatakan <strong className="text-white">SELESAI</strong>.
                          </div>
                          {!buktiRef ? (
                            <div className="text-xs text-slate-500 italic border border-dashed border-white/10 rounded px-2 py-4 text-center">
                              Belum ada bukti pelunasan yang di-upload.
                            </div>
                          ) : isImage ? (
                            <button type="button" onClick={() => setZoomedImg(buktiRef)}
                              className="block mx-auto group relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={buktiRef} alt="Bukti Pelunasan"
                                className="max-h-72 rounded border border-white/10 cursor-zoom-in" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="bg-white/90 text-slate-800 text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
                                  Klik untuk perbesar
                                </span>
                              </div>
                            </button>
                          ) : isPdf ? (
                            <object data={buktiRef} type="application/pdf" className="w-full h-96 border border-white/10 rounded">
                              <div className="p-4 text-xs text-slate-400">
                                Browser tidak bisa menampilkan PDF inline.
                                <a href={buktiRef} target="_blank" rel="noopener noreferrer"
                                  className="ml-1 text-blue-400 hover:text-blue-300 underline">Buka di tab baru</a>.
                              </div>
                            </object>
                          ) : (
                            <a href={buktiRef} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300 underline">
                              Buka file bukti pelunasan ({buktiName || 'bukti'})
                            </a>
                          )}
                          {buktiRef && (
                            <div className="flex items-center justify-center gap-3 text-[11px]">
                              <a href={buktiRef} download={buktiName || 'bukti-pelunasan'}
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Download</a>
                              <span className="text-slate-700">·</span>
                              <a href={buktiRef} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Buka di tab baru</a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {isInvoiceStage && (
                    <>
                      <div>
                        <div className="text-xs text-slate-500 mb-1.5">Rincian Order</div>
                        <div className="border border-white/10 rounded-lg overflow-hidden bg-[#0d1117]">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-white/10 text-slate-500 uppercase tracking-wider text-[10px]">
                                <th className="text-left px-3 py-2">Nama Barang</th>
                                <th className="text-right px-3 py-2 w-16">Qty</th>
                                <th className="text-right px-3 py-2 w-32">Harga</th>
                                <th className="text-right px-3 py-2 w-32">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailItems.length === 0 ? (
                                <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">Belum ada item.</td></tr>
                              ) : detailItems.map((it: Row) => {
                                const qty = Number(it.qty) || 0;
                                const harga = Number(it.harga) || 0;
                                return (
                                  <tr key={it.id} className="border-b border-white/[0.04]">
                                    <td className="px-3 py-2 text-slate-200">{it.paket_nama || '-'}</td>
                                    <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{qty}</td>
                                    <td className="px-3 py-2 text-right text-slate-300 tabular-nums">Rp {fmtRp(harga)}</td>
                                    <td className="px-3 py-2 text-right text-slate-100 font-medium tabular-nums">Rp {fmtRp(qty * harga)}</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-white/[0.03]">
                                <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-300">TOTAL PEMBELIAN</td>
                                <td className="px-3 py-2 text-right font-bold text-white tabular-nums">Rp {fmtRp(totalItems)}</td>
                              </tr>
                              {(detail.ekspedisi_nama || Number(detail.ekspedisi_biaya)) && (
                                <tr>
                                  <td className="px-3 py-2 text-slate-300">
                                    Ekspedisi: {detail.ekspedisi_nama || '-'}
                                    {detail.ekspedisi_kg ? ` · ${detail.ekspedisi_kg} kg` : ''}
                                  </td>
                                  <td colSpan={2} className="px-3 py-2 text-right text-slate-300 tabular-nums" />
                                  <td className="px-3 py-2 text-right text-slate-100 tabular-nums">Rp {fmtRp(Number(detail.ekspedisi_biaya) || 0)}</td>
                                </tr>
                              )}
                              <tr className="bg-white/[0.05] border-t border-white/[0.08]">
                                <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-200">GRAND TOTAL</td>
                                <td className="px-3 py-2 text-right font-bold text-white tabular-nums">Rp {fmtRp(grandTotal)}</td>
                              </tr>
                              {diskonPct > 0 && (
                                <tr>
                                  <td colSpan={3} className="px-3 py-2 text-right text-slate-300">Diskon ({diskonPct}%)</td>
                                  <td className="px-3 py-2 text-right text-slate-100 tabular-nums">− Rp {fmtRp(diskonAmount)}</td>
                                </tr>
                              )}
                              {dpDesainAmt > 0 && (
                                <tr>
                                  <td colSpan={3} className="px-3 py-2 text-right text-slate-300">DP Design (dari CS Selling)</td>
                                  <td className="px-3 py-2 text-right text-slate-100 tabular-nums">− Rp {fmtRp(dpDesainAmt)}</td>
                                </tr>
                              )}
                              {dpProduksiAmt > 0 && (
                                <tr>
                                  <td colSpan={3} className="px-3 py-2 text-right text-slate-300">DP Produksi</td>
                                  <td className="px-3 py-2 text-right text-blue-300 tabular-nums font-medium">− Rp {fmtRp(dpProduksiAmt)}</td>
                                </tr>
                              )}
                              <tr className="bg-white/[0.05] border-t border-white/[0.08]">
                                <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-200">SISA TAGIHAN</td>
                                <td className="px-3 py-2 text-right font-bold text-white tabular-nums">Rp {fmtRp(sisaTagihanRow)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {detail.keterangan && (
                        <div>
                          <div className="text-xs text-slate-500 mb-1.5">NB / Catatan</div>
                          <div className="border border-white/10 rounded-lg px-3 py-2 bg-[#0d1117] text-xs text-slate-300 whitespace-pre-wrap">
                            {String(detail.keterangan)}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {!isPelunasanReview && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1.5">DP Desain</div>
                    <div className="border border-white/10 rounded-lg p-3 bg-[#0d1117]">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-lg font-bold text-white tabular-nums">Rp {fmtRp(dpAmt)}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {dpDesain?.bank_name || '-'} · {dpDesain?.method || '-'}
                            {dpDesain?.method_other && ` (${dpDesain.method_other})`}
                          </div>
                        </div>
                      </div>
                      {dpDesain?.bukti_tf ? (() => {
                        const buktiRef = String(dpDesain.bukti_tf);
                        const buktiName = String(dpDesain.bukti_tf_name || '');
                        const isImage =
                          buktiRef.startsWith('data:image')
                          || /\.(png|jpe?g|gif|webp)$/i.test(buktiName)
                          || /\.(png|jpe?g|gif|webp)$/i.test(buktiRef);
                        const isPdf =
                          buktiRef.startsWith('data:application/pdf')
                          || /\.pdf$/i.test(buktiName)
                          || /\.pdf$/i.test(buktiRef);
                        return isImage ? (
                          <div className="mt-3 space-y-2">
                            <div className="text-[11px] text-slate-500">
                              Bukti TF ({buktiName || 'image'}) — klik untuk perbesar
                            </div>
                            <button type="button" onClick={() => setZoomedImg(buktiRef)}
                              className="block mx-auto group relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={buktiRef} alt="Bukti TF"
                                className="max-h-72 rounded border border-white/10 cursor-zoom-in" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="bg-white/90 text-slate-800 text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
                                  Klik untuk perbesar
                                </span>
                              </div>
                            </button>
                            <div className="flex items-center justify-center gap-3 text-[11px]">
                              <a href={buktiRef} download={buktiName || 'bukti-tf.png'}
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                Download gambar
                              </a>
                              <span className="text-slate-700">·</span>
                              <a href={buktiRef} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                Buka di tab baru
                              </a>
                            </div>
                          </div>
                        ) : isPdf ? (
                          <div className="mt-3 space-y-2">
                            <div className="text-[11px] text-slate-500">
                              Bukti TF (PDF — {buktiName || 'file'})
                            </div>
                            <object data={buktiRef} type="application/pdf"
                              className="w-full h-96 border border-white/10 rounded">
                              <div className="p-4 text-xs text-slate-400">
                                Browser tidak bisa menampilkan PDF inline.
                                <a href={buktiRef} target="_blank" rel="noopener noreferrer"
                                  className="ml-1 text-blue-400 hover:text-blue-300 underline">Buka di tab baru</a>.
                              </div>
                            </object>
                            <div className="flex items-center justify-center gap-3 text-[11px]">
                              <a href={buktiRef} download={buktiName || 'bukti-tf.pdf'}
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                Download PDF
                              </a>
                              <span className="text-slate-700">·</span>
                              <a href={buktiRef} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                Buka di tab baru
                              </a>
                            </div>
                          </div>
                        ) : (
                          <a href={buktiRef} target="_blank" rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 underline">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            Buka file bukti transfer ({buktiName || 'file'})
                          </a>
                        );
                      })() : (
                        <div className="mt-3 border border-dashed border-white/10 rounded-lg p-4 text-center">
                          <svg className="w-8 h-8 text-slate-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                          <p className="text-xs text-slate-500 italic">Belum ada bukti TF yang diupload.</p>
                          <p className="text-[10px] text-slate-600 mt-1">
                            Kemungkinan migration 021 belum jalan atau CS Selling belum upload.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {isInvoiceStage && dpProduksi.length > 0 && (
                    <div>
                      <div className="text-xs text-slate-500 mb-1.5">DP Produksi ({dpProduksi.length} pembayaran)</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {dpProduksi.map((dp: Row, idx: number) => {
                          const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][idx + 1] || String(idx + 2);
                          const amt = Number(dp.amount) || (Number(dp.tunai) || 0) + (Number(dp.trf) || 0);
                          const ref = dp.bukti_tf ? String(dp.bukti_tf) : '';
                          const name = String(dp.bukti_tf_name || '');
                          const isImg = ref && (
                            ref.startsWith('data:image')
                            || /\.(png|jpe?g|gif|webp)$/i.test(name)
                            || /\.(png|jpe?g|gif|webp)$/i.test(ref)
                          );
                          const isPdf = ref && (
                            ref.startsWith('data:application/pdf')
                            || /\.pdf$/i.test(name)
                            || /\.pdf$/i.test(ref)
                          );
                          return (
                            <div key={dp.id} className="border border-white/10 rounded-lg p-3 bg-[#0d1117] space-y-2">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="text-sm font-semibold text-white">DP Produksi #{roman}</div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {dp.tanggal ? fmtDate(dp.tanggal) : 'Tanggal -'}
                                  </div>
                                </div>
                                <div className="text-sm font-bold text-white tabular-nums text-right">
                                  Rp {fmtRp(amt)}
                                </div>
                              </div>
                              {ref ? (
                                isImg ? (
                                  <button type="button" onClick={() => setZoomedImg(ref)}
                                    className="block w-full group relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={ref} alt="Bukti TF" className="w-full max-h-48 object-contain rounded border border-white/10 cursor-zoom-in" />
                                  </button>
                                ) : isPdf ? (
                                  <a href={ref} target="_blank" rel="noopener noreferrer"
                                    className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2 inline-flex items-center gap-1">
                                    Buka PDF ({name || 'bukti.pdf'})
                                  </a>
                                ) : (
                                  <a href={ref} target="_blank" rel="noopener noreferrer"
                                    className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                    Buka file bukti ({name || 'bukti'})
                                  </a>
                                )
                              ) : (
                                <div className="text-[11px] text-slate-500 italic border border-dashed border-white/10 rounded px-2 py-2 text-center">
                                  Belum ada bukti TF.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {detail.bukti_notes && (
                    <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/25 p-3 flex items-start gap-2.5">
                      <svg className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-amber-200 uppercase tracking-widest">Order Tanpa DP · Keterangan CS Order</p>
                        <p className="text-sm text-slate-200 leading-relaxed mt-1 whitespace-pre-wrap break-words">{String(detail.bukti_notes)}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">
                      Catatan Finance {isPending && <span className="text-slate-500 font-normal text-[11px]">(wajib jika menolak)</span>}
                    </label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Contoh: bukti TF blur, atau nominal tidak sesuai."
                      className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm" />
                  </div>

                  {isDone && (
                    <div className="text-[11px] text-slate-500 border border-white/10 rounded-lg px-3 py-2 bg-white/[0.02]">
                      {fs === 'APPROVED' ? 'Disetujui' : 'Ditolak'} oleh <strong className="text-slate-300">{decidedBy}</strong> pada {fmtDateTime(decidedAt)}
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between gap-2 shrink-0 flex-wrap">
                  <div className="text-[11px] text-slate-500">
                    {isDone && (
                      <>Status saat ini: <strong className={fs === 'APPROVED' ? 'text-emerald-300' : 'text-rose-300'}>
                        {fs === 'APPROVED' ? 'Disetujui' : 'Ditolak'}
                      </strong> — bisa diubah di bawah.</>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={closeDetail} disabled={saving}
                      className="text-sm font-medium text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                      Tutup
                    </button>
                    <button
                      onClick={() => decide('REJECTED')}
                      disabled={saving || fs === 'REJECTED'}
                      title={fs === 'REJECTED' ? 'Status sudah Ditolak' : undefined}
                      className="text-sm font-medium text-rose-300 border border-rose-500/30 hover:bg-rose-500/10 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {fs === 'REJECTED' ? '✓ Sudah Ditolak' : 'Tolak'}
                    </button>
                    <button
                      onClick={() => decide('APPROVED')}
                      disabled={saving || fs === 'APPROVED'}
                      title={fs === 'APPROVED' ? 'Status sudah Disetujui' : undefined}
                      className="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-emerald-800"
                    >
                      {saving ? 'Menyimpan...' : fs === 'APPROVED' ? '✓ Sudah Disetujui' : fs === 'REJECTED' ? 'Ubah ke Approve' : 'Approve'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {zoomedImg && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImg(null)}>
          <button onClick={() => setZoomedImg(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomedImg} alt="Bukti TF (perbesar)"
            className="max-w-full max-h-full object-contain rounded"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-200 font-medium mt-0.5">{value}</div>
    </div>
  );
}
