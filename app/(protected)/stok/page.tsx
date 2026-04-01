'use client';
import { useState } from 'react';

interface Material {
  nama: string; jenis: string; qty: number; satuan: string; harga: string;
}

interface Adjustment {
  tanggal: string; nama: string; jenis: string; tipe: string;
  qtySebelum: number; qtySesudah: number; selisih: number; satuan: string; keterangan: string;
}

const MOCK_MATERIALS: Material[] = [
  { nama: 'AUTHENTIC PRO (JOGLO)', jenis: 'AKSESORIS', qty: 0, satuan: 'PCS', harga: '-' },
  { nama: 'AUTHENTIC WOVEN', jenis: 'AKSESORIS', qty: 0, satuan: 'PCS', harga: '-' },
  { nama: 'TAFETA SAMPING (PRO)', jenis: 'AKSESORIS', qty: 0, satuan: 'PCS', harga: '-' },
  { nama: 'TALI KOLOR CELANA', jenis: 'AKSESORIS', qty: 0, satuan: 'KILOGRAM', harga: '-' },
  { nama: 'WASHTAG (LABEL SATIN)', jenis: 'AKSESORIS', qty: 0, satuan: 'PCS', harga: '-' },
  { nama: 'WEBBING', jenis: 'AKSESORIS', qty: 0, satuan: 'METER', harga: '-' },
  { nama: 'AIRWALK', jenis: 'KAIN', qty: 6, satuan: 'KILOGRAM', harga: '-' },
  { nama: 'BENZEMA', jenis: 'KAIN', qty: 0, satuan: 'KILOGRAM', harga: '-' },
];

const MOCK_ADJUSTMENTS: Adjustment[] = [
  { tanggal: '02/03/2026', nama: 'AIRWALK', jenis: 'KAIN', tipe: 'Penambahan', qtySebelum: 0, qtySesudah: 6, selisih: 6, satuan: 'KILOGRAM', keterangan: 'stok awal' },
  { tanggal: '15/12/2025', nama: 'BRAZIL', jenis: 'KAIN', tipe: 'Penambahan', qtySebelum: 0, qtySesudah: 12, selisih: 12, satuan: 'KILOGRAM', keterangan: 'PENAMBAHAN' },
  { tanggal: '29/10/2025', nama: 'KERAH JADI (RAJUT)', jenis: 'KERAH', tipe: 'Penambahan', qtySebelum: 0, qtySesudah: 23, selisih: 23, satuan: 'PCS', keterangan: 'adjust' },
];

export default function StokPage() {
  const [tab, setTab] = useState<'aktual' | 'adjustment'>('aktual');
  const [search, setSearch] = useState('');
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjType, setAdjType] = useState('koreksi');

  const filtered = MOCK_MATERIALS.filter(m =>
    !search || m.nama.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Stok Bahan Mentah</h1>
        <p className="text-sm text-slate-400 mt-1">Monitor inventaris dan riwayat penyesuaian stok bahan mentah.</p>
      </div>

      {/* Tabs */}
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

      {/* Tab Content */}
      {tab === 'aktual' ? (
        <div className="space-y-4">
          {/* Search + Button */}
          <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-4 flex gap-3 items-center">
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama bahan..." className="w-full bg-transparent text-white placeholder-slate-500 pl-10 pr-4 py-2.5 text-sm focus:outline-none" />
            </div>
            <button onClick={() => setAdjustModal(true)}
              className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Adjustment Baru
            </button>
          </div>

          {/* Table */}
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
                  {filtered.map((m, i) => (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
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
                        <button onClick={() => setAdjustModal(true)}
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
          <button onClick={() => setAdjustModal(true)}
            className="flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Adjustment Baru
          </button>

          <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['TANGGAL','NAMA BAHAN','JENIS','TIPE','QTY SEBELUM','QTY SESUDAH','SELISIH','KETERANGAN'].map(h => (
                      <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_ADJUSTMENTS.map((a, i) => (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 text-sm text-slate-400">{a.tanggal}</td>
                      <td className="px-5 py-4 text-sm font-medium text-white">{a.nama}</td>
                      <td className="px-5 py-4"><span className="text-xs text-slate-400 bg-white/[0.06] px-2.5 py-1 rounded">{a.jenis}</span></td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">{a.tipe}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-400">{a.qtySebelum} {a.satuan}</td>
                      <td className="px-5 py-4 text-sm text-slate-300">{a.qtySesudah} {a.satuan}</td>
                      <td className="px-5 py-4 text-sm font-medium text-emerald-400">+{a.selisih} {a.satuan}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{a.keterangan}</td>
                    </tr>
                  ))}
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
            <p className="text-sm text-slate-400 mb-6">Sesuaikan jumlah stok material. Pastikan data yang dimasukkan sudah benar.</p>

            <div className="space-y-5">
              {/* Material */}
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Material</label>
                <select className="w-full bg-[#0d1117] border border-white/10 text-slate-400 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
                  <option>Pilih material...</option>
                  {MOCK_MATERIALS.map(m => <option key={m.nama} value={m.nama}>{m.nama}</option>)}
                </select>
              </div>

              {/* Tipe */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Tipe Adjustment</label>
                <div className="flex gap-4">
                  {['Penambahan','Pengurangan','Koreksi'].map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="adj_type" value={t.toLowerCase()} checked={adjType === t.toLowerCase()}
                        onChange={e => setAdjType(e.target.value)}
                        className="w-4 h-4 text-blue-500 bg-transparent border-slate-600 focus:ring-0 focus:ring-offset-0" />
                      <span className="text-sm text-slate-300">{t}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Qty row */}
              <div className="grid grid-cols-3 gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Stok Saat Ini</span>
                  <span className="text-lg font-bold text-white">&ndash;</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Jumlah Baru</span>
                  <input type="number" defaultValue={0}
                    className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Perbedaan</span>
                  <span className="text-lg font-bold text-white">&ndash;</span>
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Keterangan</label>
                <textarea rows={3} placeholder="Contoh: Stok opname bulanan, material rusak, dll."
                  className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/40 resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setAdjustModal(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
                Batal
              </button>
              <button onClick={() => setAdjustModal(false)}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
                Simpan Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
