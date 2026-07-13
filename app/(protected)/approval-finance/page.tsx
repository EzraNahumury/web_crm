'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
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
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // Full-screen image preview when Finance clicks the bukti TF thumbnail.
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, l] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('order_payments').catch(() => []),
        dbGet('leads').catch(() => []),
      ]);
      setOrders(o);
      setPayments(p);
      setLeads(l);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Only orders sourced from CS Selling flow through Finance. A row
  // qualifies once its status is 'SELLING'. Finance decisions leave
  // status untouched but stamp finance_status APPROVED / REJECTED.
  const scoped = useMemo(() => {
    return orders.filter(o => {
      const st = String(o.status || '').toUpperCase();
      const via = String(o.created_via || '').toUpperCase();
      return st === 'SELLING' || (via === 'CS_SELLING' && st !== 'DONE');
    });
  }, [orders]);

  const filtered = useMemo(() => {
    return scoped.filter(o => {
      const fs = String(o.finance_status || '').toUpperCase();
      if (filter === 'PENDING') return fs === '' || fs === 'PENDING';
      if (filter === 'APPROVED') return fs === 'APPROVED';
      if (filter === 'REJECTED') return fs === 'REJECTED';
      return true;
    }).sort((a: Row, b: Row) => Number(b.id) - Number(a.id));
  }, [scoped, filter]);

  const counts = useMemo(() => {
    return {
      PENDING: scoped.filter(o => {
        const fs = String(o.finance_status || '').toUpperCase();
        return fs === '' || fs === 'PENDING';
      }).length,
      APPROVED: scoped.filter(o => String(o.finance_status || '').toUpperCase() === 'APPROVED').length,
      REJECTED: scoped.filter(o => String(o.finance_status || '').toUpperCase() === 'REJECTED').length,
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
    setNotes(String(o.finance_notes || ''));
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
      await dbUpdate('orders', Number(detail.id), {
        finance_status: fs,
        finance_approved_by: user?.nama || user?.username || 'finance',
        finance_approved_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        finance_notes: notes.trim() || null,
      });
      toast.success(
        fs === 'APPROVED' ? 'Order Di-approve' : 'Order Ditolak',
        fs === 'APPROVED'
          ? 'CS Order sudah bisa lanjut isi Pembayaran AYRES.'
          : 'CS Selling menerima catatan penolakan.'
      );
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Approval Finance</h1>
        <p className="text-sm text-slate-500 mt-1">
          Verifikasi bukti transfer DP Desain dari CS Selling. Approve untuk membuka gate CS Order.
        </p>
      </div>

      <div className="border-b border-white/[0.06] -mx-6 px-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                filter === t.key ? 'text-white border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}>
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-bold rounded-full bg-white/[0.06] ${t.cls}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                <th className="text-left px-4 py-3">No Order</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Leads</th>
                <th className="text-left px-4 py-3">No HP</th>
                <th className="text-right px-4 py-3">DP Desain</th>
                <th className="text-center px-4 py-3">Bukti TF</th>
                <th className="text-left px-4 py-3">Tgl Order</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">Tidak ada order di kategori ini.</td></tr>
              ) : filtered.map((o: Row) => {
                const p = paymentsByOrder[Number(o.id)] || [];
                const dpDesain = p.find((x: Row) => String(x.tipe) === 'dp_desain');
                const dpAmt = Number(dpDesain?.amount || o.dp_desain || 0);
                const hasBukti = !!dpDesain?.bukti_tf;
                const fs = String(o.finance_status || '').toUpperCase();
                const stCls =
                  fs === 'APPROVED' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : fs === 'REJECTED' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                const stLabel =
                  fs === 'APPROVED' ? 'Disetujui'
                  : fs === 'REJECTED' ? 'Ditolak'
                  : 'Menunggu';
                return (
                  <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3.5 text-sm text-blue-400 font-medium">{o.no_order}</td>
                    <td className="px-4 py-3.5 text-sm text-white font-medium">{o.customer_nama}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{leadById[Number(o.lead_id)] || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-400">{o.customer_phone || '-'}</td>
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
                      <button onClick={() => openDetail(o)}
                        className="text-xs font-medium text-blue-400 border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors">
                        Review
                      </button>
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
        const dpAmt = Number(dpDesain?.amount || detail.dp_desain || 0);
        const fs = String(detail.finance_status || '').toUpperCase();
        const isPending = fs === '' || fs === 'PENDING';
        const isDone = fs === 'APPROVED' || fs === 'REJECTED';
        return (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={closeDetail} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl bg-[#111827] border border-white/[0.06] rounded-xl shadow-2xl shadow-black/50 flex flex-col max-h-[92vh]">
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-start justify-between shrink-0">
                  <div>
                    <h3 className="text-base font-semibold text-white">Review Order {detail.no_order}</h3>
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
                  </div>

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
                      {dpDesain?.bukti_tf ? (
                        String(dpDesain.bukti_tf).startsWith('data:image') ? (
                          <div className="mt-3 space-y-2">
                            <div className="text-[11px] text-slate-500">
                              Bukti TF ({dpDesain.bukti_tf_name || 'image'}) — klik untuk perbesar
                            </div>
                            <button type="button" onClick={() => setZoomedImg(String(dpDesain.bukti_tf))}
                              className="block mx-auto group relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={dpDesain.bukti_tf} alt="Bukti TF"
                                className="max-h-72 rounded border border-white/10 cursor-zoom-in" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="bg-white/90 text-slate-800 text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
                                  Klik untuk perbesar
                                </span>
                              </div>
                            </button>
                            <div className="flex items-center justify-center gap-3 text-[11px]">
                              <a href={dpDesain.bukti_tf} download={dpDesain.bukti_tf_name || 'bukti-tf.png'}
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                Download gambar
                              </a>
                              <span className="text-slate-700">·</span>
                              <a href={dpDesain.bukti_tf} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                Buka di tab baru
                              </a>
                            </div>
                          </div>
                        ) : String(dpDesain.bukti_tf).startsWith('data:application/pdf') ? (
                          <div className="mt-3 space-y-2">
                            <div className="text-[11px] text-slate-500">
                              Bukti TF (PDF — {dpDesain.bukti_tf_name || 'file'})
                            </div>
                            <object data={dpDesain.bukti_tf} type="application/pdf"
                              className="w-full h-96 border border-white/10 rounded">
                              <div className="p-4 text-xs text-slate-400">
                                Browser tidak bisa menampilkan PDF inline.
                                <a href={dpDesain.bukti_tf} target="_blank" rel="noopener noreferrer"
                                  className="ml-1 text-blue-400 hover:text-blue-300 underline">Buka di tab baru</a>.
                              </div>
                            </object>
                            <div className="flex items-center justify-center gap-3 text-[11px]">
                              <a href={dpDesain.bukti_tf} download={dpDesain.bukti_tf_name || 'bukti-tf.pdf'}
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                Download PDF
                              </a>
                              <span className="text-slate-700">·</span>
                              <a href={dpDesain.bukti_tf} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                Buka di tab baru
                              </a>
                            </div>
                          </div>
                        ) : (
                          <a href={dpDesain.bukti_tf} target="_blank" rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 underline">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            Buka file bukti transfer ({dpDesain.bukti_tf_name || 'file'})
                          </a>
                        )
                      ) : (
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

                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">
                      Catatan Finance {isPending && <span className="text-slate-500 font-normal text-[11px]">(wajib jika menolak)</span>}
                    </label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      rows={3} disabled={isDone}
                      placeholder="Contoh: bukti TF blur, atau nominal tidak sesuai."
                      className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed" />
                  </div>

                  {isDone && (
                    <div className="text-[11px] text-slate-500 border border-white/10 rounded-lg px-3 py-2 bg-white/[0.02]">
                      {fs === 'APPROVED' ? 'Disetujui' : 'Ditolak'} oleh <strong className="text-slate-300">{detail.finance_approved_by || 'finance'}</strong> pada {fmtDateTime(detail.finance_approved_at)}
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2 shrink-0">
                  <button onClick={closeDetail} disabled={saving}
                    className="text-sm font-medium text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                    Tutup
                  </button>
                  {isPending && (
                    <>
                      <button onClick={() => decide('REJECTED')} disabled={saving}
                        className="text-sm font-medium text-rose-300 border border-rose-500/30 hover:bg-rose-500/10 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                        Tolak
                      </button>
                      <button onClick={() => decide('APPROVED')} disabled={saving}
                        className="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                        {saving ? 'Menyimpan...' : 'Approve'}
                      </button>
                    </>
                  )}
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
