'use client';
import { useState } from 'react';
import { PAKET1_OPTIONS, PAKET2_OPTIONS } from '@/lib/constants';

interface OrderItem {
  id: number;
  paket: string;
  bahan: string;
}

const BAHAN_OPTIONS = ['Cotton Combed 24s', 'Cotton Combed 30s', 'Dry Fit', 'Hyget', 'PE', 'TC'];

const PROMOS = [
  {
    id: 'promo-maret',
    name: 'PROMO MARET',
    dateRange: '2 Maret 2026 - 30 April 2026',
    description: 'STANDAR : FREE LOGO 3D CLASSIC : FREE LOGO 3D & 1 BOLA/JERSEY PRO : FREE LOGO 3D, 1 BOLA, 1 JERSEY WARRIOR : FREE LOGO 3D , BOLA, JERSEY TIM, SUBSIDI ONGKIR 80RB, CASHBACK 5% NEXT ORDER',
  },
  {
    id: 'cashback',
    name: 'CASHBACK',
    dateRange: '28 Februari 2026 - 31 Mei 2026',
    description: 'CASHBACK YANG BISA DI KLAIM SAAT ORDERAN SELESAI',
  },
  {
    id: 'promo-februari',
    name: 'PROMO FEBRUARI',
    dateRange: '28 Februari 2026 - 30 April 2026',
    description: 'STANDAR : FREE LOGO 3D FLOCK CLASSIC : FREE LOGO 3D FLOCK & BOLA / JERSEY TIM PRO : FREE LOGO 3D FLOCK, BOLA, JERSEY TIM WARRIOR : FREE LOGO 3D, FLOCK, BOLA, JERSEY TIM, SUBSIDI ONGKIR 80RB, CASHBACK 5% NEXT ORDER',
  },
];

function today() {
  return new Date().toISOString().split('T')[0];
}
function weekLater() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

