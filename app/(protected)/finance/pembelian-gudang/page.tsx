'use client';
import { useEffect, useMemo, useState } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { Pagination, paginate } from '@/lib/pagination';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

function fmtRp(n: number) {
  if (!n) return '0';
  return new Intl.NumberFormat('id-ID').format(n);
}
function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '-';
  const s = d instanceof Date ? d.toISOString() : String(d);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return s; }
}
function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '-';
  try { return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return String(d); }
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',      cls: 'text-slate-300 bg-slate-500/10 border-slate-500/25' },
  SUBMITTED: { label: 'Menunggu',   cls: 'text-blue-300 bg-blue-500/10 border-blue-500/25' },
  APPROVED:  { label: 'Disetujui',  cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  REJECTED:  { label: 'Ditolak',    cls: 'text-rose-300 bg-rose-500/10 border-rose-500/25' },
};

export default function FinancePembelianGudangPage() {
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [reviewId, setReviewId] = useState<number | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const rows = await dbGet<Row>('pembelian_bahan');
      // Draft dari gudang tidak muncul di Finance — cuma yang sudah dikirim.
      setList((rows as Row[]).filter(r => String(r.status || '').toUpperCase() !== 'DRAFT'));
    } catch { setList([]); }
    setLoading(false);
  }
  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(r => {
      const s = String(r.status || '').toUpperCase();
      if (filter === 'PENDING' && s !== 'SUBMITTED') return false;
      if (filter === 'APPROVED' && s !== 'APPROVED') return false;
      if (filter === 'REJECTED' && s !== 'REJECTED') return false;
      if (!q) return true;
      return String(r.no_formulir || '').toLowerCase().includes(q)
        || String(r.pemohon || '').toLowerCase().includes(q)
        || String(r.divisi || '').toLowerCase().includes(q);
    });
  }, [list, search, filter]);

  const paged = paginate(filtered, page, pageSize);

  const counts = useMemo(() => ({
    PENDING: list.filter(r => String(r.status).toUpperCase() === 'SUBMITTED').length,
    APPROVED: list.filter(r => String(r.status).toUpperCase() === 'APPROVED').length,
    REJECTED: list.filter(r => String(r.status).toUpperCase() === 'REJECTED').length,
    ALL: list.length,
  }), [list]);

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.14] via-purple-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Pembelian Barang Gudang</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Formulir permintaan pembelian dari tim Gudang — review & approve.
              </p>
            </div>
          </div>
          <div className="relative w-full lg:w-80">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Cari no formulir, pemohon, divisi..."
              className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-violet-500/40" />
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as Filter[]).map(f => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }}
            className={`text-sm font-medium px-4 py-2.5 border-b-2 transition-colors ${
              filter === f
                ? 'text-violet-300 border-violet-400'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}>
            {f === 'PENDING' ? 'Menunggu' : f === 'APPROVED' ? 'Disetujui' : f === 'REJECTED' ? 'Ditolak' : 'Semua'}
            <span className="ml-2 text-[10px] font-semibold text-slate-500 bg-white/[0.04] rounded-full px-2 py-0.5">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                {['NO FORMULIR', 'TANGGAL', 'PEMOHON', 'DIVISI', 'TOTAL', 'STATUS', 'AKSI'].map(h => (
                  <th key={h} className={`text-[10px] text-slate-500 font-semibold ${h === 'TOTAL' ? 'text-right' : h === 'AKSI' ? 'text-right' : 'text-left'} px-5 py-3.5 uppercase tracking-widest`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-500">Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center">
                  <p className="text-sm text-slate-300 font-medium">Tidak ada formulir</p>
                  <p className="text-xs text-slate-500 mt-1">Tim Gudang belum kirim formulir pembelian.</p>
                </td></tr>
              ) : (
                paged.slice.map((row: Row) => {
                  const st = STATUS_MAP[String(row.status || 'SUBMITTED').toUpperCase()] || STATUS_MAP.SUBMITTED;
                  return (
                    <tr key={row.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 text-sm text-violet-300 font-semibold">{row.no_formulir || `#${row.id}`}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(row.tanggal || row.created_at)}</td>
                      <td className="px-5 py-4 text-sm text-white font-medium">{row.pemohon || '-'}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{row.divisi || '-'}</td>
                      <td className="px-5 py-4 text-right text-sm text-slate-200 tabular-nums font-semibold">Rp {fmtRp(Number(row.total) || 0)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end">
                          <button onClick={() => setReviewId(Number(row.id))}
                            className="text-xs font-semibold text-violet-300 border border-violet-500/25 bg-violet-500/10 hover:bg-violet-500/20 px-3 py-1.5 rounded-lg transition-colors">
                            Review
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
            <Pagination current={paged.current} total={paged.total} count={paged.count} pageSize={pageSize}
              onChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          </div>
        )}
      </div>

      {reviewId != null && (
        <ReviewModal id={reviewId} onClose={() => setReviewId(null)} onSaved={fetchData} />
      )}
    </div>
  );
}

