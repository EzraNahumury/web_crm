'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type Filter = 'PENDING' | 'APPROVED' | 'GUDANG_REJECTED' | 'ALL';

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2}):?(\d{2})?/);
  if (!m) return String(v);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5] || '00'}`;
}

export default function ApprovalGudangPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [loading, setLoading] = useState(true);
  const [rejects, setRejects] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [wos, setWos] = useState<Row[]>([]);
  const [stages, setStages] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [gudangNotes, setGudangNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, i, w, s] = await Promise.all([
        dbGet('stage_rejects').catch(() => []),
        dbGet('stage_reject_items').catch(() => []),
        dbGet('work_orders').catch(() => []),
        dbGet('production_stages').catch(() => []),
      ]);
      setRejects(r);
      setItems(i);
      setWos(w);
      setStages(s);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Only WITH_BAHAN rejects go through gudang. WITHOUT_BAHAN handles
  // rework in produksi and never touches this page.
  const filtered = useMemo(() => {
    const gudangRelevant = rejects.filter((r: Row) => String(r.tipe) === 'WITH_BAHAN');
    if (filter === 'ALL') return gudangRelevant;
    return gudangRelevant.filter((r: Row) => String(r.status).toUpperCase() === filter);
  }, [rejects, filter]);

  const counts = useMemo(() => {
    const withBahan = rejects.filter((r: Row) => String(r.tipe) === 'WITH_BAHAN');
    return {
      PENDING: withBahan.filter(r => String(r.status).toUpperCase() === 'PENDING').length,
      APPROVED: withBahan.filter(r => String(r.status).toUpperCase() === 'APPROVED').length,
      GUDANG_REJECTED: withBahan.filter(r => String(r.status).toUpperCase() === 'GUDANG_REJECTED').length,
      ALL: withBahan.length,
    };
  }, [rejects]);

  const detailItems = useMemo(() => {
    if (!detail) return [];
    return items
      .filter((it: Row) => Number(it.reject_id) === Number(detail.id))
      .sort((a: Row, b: Row) => (a.urutan || 0) - (b.urutan || 0));
  }, [items, detail]);

  function openDetail(r: Row) {
    setDetail(r);
    setGudangNotes(String(r.gudang_notes || ''));
  }
  function closeDetail() {
    setDetail(null);
    setGudangNotes('');
    setSaving(false);
  }

  async function decide(status: 'APPROVED' | 'GUDANG_REJECTED') {
    if (!detail) return;
    if (status === 'GUDANG_REJECTED' && !gudangNotes.trim()) {
      toast.error('Catatan Wajib', 'Isi catatan alasan penolakan permintaan bahan.');
      return;
    }
    setSaving(true);
    try {
      await dbUpdate('stage_rejects', Number(detail.id), {
        status,
        gudang_approved_by: user?.nama || user?.username || 'gudang',
        gudang_approved_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        gudang_notes: gudangNotes.trim() || null,
      });
      toast.success(
        status === 'APPROVED' ? 'Permintaan Di-approve' : 'Permintaan Ditolak',
        status === 'APPROVED'
          ? 'Produksi bisa melanjutkan setelah bahan disiapkan.'
          : 'Produksi menerima catatan penolakan.'
      );
      closeDetail();
      await fetchAll();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  const woById = (id: number) => wos.find((w: Row) => Number(w.id) === Number(id));
  const stageById = (id: number) => stages.find((s: Row) => Number(s.id) === Number(id));

  if (loading) return (
    <div className="space-y-3">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-14 bg-white/[0.03] rounded-lg animate-pulse" />)}
    </div>
  );

  const tabs: { key: Filter; label: string; count: number; cls: string }[] = [
    { key: 'PENDING', label: 'Menunggu', count: counts.PENDING, cls: 'text-amber-400' },
    { key: 'APPROVED', label: 'Disetujui', count: counts.APPROVED, cls: 'text-emerald-400' },
    { key: 'GUDANG_REJECTED', label: 'Ditolak', count: counts.GUDANG_REJECTED, cls: 'text-rose-400' },
    { key: 'ALL', label: 'Semua', count: counts.ALL, cls: 'text-slate-400' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Approval Gudang</h1>
        <p className="text-sm text-slate-500 mt-1">
          Permintaan bahan dari produksi (Reject dengan penambahan bahan). Approve untuk membuka gate produksi.
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
                <th className="text-left px-5 py-3.5">No WO</th>
                <th className="text-left px-5 py-3.5">Customer</th>
                <th className="text-left px-5 py-3.5">Tahap</th>
                <th className="text-left px-5 py-3.5">Tgl Reject</th>
                <th className="text-left px-5 py-3.5">Keterangan</th>
                <th className="text-left px-5 py-3.5">Status</th>
                <th className="text-right px-5 py-3.5">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">Tidak ada permintaan di kategori ini.</td></tr>
              ) : (
                filtered.map((r: Row) => {
                  const wo = woById(r.work_order_id);
                  const stage = stageById(r.stage_id);
                  const st = String(r.status).toUpperCase();
                  const stCls =
                    st === 'PENDING' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : st === 'APPROVED' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : st === 'GUDANG_REJECTED' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : st === 'CANCELLED' ? 'text-slate-500 bg-slate-500/10 border-slate-500/20'
                    : 'text-slate-400 bg-slate-500/10 border-slate-500/20';
                  const stLabel =
                    st === 'PENDING' ? 'Menunggu'
                    : st === 'APPROVED' ? 'Disetujui'
                    : st === 'GUDANG_REJECTED' ? 'Ditolak'
                    : st === 'CANCELLED' ? 'Dibatalkan'
                    : st;
                  return (
                    <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-5 py-4 text-sm font-medium text-blue-400">{wo?.no_wo || `WO#${r.work_order_id}`}</td>
                      <td className="px-5 py-4 text-sm text-white">{wo?.customer_nama || '-'}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{stage?.nama || '-'}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(r.created_at)}</td>
                      <td className="px-5 py-4 text-sm text-slate-400 max-w-md truncate" title={String(r.keterangan || '')}>{r.keterangan || '-'}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${stCls}`}>{stLabel}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => openDetail(r)}
                          className="text-xs font-medium text-blue-400 border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors">
                          Lihat Detail
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (() => {
        const wo = woById(detail.work_order_id);
        const stage = stageById(detail.stage_id);
        const st = String(detail.status).toUpperCase();
        const isPending = st === 'PENDING';
        const isDone = st === 'APPROVED' || st === 'GUDANG_REJECTED';
        return (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={closeDetail} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-4xl bg-[#111827] border border-white/[0.06] rounded-xl shadow-2xl shadow-black/50 flex flex-col max-h-[92vh]">
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-start justify-between shrink-0">
                  <div>
                    <h3 className="text-base font-semibold text-white">Form Permintaan Gudang</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      WO {wo?.no_wo || `#${detail.work_order_id}`} · {wo?.customer_nama || '-'} · Tahap {stage?.nama || '-'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Dibuat {fmtDate(detail.created_at)}</p>
                  </div>
                  <button onClick={closeDetail} className="text-slate-500 hover:text-white p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="px-6 py-4 space-y-4 overflow-y-auto">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Keterangan Reject</label>
                    <div className="text-sm text-slate-200 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {detail.keterangan || '-'}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-white">Rincian Bahan</label>
                      <span className="text-[11px] text-slate-500">CUST = <span className="text-slate-300">{wo?.customer_nama || '-'}</span></span>
                    </div>
                    <div className="border border-white/10 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto max-h-[48vh] overflow-y-auto">
                        <table className="w-full min-w-[640px] text-xs">
                          <thead className="sticky top-0 bg-[#0d1117] z-10">
                            <tr className="border-b border-white/10">
                              <th className="w-10 px-2 py-2 text-slate-400 font-medium text-center">NO</th>
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">ITEM</th>
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">BAHAN</th>
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">WARNA</th>
                              <th className="text-left px-3 py-2 text-slate-400 font-medium">KUANTITAS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailItems.length === 0 ? (
                              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Belum ada rincian bahan.</td></tr>
                            ) : detailItems.map((r: Row, i: number) => (
                              <tr key={r.id} className="border-b border-white/[0.04]">
                                <td className="text-center text-slate-500 tabular-nums px-2 py-1.5">{i + 1}</td>
                                <td className="px-3 py-1.5 text-slate-200 font-medium">{r.item}</td>
                                <td className="px-3 py-1.5 text-slate-300">{r.bahan || '-'}</td>
                                <td className="px-3 py-1.5 text-slate-300">{r.warna || '-'}</td>
                                <td className="px-3 py-1.5 text-slate-300">{r.kuantitas || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">
                      Catatan Gudang {isPending && <span className="text-slate-500 font-normal text-[11px]">(wajib jika menolak)</span>}
                    </label>
                    <textarea value={gudangNotes} onChange={e => setGudangNotes(e.target.value)}
                      rows={3} disabled={isDone}
                      placeholder="Contoh: stok Dryfit merah masih 1 meter, kurang 1 meter → butuh order beli."
                      className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm disabled:opacity-70 disabled:cursor-not-allowed" />
                  </div>

                  {isDone && (
                    <div className="text-[11px] text-slate-500 border border-white/10 rounded-lg px-3 py-2 bg-white/[0.02]">
                      {st === 'APPROVED' ? 'Disetujui' : 'Ditolak'} oleh <strong className="text-slate-300">{detail.gudang_approved_by || 'gudang'}</strong> pada {fmtDate(detail.gudang_approved_at)}
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
                      <button onClick={() => decide('GUDANG_REJECTED')} disabled={saving}
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
    </div>
  );
}