export default function CreateOrderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [customer, setCustomer] = useState('');
  const [alamat, setAlamat] = useState('');
  const [provinsi, setProvinsi] = useState('');
  const [kabupaten, setKabupaten] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [desa, setDesa] = useState('');
  const [noHp, setNoHp] = useState('');
  const [namaTim, setNamaTim] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ id: 1, paket: '', bahan: '' }]);
  const [tglOrder, setTglOrder] = useState(today());
  const [deadline, setDeadline] = useState(weekLater());
  const [keterangan, setKeterangan] = useState('');
  const [kekurangan, setKekurangan] = useState('');
  const [selectedPromos, setSelectedPromos] = useState<string[]>([]);

  function addItem() {
    setItems(prev => [...prev, { id: Date.now(), paket: '', bahan: '' }]);
  }

  function removeItem(id: number) {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: number, field: 'paket' | 'bahan', value: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function togglePromo(id: string) {
    setSelectedPromos(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  function handleReset() {
    setCustomer(''); setAlamat(''); setProvinsi(''); setKabupaten('');
    setKecamatan(''); setDesa(''); setNoHp(''); setNamaTim('');
    setItems([{ id: 1, paket: '', bahan: '' }]); setTglOrder(today());
    setDeadline(weekLater()); setKeterangan(''); setKekurangan('');
    setSelectedPromos([]);
  }

  if (!open) return null;

  const inputCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm transition-colors';
  const selectCls = 'w-full bg-[#0d1117] border border-white/10 text-white focus:border-blue-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm transition-colors appearance-none cursor-pointer';
  const labelCls = 'block text-sm font-medium text-white mb-1.5';

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[440px] bg-[#0c1120] border-l border-white/[0.06] shadow-2xl shadow-black/50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-white">Buat Order Baru</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* ── Data Customer ── */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4">Data Customer</h3>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Nama Customer</label>
                <input type="text" value={customer} onChange={e => setCustomer(e.target.value)}
                  placeholder="Cari customer atau ketik nama baru..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Alamat Lengkap</label>
                <input type="text" value={alamat} onChange={e => setAlamat(e.target.value)}
                  placeholder="Jl. Contoh No. 123" className={inputCls} />
              </div>
              <div>
                <label className={`${labelCls} text-amber-400`}>Provinsi</label>
                <select value={provinsi} onChange={e => setProvinsi(e.target.value)} className={selectCls}>
                  <option value="">Pilih provinsi...</option>
                  <option value="jawa-timur">Jawa Timur</option>
                  <option value="jawa-tengah">Jawa Tengah</option>
                  <option value="jawa-barat">Jawa Barat</option>
                  <option value="dki-jakarta">DKI Jakarta</option>
                  <option value="bali">Bali</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Kabupaten/Kota</label>
                <select value={kabupaten} onChange={e => setKabupaten(e.target.value)} className={selectCls} disabled={!provinsi}>
                  <option value="">{provinsi ? 'Pilih kabupaten/kota...' : 'Pilih provinsi dulu'}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Kecamatan</label>
                  <select value={kecamatan} onChange={e => setKecamatan(e.target.value)} className={selectCls} disabled={!kabupaten}>
                    <option value="">{kabupaten ? 'Pilih kecamatan...' : 'Pilih kab/kota dulu'}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Desa/Kelurahan</label>
                  <select value={desa} onChange={e => setDesa(e.target.value)} className={selectCls} disabled={!kecamatan}>
                    <option value="">{kecamatan ? 'Pilih desa...' : 'Pilih kecamatan dulu'}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>No HP</label>
                <input type="tel" value={noHp} onChange={e => setNoHp(e.target.value)}
                  placeholder="08123456789" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Leads</label>
                <select className={selectCls}>
                  <option value="">Pilih leads...</option>
                  <option value="andi">Andi Setiawan - CS Eksternal</option>
                  <option value="dewi">Dewi Lestari - Reseller</option>
                  <option value="rizky">Rizky Fadillah - CS Eksternal</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Data Order ── */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4">Data Order</h3>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Nama Tim</label>
                <input type="text" value={namaTim} onChange={e => setNamaTim(e.target.value)}
                  placeholder="Nama tim" className={inputCls} />
              </div>

              {/* Item Order */}
              <div>
                <label className={labelCls}>Item Order</label>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex gap-2 items-center">
                      <select value={item.paket} onChange={e => updateItem(item.id, 'paket', e.target.value)}
                        className={`${selectCls} flex-1`}>
                        <option value="">Pilih paket</option>
                        {PAKET1_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <select value={item.bahan} onChange={e => updateItem(item.id, 'bahan', e.target.value)}
                        className={`${selectCls} flex-1`}>
                        <option value="">Pilih bahan</option>
                        {BAHAN_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <button onClick={() => removeItem(item.id)}
                        className={`shrink-0 text-slate-500 hover:text-red-400 transition-colors p-1 ${items.length <= 1 ? 'opacity-20 pointer-events-none' : ''}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addItem}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-white/10 text-sm text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Tambah Item
                </button>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${labelCls} text-amber-400`}>Tanggal Order</label>
                  <input type="date" value={tglOrder} onChange={e => setTglOrder(e.target.value)}
                    className={`${inputCls} date-input`} />
                </div>
                <div>
                  <label className={`${labelCls} text-amber-400`}>Estimasi Deadline</label>
                  <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                    className={`${inputCls} date-input`} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Keterangan</label>
                <textarea value={keterangan} onChange={e => setKeterangan(e.target.value)}
                  rows={3} placeholder="Detail tambahan untuk order ini..."
                  className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>

          {/* ── Kekurangan ── */}
          <div>
            <label className={`${labelCls} text-amber-400`}>Kekurangan</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">Rp</span>
              <input type="text" value={kekurangan} onChange={e => setKekurangan(e.target.value)}
                placeholder="0,00" className={`${inputCls} pl-10`} />
            </div>
          </div>

          {/* ── Promo ── */}
          <div>
            <label className={labelCls}>Promo yang Diambil (S&K berlaku)</label>
            <div className="space-y-3 mt-2">
              {PROMOS.map(promo => (
                <label key={promo.id}
                  className={`block p-4 rounded-lg border cursor-pointer transition-colors ${selectedPromos.includes(promo.id) ? 'border-blue-500/40 bg-blue-500/[0.06]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedPromos.includes(promo.id)}
                      onChange={() => togglePromo(promo.id)}
                      className="mt-1 w-4 h-4 rounded border-slate-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">{promo.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{promo.dateRange}</p>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed uppercase">{promo.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3 shrink-0">
          <button onClick={() => { handleReset(); onClose(); }}
            className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
            Batal
          </button>
          <button onClick={() => { /* TODO: save to DB later */ onClose(); }}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            Simpan
          </button>
        </div>
      </div>
    </>
  );
}
