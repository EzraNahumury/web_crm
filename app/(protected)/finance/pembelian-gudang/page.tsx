'use client';
import { useEffect, useMemo, useState } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { Pagination, paginate } from '@/lib/pagination';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

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

export default function FinancePembelianGudangPage() {
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewId, setViewId] = useState<number | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const rows = await dbGet<Row>('pembelian_bahan');
      // History — tampil semua kecuali DRAFT (draft masih di-edit Gudang,
      // belum siap dilihat Finance).
      setList((rows as Row[]).filter(r => String(r.status || '').toUpperCase() !== 'DRAFT'));
    } catch { setList([]); }
    setLoading(false);
  }
  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(r =>
      String(r.no_formulir || '').toLowerCase().includes(q)
      || String(r.pemohon || '').toLowerCase().includes(q)
      || String(r.divisi || '').toLowerCase().includes(q)
    );
  }, [list, search]);

  const paged = paginate(filtered, page, pageSize);

  const totalNominal = useMemo(
    () => list.reduce((s, r) => s + (Number(r.total) || 0), 0),
    [list],
  );

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
                History formulir pembelian dari tim Gudang · <span className="text-white font-medium">{list.length} formulir · Rp {fmtRp(totalNominal)}</span>
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

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                {['NO FORMULIR', 'TANGGAL', 'PEMOHON', 'DIVISI', 'TOTAL', 'AKSI'].map(h => (
                  <th key={h} className={`text-[10px] text-slate-500 font-semibold ${h === 'TOTAL' ? 'text-right' : h === 'AKSI' ? 'text-right' : 'text-left'} px-5 py-3.5 uppercase tracking-widest`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-sm text-slate-500">Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-16 text-center">
                  <p className="text-sm text-slate-300 font-medium">Belum ada history</p>
                  <p className="text-xs text-slate-500 mt-1">Tim Gudang belum kirim formulir pembelian.</p>
                </td></tr>
              ) : (
                paged.slice.map((row: Row) => (
                  <tr key={row.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 text-sm text-violet-300 font-semibold">{row.no_formulir || `#${row.id}`}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(row.tanggal || row.created_at)}</td>
                    <td className="px-5 py-4 text-sm text-white font-medium">{row.pemohon || '-'}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{row.divisi || '-'}</td>
                    <td className="px-5 py-4 text-right text-sm text-slate-200 tabular-nums font-semibold">Rp {fmtRp(Number(row.total) || 0)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end">
                        <button onClick={() => setViewId(Number(row.id))}
                          title="Lihat detail"
                          className="text-sky-300 hover:text-sky-200 p-1.5 rounded-lg hover:bg-sky-500/10 border border-transparent hover:border-sky-500/25 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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

      {viewId != null && (
        <DetailModal id={viewId} onClose={() => setViewId(null)} />
      )}
    </div>
  );
}

/* DetailModal — read-only view untuk Finance cek formulir. */
function DetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState<Row | null>(null);
  const [items, setItems] = useState<Row[]>([]);

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
          setHeader(hs[0] || null);
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

  const total = useMemo(() => items.reduce((s, it) => s + (Number(it.total) || 0), 0), [items]);

  // Finance centang barang yang sudah dibeli. Optimistic update + persist;
  // rollback kalau gagal. Tim Gudang membaca flag ini sebagai Notes
  // (Terbeli / Belum terbeli).
  async function toggleTerbeli(it: Row) {
    const next = Number(it.terbeli) ? 0 : 1;
    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, terbeli: next } : x)));
    try {
      await dbUpdate('pembelian_bahan_item', Number(it.id), { terbeli: next });
    } catch {
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, terbeli: it.terbeli } : x)));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Detail Formulir Pembelian</h3>
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
                <InfoBox label="Dikirim" value={fmtDateTime(header?.created_at)} />
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
                        <th className="text-center px-2 py-2 w-24">Terbeli</th>
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
                          <td className="text-center px-2 py-2">
                            <input
                              type="checkbox"
                              checked={!!Number(it.terbeli)}
                              onChange={() => toggleTerbeli(it)}
                              title={Number(it.terbeli) ? 'Sudah dibeli — klik untuk batalkan' : 'Centang jika sudah dibeli'}
                              className="w-4 h-4 accent-emerald-500 cursor-pointer"
                            />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={4} className="text-right px-3 py-2 text-slate-400 font-bold uppercase">Total</td>
                        <td className="text-right px-3 py-2 tabular-nums font-bold text-emerald-300">Rp {fmtRp(total)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Alasan Pemesanan</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap mt-1">{header?.alasan || '-'}</p>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-end">
          <button onClick={onClose} className="text-xs font-semibold text-slate-300 border border-white/10 bg-white/[0.03] px-4 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            Tutup
          </button>
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
