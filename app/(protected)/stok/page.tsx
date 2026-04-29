'use client';
import { useState, useEffect } from 'react';
import { dbGet, dbCreate, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtDate(d: string) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
}

export default function StokPage() {
  const [tab, setTab] = useState<'aktual' | 'adjustment'>('aktual');
  const [search, setSearch] = useState('');
  const [stokList, setStokList] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [barangList, setBarangList] = useState<Row[]>([]);
  const [woList, setWoList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjBarangId, setAdjBarangId] = useState('');
  const [adjType, setAdjType] = useState('Penambahan');
  const [adjQty, setAdjQty] = useState('0');
  const [adjKeterangan, setAdjKeterangan] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function fetchData() {
    try {
      const [s, a, b, w] = await Promise.all([
        dbGet('stok'),
        dbGet('stok_adjustment'),
        dbGet('barang'),
        dbGet('work_orders'),
      ]);
      setStokList(s);
      setAdjustments(a);
      setBarangList(b);
      setWoList(w);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  // Merge stok with barang for display
  const stokDisplay = barangList.map(b => {
    const s = stokList.find((st: Row) => String(st.barang_id) === String(b.id));
    return {
      id: b.id,
      nama: b.nama,
      jenis: b.tipe_nama || '-',
      qty: s?.qty || 0,
      satuan: b.satuan || 'PCS',
      harga: s?.harga_per_unit ? `Rp ${Number(s.harga_per_unit).toLocaleString('id-ID')}` : '-',
      stokId: s?.id,
    };
  });

  const filtered = stokDisplay.filter(m =>
    !search || m.nama.toLowerCase().includes(search.toLowerCase())
  );

  // Current stock for selected barang in modal
  const selectedBarang = barangList.find((b: Row) => String(b.id) === adjBarangId);
  const currentStok = stokList.find((s: Row) => String(s.barang_id) === adjBarangId);
  const currentQty = currentStok?.qty || 0;
  const newQty = Number(adjQty) || 0;
  const diff = newQty - currentQty;

  function openAdjustment(barangId?: number) {
    setAdjBarangId(barangId ? String(barangId) : '');
    setAdjType('Penambahan');
    setAdjQty('0');
    setAdjKeterangan('');
    setAdjustModal(true);
  }

  async function handleSaveAdjustment() {
    if (!adjBarangId) { toast.warning('Validasi', 'Pilih material terlebih dahulu'); return; }
    setSaving(true);
    try {
      const qtyBefore = currentQty;
      const qtyAfter = newQty;
      const selisih = qtyAfter - qtyBefore;

      // Create adjustment record
      await dbCreate('stok_adjustment', {
        barang_id: Number(adjBarangId),
        tipe: adjType,
        qty_sebelum: qtyBefore,
        qty_sesudah: qtyAfter,
        selisih,
        keterangan: adjKeterangan,
      });

      // Update or create stok record
      if (currentStok) {
        await dbUpdate('stok', currentStok.id, { qty: qtyAfter });
      } else {
        await dbCreate('stok', { barang_id: Number(adjBarangId), qty: qtyAfter });
      }

      toast.success('Adjustment Berhasil', `${selectedBarang?.nama}: ${qtyBefore} → ${qtyAfter}`);
      setAdjustModal(false);
      await fetchData();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-10 bg-white/[0.03] rounded-lg animate-pulse" />
      {[1,2,3].map(i => <div key={i} className="h-16 bg-white/[0.03] rounded-lg animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Stok Bahan Mentah</h1>
        <p className="text-sm text-slate-400 mt-1">Monitor inventaris dan riwayat penyesuaian stok bahan mentah.</p>
      </div>

      <div className="border-b border-white/[0.06]">
        <div className="flex gap-0">
          {[
            { key: 'aktual' as const, label: 'Stok Aktual' },
            { key: 'adjustment' as const, label: 'Stok Adjustment' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'text-white border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'aktual' ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-4 flex gap-3 items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama bahan..." className="w-full bg-transparent text-white placeholder-slate-500 pl-10 pr-4 py-2.5 text-sm focus:outline-none" />
            </div>
            <button onClick={() => openAdjustment()}
              className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Adjustment Baru
            </button>
          </div>

          <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['NAMA BAHAN','JENIS','QTY TERSEDIA','SATUAN','HARGA/UNIT','STATUS','AKSI'].map(h => (
                      <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada data stok</td></tr>
                  ) : filtered.map(m => (
                    <tr key={m.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 text-sm font-medium text-white">{m.nama}</td>
                      <td className="px-5 py-4"><span className="text-xs text-slate-400 bg-white/[0.06] px-2.5 py-1 rounded">{m.jenis}</span></td>
                      <td className="px-5 py-4 text-sm text-center text-slate-300">{m.qty}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{m.satuan}</td>
                      <td className="px-5 py-4 text-sm text-slate-500">{m.harga}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${m.qty > 0 ? 'text-emerald-400 bg-emerald-500/15' : 'text-red-400 bg-red-500/15'}`}>
                          {m.qty > 0 ? 'Tersedia' : 'Habis'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => openAdjustment(m.id)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
                          Adjustment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => openAdjustment()}
            className="flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Adjustment Baru
          </button>

          <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['TANGGAL','NAMA BAHAN','JENIS','TIPE','SUMBER','QTY SEBELUM','QTY SESUDAH','SELISIH','KETERANGAN'].map(h => (
                      <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adjustments.length === 0 ? (
                    <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">Belum ada riwayat adjustment</td></tr>
                  ) : adjustments.map((a: Row) => {
                    const selisih = a.selisih || 0;
                    const satuan = a.satuan || 'PCS';
                    const tipeColor = a.tipe === 'Penambahan' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : a.tipe === 'Pengurangan' ? 'text-red-400 bg-red-500/10 border-red-500/20'
                      : a.tipe === 'Pemakaian_WO' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                      : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                    const tipeLabel = a.tipe === 'Pemakaian_WO' ? 'Pemakaian WO' : a.tipe;
                    const wo = a.work_order_id ? woList.find((w: Row) => String(w.id) === String(a.work_order_id)) : null;
                    return (
                      <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(a.created_at)}</td>
                        <td className="px-5 py-4 text-sm font-medium text-white">{a.barang_nama}</td>
                        <td className="px-5 py-4"><span className="text-xs text-slate-400 bg-white/[0.06] px-2.5 py-1 rounded">{a.tipe_nama || '-'}</span></td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${tipeColor}`}>{tipeLabel}</span>
                        </td>
                        <td className="px-5 py-4 text-sm">
                          {wo ? (
                            <span className="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded">{wo.no_wo || `WO #${wo.id}`}</span>
                          ) : (
                            <span className="text-xs text-slate-500">Manual</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-400">{a.qty_sebelum} {satuan}</td>
                        <td className="px-5 py-4 text-sm text-slate-300">{a.qty_sesudah} {satuan}</td>
                        <td className="px-5 py-4 text-sm font-medium">
                          <span className={selisih >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {selisih >= 0 ? '+' : ''}{selisih} {satuan}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-400">{a.keterangan || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adjustment */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAdjustModal(false)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-white">Buat Adjustment Stok</h3>
              <button onClick={() => setAdjustModal(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">Sesuaikan jumlah stok material.</p>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Material</label>
                <select value={adjBarangId} onChange={e => { setAdjBarangId(e.target.value); setAdjQty('0'); }}
                  className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
                  <option value="">Pilih material...</option>
                  {barangList.map((b: Row) => <option key={b.id} value={b.id}>{b.nama} ({b.tipe_nama})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Tipe Adjustment</label>
                <div className="flex gap-4">
                  {['Penambahan','Pengurangan','Koreksi'].map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="adj_type" value={t} checked={adjType === t}
                        onChange={e => setAdjType(e.target.value)}
                        className="w-4 h-4 text-blue-500 bg-transparent border-slate-600 focus:ring-0 focus:ring-offset-0" />
                      <span className="text-sm text-slate-300">{t}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Stok Saat Ini</span>
                  <span className="text-lg font-bold text-white">{adjBarangId ? currentQty : '–'}</span>
                  {adjBarangId && <span className="text-xs text-slate-500 ml-1">{selectedBarang?.satuan}</span>}
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Jumlah Baru</span>
                  <input type="number" value={adjQty} onChange={e => setAdjQty(e.target.value)}
                    className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Perbedaan</span>
                  <span className={`text-lg font-bold ${adjBarangId ? (diff >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-white'}`}>
                    {adjBarangId ? `${diff >= 0 ? '+' : ''}${diff}` : '–'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Keterangan</label>
                <textarea rows={3} value={adjKeterangan} onChange={e => setAdjKeterangan(e.target.value)}
                  placeholder="Contoh: Stok opname bulanan, material rusak, dll."
                  className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/40 resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setAdjustModal(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
                Batal
              </button>
              <button onClick={handleSaveAdjustment} disabled={saving}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {saving ? 'Menyimpan...' : 'Simpan Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