/* ReviewModal — Finance approve/reject dengan optional catatan. */
function ReviewModal({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [header, setHeader] = useState<Row | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [hs, its] = await Promise.all([
          dbGet<Row>('pembelian_bahan', undefined, { id }),
          dbGet<Row>('pembelian_bahan_item', undefined, { pembelian_id: id }),
        ]);
        if (!cancelled) {
          const h = hs[0] || null;
          setHeader(h);
          setNotes(String(h?.finance_notes || ''));
          setItems(its.slice().sort((a, b) => Number(a.urutan) - Number(b.urutan)));
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function decide(nextStatus: 'APPROVED' | 'REJECTED') {
    if (nextStatus === 'REJECTED' && !notes.trim()) {
      toast.error('Catatan Wajib', 'Isi catatan alasan penolakan.');
      return;
    }
    setSaving(true);
    try {
      await dbUpdate('pembelian_bahan', id, {
        status: nextStatus,
        finance_notes: notes.trim() || null,
        finance_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        finance_by: String(user?.nama || user?.username || ''),
      });
      toast.success(nextStatus === 'APPROVED' ? 'Disetujui' : 'Ditolak',
        nextStatus === 'APPROVED' ? 'Formulir pembelian di-approve.' : 'Formulir pembelian ditolak.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
    setSaving(false);
  }

  const total = useMemo(() => items.reduce((s, it) => s + (Number(it.total) || 0), 0), [items]);
  const isSubmitted = String(header?.status || '').toUpperCase() === 'SUBMITTED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Review Pembelian Bahan</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="text-violet-300 font-medium">{header?.no_formulir || `#${id}`}</span>
              {header?.pemohon && <> · <span className="text-slate-300">{header.pemohon}</span></>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/[0.05]" title="Tutup (Esc)">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {loading ? (
            <div className="h-40 grid place-items-center">
              <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-400 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <InfoBox label="Tanggal" value={fmtDate(header?.tanggal || header?.created_at)} />
                <InfoBox label="Pemohon" value={String(header?.pemohon || '-')} />
                <InfoBox label="Divisi" value={String(header?.divisi || '-')} />
                <InfoBox label="Jabatan" value={String(header?.jabatan || '-')} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-1.5">List Barang</p>
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/10 text-slate-500 uppercase tracking-wider text-[10px]">
                        <th className="text-center px-2 py-2 w-10">NO</th>
                        <th className="text-left px-3 py-2">Nama Barang</th>
                        <th className="text-center px-2 py-2 w-24">Qty</th>
                        <th className="text-right px-3 py-2 w-32">Harga</th>
                        <th className="text-right px-3 py-2 w-32">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={it.id} className="border-b border-white/[0.04]">
                          <td className="text-center px-2 py-2 text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2 text-white font-medium">{it.nama_barang}</td>
                          <td className="text-center px-2 py-2 tabular-nums">{it.jumlah_item} {it.satuan}</td>
                          <td className="text-right px-3 py-2 tabular-nums text-slate-300">Rp {fmtRp(Number(it.harga) || 0)}</td>
                          <td className="text-right px-3 py-2 tabular-nums text-slate-200 font-semibold">Rp {fmtRp(Number(it.total) || 0)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={4} className="text-right px-3 py-2 text-slate-400 font-bold uppercase">Total</td>
                        <td className="text-right px-3 py-2 tabular-nums font-bold text-emerald-300">Rp {fmtRp(total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Alasan Pemesanan</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap mt-1">{header?.alasan || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Catatan Finance {isSubmitted ? '(wajib kalau ditolak)' : '(read-only)'}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} readOnly={!isSubmitted}
                  className="w-full min-h-[80px] bg-white/[0.03] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/40 resize-y"
                  placeholder="Catatan approve / alasan reject..." />
              </div>
              {!isSubmitted && (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-[11px] text-slate-500">Sudah direview oleh <span className="text-slate-300">{header?.finance_by || '-'}</span> pada <span className="text-slate-300">{fmtDateTime(header?.finance_at)}</span></p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-end gap-2 flex-wrap">
          <button onClick={onClose} className="text-xs font-semibold text-slate-300 border border-white/10 bg-white/[0.03] px-4 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            Tutup
          </button>
          {isSubmitted && (
            <>
              <button onClick={() => decide('REJECTED')} disabled={saving}
                className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-rose-500/20">
                {saving ? 'Memproses...' : 'Tolak'}
              </button>
              <button onClick={() => decide('APPROVED')} disabled={saving}
                className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
                {saving ? 'Memproses...' : 'Setujui'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-sm text-white mt-0.5">{value || <span className="text-slate-500">—</span>}</p>
    </div>
  );
}
