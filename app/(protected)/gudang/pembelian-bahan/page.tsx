'use client';
import { useEffect, useMemo, useState } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { Pagination, paginate } from '@/lib/pagination';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtRp(n: number) {
  if (!n) return '0';
  return new Intl.NumberFormat('id-ID').format(n);
}
function parseRp(s: string): number {
  return parseInt(String(s).replace(/\D/g, ''), 10) || 0;
}
function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '-';
  const s = d instanceof Date ? d.toISOString() : String(d);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return s; }
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',      cls: 'text-slate-300 bg-slate-500/10 border-slate-500/25' },
  SUBMITTED: { label: 'Terkirim',   cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
};

export default function PembelianBahanPage() {
  const toast = useToast();
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Row | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const rows = await dbGet<Row>('pembelian_bahan');
      setList(rows);
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

  async function handleDelete(row: Row) {
    try {
      const items = await dbGet<Row>('pembelian_bahan_item', undefined, { pembelian_id: row.id });
      for (const it of items) {
        try { await dbDelete('pembelian_bahan_item', it.id); } catch {}
      }
      await dbDelete('pembelian_bahan', row.id);
      toast.success('Dihapus', `Formulir ${row.no_formulir || '#' + row.id} dihapus.`);
      setDeleteConfirm(null);
      await fetchData();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-500/[0.14] via-purple-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-500/5 border border-violet-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Pembelian Bahan</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Formulir permintaan barang gudang · <span className="text-white font-medium">Submit → Finance approve</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="relative w-full sm:w-72">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Cari no formulir, pemohon, divisi..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-violet-500/40" />
            </div>
            <button onClick={() => { setEditingId(null); setFormOpen(true); }}
              className="text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 px-4 py-2.5 rounded-lg transition-colors shadow-lg shadow-violet-500/20 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Buat Formulir
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
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/15 to-transparent border border-violet-500/20 grid place-items-center">
                      <svg className="w-6 h-6 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-300 font-medium">Belum ada formulir pembelian</p>
                    <p className="text-xs text-slate-500 max-w-xs">Klik <strong className="text-white">Buat Formulir</strong> untuk request pembelian bahan ke Finance.</p>
                  </div>
                </td></tr>
              ) : (
                paged.slice.map((row: Row) => {
                  const st = STATUS_MAP[String(row.status || 'SUBMITTED').toUpperCase()] || STATUS_MAP.SUBMITTED;
                  return (
                    <tr key={row.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                      <td className="px-5 py-4 text-sm text-violet-300 font-semibold">{row.no_formulir || `#${row.id}`}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(row.tanggal || row.created_at)}</td>
                      <td className="px-5 py-4 text-sm text-white font-medium">{row.pemohon || '-'}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{row.divisi || '-'}</td>
                      <td className="px-5 py-4 text-right text-sm text-slate-200 tabular-nums font-semibold">Rp {fmtRp(Number(row.total) || 0)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewId(Number(row.id))}
                            title="Lihat detail"
                            className="text-sky-300 hover:text-sky-200 p-1.5 rounded-lg hover:bg-sky-500/10 border border-transparent hover:border-sky-500/25 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                          {String(row.status).toUpperCase() === 'DRAFT' && (
                            <button
                              onClick={() => { setEditingId(Number(row.id)); setFormOpen(true); }}
                              title="Edit draft"
                              className="text-amber-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-amber-500/10 border border-transparent hover:border-amber-500/25 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteConfirm(row)}
                            title="Hapus"
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
            <Pagination current={paged.current} total={paged.total} count={paged.count} pageSize={pageSize}
              onChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          </div>
        )}
      </div>

      {formOpen && (
        <FormulirModal
          editingId={editingId}
          onClose={() => { setFormOpen(false); setEditingId(null); }}
          onSaved={fetchData}
        />
      )}
      {viewId != null && (
        <FormulirDetail id={viewId} onClose={() => setViewId(null)} />
      )}
      {deleteConfirm && (
        <ConfirmDialog
          title="Hapus Formulir?"
          message={`Hapus formulir ${deleteConfirm.no_formulir || '#' + deleteConfirm.id}?`}
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   FormulirModal — form pembelian bahan.
   Layout mirror template Formulir Permintaan Barang (image #654).
   Simpan Draft (status=DRAFT) atau Submit (status=SUBMITTED → ke Finance).
   ──────────────────────────────────────────────────────────────── */
interface ItemLine { id: number; nama: string; qty: number; harga: number; satuan: string; }

function FormulirModal({ editingId, onClose, onSaved }: {
  editingId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [noFormulir, setNoFormulir] = useState('');
  const [tanggal, setTanggal] = useState<string>(new Date().toISOString().slice(0, 10));
  const [pemohon, setPemohon] = useState('');
  const [divisi, setDivisi] = useState('Gudang');
  const [jabatan, setJabatan] = useState('');
  const [alasan, setAlasan] = useState('');
  const [items, setItems] = useState<ItemLine[]>([{ id: 1, nama: '', qty: 0, harga: 0, satuan: 'pcs' }]);
  const [status, setStatus] = useState<'DRAFT' | 'SUBMITTED'>('DRAFT');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (editingId) {
          const [headers, detail] = await Promise.all([
            dbGet<Row>('pembelian_bahan', undefined, { id: editingId }),
            dbGet<Row>('pembelian_bahan_item', undefined, { pembelian_id: editingId }),
          ]);
          const h = headers[0];
          if (h && !cancelled) {
            setNoFormulir(String(h.no_formulir || ''));
            setTanggal(String(h.tanggal || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
            setPemohon(String(h.pemohon || ''));
            setDivisi(String(h.divisi || 'Gudang'));
            setJabatan(String(h.jabatan || ''));
            setAlasan(String(h.alasan || ''));
            setStatus((String(h.status || 'DRAFT').toUpperCase() === 'SUBMITTED') ? 'SUBMITTED' : 'DRAFT');
            const sorted = detail.slice().sort((a, b) => Number(a.urutan) - Number(b.urutan));
            setItems(sorted.length > 0 ? sorted.map((r, i) => ({
              id: i + 1,
              nama: String(r.nama_barang || ''),
              qty: Number(r.jumlah_item) || 0,
              harga: Number(r.harga) || 0,
              satuan: String(r.satuan || 'pcs'),
            })) : [{ id: 1, nama: '', qty: 0, harga: 0, satuan: 'pcs' }]);
          }
        } else {
          if (!cancelled) {
            setPemohon(String(user?.nama || user?.username || ''));
            // Auto-generate no formulir: PB-YYYYMMDD-HHmm
            const d = new Date();
            const nm = `PB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
            setNoFormulir(nm);
          }
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  // user hanya di-read pertama kali, cukup depend on editingId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.harga) || 0), 0),
    [items],
  );

  function updateItem(id: number, patch: Partial<ItemLine>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }
  function addItem() {
    setItems(prev => [...prev, { id: Math.max(0, ...prev.map(p => p.id)) + 1, nama: '', qty: 0, harga: 0, satuan: 'pcs' }]);
  }
  function removeItem(id: number) {
    setItems(prev => prev.length === 1 ? prev : prev.filter(it => it.id !== id));
  }

  async function persist(nextStatus: 'DRAFT' | 'SUBMITTED') {
    if (!pemohon.trim()) { toast.error('Wajib Diisi', 'Nama Pemohon harus diisi.'); return; }
    const validItems = items.filter(it => it.nama.trim() && it.qty > 0);
    if (validItems.length === 0) { toast.error('Wajib Diisi', 'Minimal 1 item dengan nama & qty.'); return; }
    setSaving(true);
    try {
      const payload = {
        no_formulir: noFormulir.trim() || null,
        tanggal: tanggal || null,
        pemohon: pemohon.trim(),
        divisi: divisi.trim() || null,
        jabatan: jabatan.trim() || null,
        alasan: alasan.trim() || null,
        total,
        status: nextStatus,
        created_by: String(user?.nama || user?.username || ''),
      };
      let pembelianId = editingId;
      if (editingId) {
        await dbUpdate('pembelian_bahan', editingId, payload);
        // Delete + re-insert items untuk simplicity.
        const existing = await dbGet<Row>('pembelian_bahan_item', undefined, { pembelian_id: editingId });
        for (const e of existing) { try { await dbDelete('pembelian_bahan_item', e.id); } catch {} }
      } else {
        pembelianId = await dbCreate('pembelian_bahan', payload);
      }
      let ord = 0;
      for (const it of validItems) {
        ord++;
        await dbCreate('pembelian_bahan_item', {
          pembelian_id: pembelianId,
          urutan: ord,
          nama_barang: it.nama.trim(),
          jumlah_item: it.qty,
          satuan: it.satuan || 'pcs',
          harga: it.harga,
          total: it.qty * it.harga,
        });
      }
      toast.success('Tersimpan', nextStatus === 'SUBMITTED' ? 'Formulir dikirim ke Finance.' : 'Draft disimpan.');
      setStatus(nextStatus);
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
    setSaving(false);
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

      pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
      pdf.text('FORMULIR PERMINTAAN BARANG', pdf.internal.pageSize.getWidth() / 2, 22, { align: 'center' });

      pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
      const lh = 6.5;
      let y = 34;
      const kvp = (k: string, v: string) => {
        pdf.setFont('helvetica', 'normal'); pdf.text(k, 14, y);
        pdf.text(':', 55, y);
        pdf.setFont('helvetica', 'bold'); pdf.text(v || '-', 60, y);
        y += lh;
      };
      kvp('No. Formulir', noFormulir);
      kvp('Hari/Tanggal', fmtDate(tanggal));
      kvp('Pemohon', pemohon);
      kvp('Divisi', divisi);
      kvp('Jabatan', jabatan);

      y += 2;
      pdf.setFont('helvetica', 'normal');
      pdf.text('List Barang yang diminta :', 14, y);
      y += 4;

      autoTable(pdf, {
        startY: y,
        head: [['NO', 'NAMA BARANG', 'JUMLAH ITEM', 'HARGA', 'JUMLAH (Rp)']],
        body: items.filter(it => it.nama.trim()).map((it, i) => [
          String(i + 1),
          it.nama,
          `${it.qty} ${it.satuan}`,
          `Rp ${fmtRp(it.harga)}`,
          `Rp ${fmtRp(it.qty * it.harga)}`,
        ]),
        foot: [[
          { content: 'TOTAL', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: `Rp ${fmtRp(total)}`, styles: { halign: 'right', fontStyle: 'bold' } },
        ]],
        styles: { fontSize: 10, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: 'center' },
        footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          2: { cellWidth: 30, halign: 'center' },
          3: { cellWidth: 35, halign: 'right' },
          4: { cellWidth: 40, halign: 'right' },
        },
      });

      // Alasan
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastY = ((pdf as any).lastAutoTable?.finalY ?? y) + 10;
      pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
      pdf.text('Alasan pemesanan barang :', 14, lastY);
      const alasanLines = pdf.splitTextToSize(alasan || '-', 180);
      pdf.text(alasanLines, 14, lastY + 6);

      // Signatures
      // Signature block:
      //   Kiri = MENGETAHUI (Staf Gudang / Pemohon)
      //   Kanan = MENYETUJUI (Manager Produksi)
      const sigY = Math.min(lastY + 6 + alasanLines.length * 5 + 20, pdf.internal.pageSize.getHeight() - 40);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Mengetahui,', 30, sigY);
      pdf.text('Menyetujui,', 140, sigY);
      pdf.setFont('helvetica', 'normal');
      // Nama sengaja dikosongkan (garis bawah) supaya ditulis manual saat cetak.
      pdf.text('(________________)', 30, sigY + 25);
      pdf.text('(________________)', 140, sigY + 25);
      pdf.setFontSize(9);
      pdf.text('Staf Gudang', 30, sigY + 30);
      pdf.text('Manager Produksi', 140, sigY + 30);

      pdf.save(`FormulirPembelian_${noFormulir || 'draft'}.pdf`);
      toast.success('PDF Berhasil', 'Formulir di-download.');
    } catch (e) {
      toast.error('Gagal Download', String(e));
    }
    setDownloading(false);
  }

  const readOnly = status === 'SUBMITTED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Formulir Permintaan Barang</h3>
            <p className="text-xs text-slate-500 mt-0.5">Isi form → Simpan Draft atau Kirim ke Finance untuk approval.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/[0.05] transition-colors" title="Tutup (Esc)">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="h-40 grid place-items-center">
              <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="No. Formulir" value={noFormulir} onChange={setNoFormulir} readOnly={readOnly} />
                <Field label="Hari / Tanggal" value={tanggal} onChange={setTanggal} type="date" readOnly={readOnly} />
                <Field label="Pemohon *" value={pemohon} onChange={setPemohon} readOnly={readOnly} />
                <Field label="Divisi" value={divisi} onChange={setDivisi} readOnly={readOnly} />
                <Field label="Jabatan" value={jabatan} onChange={setJabatan} readOnly={readOnly} />
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-300 mb-2">List Barang yang diminta</p>
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/10 text-slate-400 uppercase tracking-wider">
                        <th className="text-center px-2 py-2 w-10">NO</th>
                        <th className="text-left px-3 py-2 min-w-[220px]">NAMA BARANG</th>
                        <th className="text-center px-2 py-2 w-24">QTY</th>
                        <th className="text-left px-2 py-2 w-20">SATUAN</th>
                        <th className="text-right px-3 py-2 min-w-[130px]">HARGA</th>
                        <th className="text-right px-3 py-2 min-w-[130px]">JUMLAH (Rp)</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={it.id} className="border-b border-white/[0.04]">
                          <td className="text-center text-slate-500 px-2 py-1.5">{i + 1}</td>
                          <td className="p-1">
                            <input value={it.nama} onChange={e => updateItem(it.id, { nama: e.target.value })}
                              readOnly={readOnly}
                              placeholder="Nama barang"
                              className="w-full bg-transparent text-white px-2 py-1 focus:bg-white/[0.05] focus:outline-none rounded" />
                          </td>
                          <td className="p-1">
                            <input type="text" inputMode="decimal" value={it.qty || ''}
                              onChange={e => updateItem(it.id, { qty: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
                              readOnly={readOnly}
                              className="w-full bg-transparent text-white text-right tabular-nums px-2 py-1 focus:bg-white/[0.05] focus:outline-none rounded" />
                          </td>
                          <td className="p-1">
                            <input value={it.satuan}
                              onChange={e => updateItem(it.id, { satuan: e.target.value })}
                              readOnly={readOnly}
                              placeholder="pcs"
                              className="w-full bg-transparent text-white px-2 py-1 focus:bg-white/[0.05] focus:outline-none rounded" />
                          </td>
                          <td className="p-1">
                            <div className="flex items-center gap-1 px-2">
                              <span className="text-slate-500 text-[10px]">Rp</span>
                              <input type="text" inputMode="numeric" value={it.harga ? fmtRp(it.harga) : ''}
                                onChange={e => updateItem(it.id, { harga: parseRp(e.target.value) })}
                                readOnly={readOnly}
                                className="flex-1 bg-transparent text-white text-right tabular-nums px-1 py-1 focus:bg-white/[0.05] focus:outline-none rounded" />
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-200 tabular-nums">Rp {fmtRp(it.qty * it.harga)}</td>
                          <td className="text-center">
                            {!readOnly && items.length > 1 && (
                              <button onClick={() => removeItem(it.id)} className="text-rose-500 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10" title="Hapus baris">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={5} className="text-right px-3 py-2 text-slate-400 font-bold uppercase">Total</td>
                        <td className="text-right px-3 py-2 tabular-nums font-bold text-emerald-300">Rp {fmtRp(total)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                {!readOnly && (
                  <button onClick={addItem} className="mt-2 text-xs font-medium text-violet-300 border border-violet-500/25 bg-violet-500/10 hover:bg-violet-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Item
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Alasan pemesanan barang</label>
                <textarea value={alasan} onChange={e => setAlasan(e.target.value)} readOnly={readOnly}
                  className="w-full min-h-[80px] bg-white/[0.03] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/40 resize-y"
                  placeholder="Alasan pembelian bahan..." />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-slate-500">
            {readOnly
              ? 'Status: Dikirim ke Finance — form tidak bisa diedit lagi.'
              : 'Simpan Draft = simpan tanpa kirim. Kirim ke Finance = submit approval.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadPdf} disabled={downloading || loading}
              className="text-xs font-semibold text-slate-300 border border-white/10 bg-white/[0.03] px-3 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-50">
              {downloading ? 'Membuat PDF...' : 'Download PDF'}
            </button>
            {!readOnly && (
              <>
                <button onClick={() => persist('DRAFT')} disabled={saving || loading}
                  className="text-xs font-semibold text-slate-200 border border-white/10 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
                  {saving ? 'Menyimpan...' : 'Simpan Draft'}
                </button>
                <button onClick={() => persist('SUBMITTED')} disabled={saving || loading}
                  className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors shadow-lg shadow-violet-500/20">
                  {saving ? 'Mengirim...' : 'Kirim ke Finance'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', readOnly }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} readOnly={readOnly}
        className="w-full bg-white/[0.03] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/40" />
    </div>
  );
}

/* Detail modal — read-only view untuk semua status. */
function FormulirDetail({ id, onClose }: { id: number; onClose: () => void }) {
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
  const st = STATUS_MAP[String(header?.status || 'SUBMITTED').toUpperCase()] || STATUS_MAP.SUBMITTED;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Detail Formulir Permintaan</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="text-violet-300 font-medium">{header?.no_formulir || `#${id}`}</span>
              {' · '}
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
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
                <InfoRow label="Tanggal" value={fmtDate(header?.tanggal || header?.created_at)} />
                <InfoRow label="Pemohon" value={String(header?.pemohon || '-')} />
                <InfoRow label="Divisi" value={String(header?.divisi || '-')} />
                <InfoRow label="Jabatan" value={String(header?.jabatan || '-')} />
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
                        <th className="text-center px-2 py-2 w-28">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => {
                        const terbeli = !!Number(it.terbeli);
                        return (
                        <tr key={it.id} className="border-b border-white/[0.04]">
                          <td className="text-center px-2 py-2 text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2 text-white font-medium">{it.nama_barang}</td>
                          <td className="text-center px-2 py-2 tabular-nums">{it.jumlah_item} {it.satuan}</td>
                          <td className="text-right px-3 py-2 tabular-nums text-slate-300">Rp {fmtRp(Number(it.harga) || 0)}</td>
                          <td className="text-right px-3 py-2 tabular-nums text-slate-200 font-semibold">Rp {fmtRp(Number(it.total) || 0)}</td>
                          <td className="text-center px-2 py-2">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${terbeli ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' : 'text-slate-400 bg-slate-500/10 border-slate-500/20'}`}>
                              {terbeli ? 'Terbeli' : 'Belum terbeli'}
                            </span>
                          </td>
                        </tr>
                        );
                      })}
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
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-sm text-white mt-0.5">{value || <span className="text-slate-500">—</span>}</p>
    </div>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
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
            <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="text-sm text-slate-400 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-sm font-medium text-slate-300 border border-white/10 bg-white/[0.03] px-4 py-2 rounded-lg hover:bg-white/[0.06]">Batal</button>
          <button onClick={onConfirm} className="text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-lg shadow-lg shadow-rose-500/20">Ya, Hapus</button>
        </div>
      </div>
    </div>
  );
}
