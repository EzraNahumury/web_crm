'use client';
import { useState, useMemo, ReactNode } from 'react';

/* ═══ Tab config ═══ */
type TabKey = 'customer'|'paket'|'barang'|'tipe-barang'|'ukuran'|'pecah-pola'|'jabatan'|'karyawan'|'promo'|'leads';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'paket', label: 'Paket' },
  { key: 'barang', label: 'Barang' },
  { key: 'tipe-barang', label: 'Tipe Barang' },
  { key: 'ukuran', label: 'Ukuran' },
  { key: 'pecah-pola', label: 'Pecah Pola' },
  { key: 'jabatan', label: 'Jabatan' },
  { key: 'karyawan', label: 'Karyawan' },
  { key: 'promo', label: 'Promo' },
  { key: 'leads', label: 'Leads' },
];

/* ═══ Mock data ═══ */
const DATA_PAKET = ['CELANA NON PRINT','CELANA PRINT','CLASSIC A','CLASSIC B','CLASSIC C','CLASSIC D','JAKET','KAOS','KAOS KAKI','PRO A','PRO B','STANDAR A','STANDAR B'];
const DATA_BARANG = [
  { nama:'AUTHENTIC PRO (JOGLO)', tipe:'AKSESORIS', satuan:'PCS' },
  { nama:'AUTHENTIC WOVEN', tipe:'AKSESORIS', satuan:'PCS' },
  { nama:'TAFETA SAMPING (PRO)', tipe:'AKSESORIS', satuan:'PCS' },
  { nama:'TALI KOLOR CELANA', tipe:'AKSESORIS', satuan:'KILOGRAM' },
  { nama:'WASHTAG (LABEL SATIN)', tipe:'AKSESORIS', satuan:'PCS' },
  { nama:'WEBBING', tipe:'AKSESORIS', satuan:'METER' },
  { nama:'AIRWALK', tipe:'KAIN', satuan:'KILOGRAM' },
  { nama:'BENZEMA', tipe:'KAIN', satuan:'KILOGRAM' },
];
const DATA_TIPE = [{ nama:'AKSESORIS', desk:'' },{ nama:'KAIN', desk:'' },{ nama:'KERAH', desk:'TIPE KERAH' }];
const DATA_UKURAN = [
  { nama:'2XL', desk:'76 X 58' },{ nama:'2XL BARET', desk:'72 X 54' },{ nama:'2XL WANITA SLIMFIT', desk:'68 X 54' },
  { nama:'3XL', desk:'78 X 60' },{ nama:'3XL BARET', desk:'74 X 56' },{ nama:'3XL WANITA SLIMFIT', desk:'69 X 56' },
  { nama:'4XL', desk:'80 X 62' },{ nama:'4XL WANITA SLIMFIT', desk:'70 X 58' },{ nama:'5XL', desk:'82 X 64' },
];
const DATA_POLA = [
  { nama:'BADAN BELAKANG', ini:'BB' },{ nama:'BADAN DEPAN', ini:'BD' },{ nama:'CELANA', ini:'CELANA' },
  { nama:'KEMBEN', ini:'KEMBEN' },{ nama:'KERAH', ini:'KERAH' },{ nama:'KOMBINASI', ini:'KOMBINASI' },
];
const DATA_JABATAN = [{ nama:'Admin', desk:'Administrator sistem' },{ nama:'Finishing', desk:'Staff bagian finishing' },{ nama:'Operator Jahit', desk:'Operator mesin jahit' },{ nama:'QC', desk:'Quality Control' }];
const DATA_KARYAWAN = [{ nama:'Ezra Kristanto Nahumury', posisi:'Operator Jahit', telp:'55' }];
const DATA_LEADS = [
  { nama: 'Andi Setiawan', noHp: '081234567890', sumber: 'Instagram', jenisCs: 'CS Eksternal', catatan: 'Handle area Surabaya' },
  { nama: 'Dewi Lestari', noHp: '082198765432', sumber: 'WhatsApp', jenisCs: 'Reseller', catatan: 'Fokus paket Classic' },
  { nama: 'Rizky Fadillah', noHp: '085312345678', sumber: 'Referral', jenisCs: 'CS Eksternal', catatan: '-' },
];
const JENIS_CS_STYLE: Record<string, string> = {
  'CS Eksternal': 'text-blue-400 bg-blue-500/10',
  'Reseller': 'text-purple-400 bg-purple-500/10',
  'Agen': 'text-amber-400 bg-amber-500/10',
};
const DATA_PROMO = [
  { nama:'PROMO MARET', mulai:'2 Maret 2026', selesai:'30 April 2026', desk:'STANDAR : FREE LOGO 3D CLASSIC : FREE LOGO 3D & 1 BOLA/JERSEY PRO : FREE LOGO 3D, 1 BOLA, 1 JERSEY W...' },
  { nama:'CASHBACK', mulai:'28 Februari 2026', selesai:'31 Mei 2026', desk:'CASHBACK YANG BISA DI KLAIM SAAT ORDERAN SELESAI' },
  { nama:'PROMO FEBRUARI', mulai:'28 Februari 2026', selesai:'30 April 2026', desk:'STANDAR : FREE LOGO 3D FLOCK CLASSIC : FREE LOGO 3D FLOCK & BOLA / JERSEY TIM PRO : FREE LOGO 3D FLO...' },
  { nama:'Promo Oktober', mulai:'16 Oktober 2025', selesai:'28 Februari 2026', desk:'-' },
];

const inputCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/40 transition-colors';

/* ═══ Shared components ═══ */
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-4">
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-transparent text-white placeholder-slate-500 pl-10 pr-4 py-2.5 text-sm focus:outline-none" />
      </div>
    </div>
  );
}

function ActionBtns() {
  return (
    <div className="flex items-center gap-1.5">
      <button className="text-slate-500 hover:text-amber-400 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg></button>
      <button className="text-slate-500 hover:text-red-400 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
    </div>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 mt-6">
      <button onClick={onClose} className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
      <button onClick={onClose} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">Tambah</button>
    </div>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shrink-0">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      {label}
    </button>
  );
}

/* ═══ Main Page ═══ */
export default function MasterPage() {
  const [tab, setTab] = useState<TabKey>('customer');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);

  // Reset search when switching tabs
  const switchTab = (t: TabKey) => { setTab(t); setSearch(''); };

  const info: Record<TabKey, { title: string; subtitle: string; addLabel: string; searchPlaceholder: string }> = {
    customer:      { title: 'Master Data Customer', subtitle: 'Kelola data semua pelanggan Anda.', addLabel: 'Tambah Customer', searchPlaceholder: 'Cari customer...' },
    paket:         { title: 'Master Data Paket', subtitle: 'Kelola jenis paket produk yang ditawarkan.', addLabel: 'Tambah Paket', searchPlaceholder: 'Cari nama paket...' },
    barang:        { title: 'Master Data Barang', subtitle: 'Kelola daftar semua barang mentah untuk produksi.', addLabel: 'Tambah Barang', searchPlaceholder: 'Cari nama barang...' },
    'tipe-barang': { title: 'Master Data Tipe Barang', subtitle: 'Kelola daftar semua tipe barang jadi.', addLabel: 'Tambah Tipe Barang', searchPlaceholder: 'Cari nama tipe barang...' },
    ukuran:        { title: 'Master Data Ukuran', subtitle: 'Kelola daftar semua ukuran produk.', addLabel: 'Tambah Ukuran', searchPlaceholder: 'Cari nama ukuran...' },
    'pecah-pola':  { title: 'Master Data Pecah Pola', subtitle: 'Kelola daftar semua pecah pola produksi.', addLabel: 'Tambah Pecah Pola', searchPlaceholder: 'Cari nama pecah pola...' },
    jabatan:       { title: 'Master Data Jabatan', subtitle: 'Kelola daftar semua jabatan karyawan.', addLabel: 'Tambah Jabatan', searchPlaceholder: 'Cari nama jabatan...' },
    karyawan:      { title: 'Master Data Karyawan', subtitle: 'Kelola data karyawan dan unit produksi.', addLabel: 'Tambah Karyawan', searchPlaceholder: 'Cari nama atau posisi...' },
    promo:         { title: 'Master Data Promo', subtitle: 'Kelola data semua promo Anda.', addLabel: 'Tambah Promo', searchPlaceholder: 'Cari promo...' },
    leads:         { title: 'Master Data Leads', subtitle: 'Kelola data CS eksternal yang membawa order.', addLabel: 'Tambah Lead', searchPlaceholder: 'Cari nama atau kota...' },
  };

  const cur = info[tab];

  return (
    <div className="space-y-0">
      {/* Tab nav */}
      <div className="border-b border-white/[0.06] -mx-6 px-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'text-blue-400 border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 pt-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{cur.title}</h1>
            <p className="text-sm text-slate-400 mt-1">{cur.subtitle}</p>
          </div>
          <AddBtn label={cur.addLabel} onClick={() => setModal(true)} />
        </div>

        {/* Search */}
        <SearchBar value={search} onChange={setSearch} placeholder={cur.searchPlaceholder} />

        {/* Table content per tab */}
        {tab === 'customer' && <CustomerTab search={search} />}
        {tab === 'paket' && <PaketTab search={search} />}
        {tab === 'barang' && <BarangTab search={search} />}
        {tab === 'tipe-barang' && <NameDescTab data={DATA_TIPE} col1="NAMA TIPE" col2="DESKRIPSI" search={search} />}
        {tab === 'ukuran' && <NameDescTab data={DATA_UKURAN} col1="NAMA UKURAN" col2="DESKRIPSI" search={search} />}
        {tab === 'pecah-pola' && <NameDescTab data={DATA_POLA.map(p => ({ nama: p.nama, desk: p.ini }))} col1="NAMA PECAH POLA" col2="INISIAL" search={search} />}
        {tab === 'jabatan' && <NameDescTab data={DATA_JABATAN} col1="NAMA JABATAN" col2="DESKRIPSI" search={search} />}
        {tab === 'karyawan' && <KaryawanTab search={search} />}
        {tab === 'promo' && <PromoTab search={search} />}
        {tab === 'leads' && <LeadsTab search={search} />}
      </div>

      {/* ═══ Modals ═══ */}
      {/* Customer */}
      <Modal open={modal && tab === 'customer'} onClose={() => setModal(false)} title="Tambah Customer Baru">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-white mb-1.5">Nama Customer *</label><input className={inputCls} placeholder="Nama customer" /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">No HP</label><input className={inputCls} placeholder="08xxxxxxxxxx" /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Alamat Lengkap</label><textarea rows={2} className={`${inputCls} resize-none`} placeholder="Alamat lengkap" /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Kota</label><input className={inputCls} placeholder="Kota" /></div>
        </div>
        <ModalFooter onClose={() => setModal(false)} />
      </Modal>

      {/* Paket */}
      <Modal open={modal && tab === 'paket'} onClose={() => setModal(false)} title="Tambah Paket Baru">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-white mb-1.5">Nama Paket</label><input className={inputCls} placeholder="e.g., KAOS" /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Deskripsi (Opsional)</label><input className={inputCls} placeholder="Deskripsi paket..." /></div>
        </div>
        <ModalFooter onClose={() => setModal(false)} />
      </Modal>

      {/* Barang */}
      <Modal open={modal && tab === 'barang'} onClose={() => setModal(false)} title="Tambah Barang Baru">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-white mb-1.5">Nama Barang *</label><input className={inputCls} /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Tipe Barang *</label>
            <select className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">Pilih tipe barang</option>
              {DATA_TIPE.map(t => <option key={t.nama} value={t.nama}>{t.nama}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Satuan *</label><input className={inputCls} placeholder="contoh: meter, kg, pcs" /></div>
        </div>
        <ModalFooter onClose={() => setModal(false)} />
      </Modal>

      {/* Tipe Barang / Ukuran / Jabatan (name+desc) */}
      <Modal open={modal && (tab === 'tipe-barang' || tab === 'ukuran' || tab === 'jabatan')} onClose={() => setModal(false)}
        title={`Tambah ${tab === 'tipe-barang' ? 'Tipe Barang' : tab === 'ukuran' ? 'Ukuran' : 'Jabatan'} Baru`}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-white mb-1.5">{tab === 'tipe-barang' ? 'Nama Tipe Barang' : tab === 'ukuran' ? 'Nama Ukuran' : 'Nama Jabatan'} *</label><input className={inputCls} /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Deskripsi</label><textarea rows={3} className={`${inputCls} resize-none`} /></div>
        </div>
        <ModalFooter onClose={() => setModal(false)} />
      </Modal>

      {/* Pecah Pola */}
      <Modal open={modal && tab === 'pecah-pola'} onClose={() => setModal(false)} title="Tambah Pecah Pola Baru">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-white mb-1.5">Nama Pecah Pola *</label><input className={inputCls} /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Inisial</label><textarea rows={3} className={`${inputCls} resize-none`} /></div>
        </div>
        <ModalFooter onClose={() => setModal(false)} />
      </Modal>

      {/* Karyawan */}
      <Modal open={modal && tab === 'karyawan'} onClose={() => setModal(false)} title="Tambah Karyawan Baru">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-white mb-1.5">Nama Karyawan</label><input className={inputCls} /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Posisi / Jabatan</label>
            <select className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">Pilih Posisi</option>
              {DATA_JABATAN.map(j => <option key={j.nama} value={j.nama}>{j.nama}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Nomor Telepon</label><input className={inputCls} /></div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
          <button onClick={() => setModal(false)} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">Simpan</button>
        </div>
      </Modal>

      {/* Promo */}
      <Modal open={modal && tab === 'promo'} onClose={() => setModal(false)} title="Tambah Promo Baru">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-white mb-1.5">Nama Promo</label><input className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-white mb-1.5">Periode Mulai</label><input type="date" className={`${inputCls} date-input`} /></div>
            <div><label className="block text-sm font-medium text-white mb-1.5">Periode Selesai</label><input type="date" className={`${inputCls} date-input`} /></div>
          </div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Deskripsi (Opsional)</label><textarea rows={3} className={`${inputCls} resize-none`} /></div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
          <button onClick={() => setModal(false)} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">Simpan</button>
        </div>
      </Modal>

      {/* Leads */}
      <Modal open={modal && tab === 'leads'} onClose={() => setModal(false)} title="Tambah Lead Baru">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-white mb-1.5">Nama *</label><input className={inputCls} placeholder="Nama calon pelanggan" /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">No HP *</label><input className={inputCls} placeholder="08xxxxxxxxxx" /></div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Sumber</label>
            <select className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">Pilih sumber</option>
              <option>Instagram</option><option>WhatsApp</option><option>Facebook</option><option>Referral</option><option>Website</option><option>Lainnya</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Jenis CS</label>
            <select className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">Pilih jenis CS</option>
              <option>CS Eksternal</option><option>Reseller</option><option>Agen</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Catatan</label><textarea rows={2} className={`${inputCls} resize-none`} placeholder="Catatan tentang lead ini..." /></div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
          <button onClick={() => setModal(false)} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">Simpan</button>
        </div>
      </Modal>
    </div>
  );
}

/* ═══ Tab components ═══ */

function CustomerTab({ search }: { search: string }) {
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <table className="w-full">
        <thead><tr className="border-b border-white/[0.06]">
          {['NAMA','NO HP','ALAMAT LENGKAP','KOTA','AKSI'].map(h => (
            <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          <tr><td colSpan={5} className="px-5 py-12 text-center">
            <p className="text-base font-semibold text-white mb-1">Belum ada customer</p>
            <p className="text-sm text-slate-500">Mulai tambahkan customer pertama Anda dengan klik tombol &quot;Tambah Customer&quot; di atas.</p>
          </td></tr>
        </tbody>
      </table>
    </div>
  );
}

function PaketTab({ search }: { search: string }) {
  const filtered = DATA_PAKET.filter(p => !search || p.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <table className="w-full">
        <thead><tr className="border-b border-white/[0.06]">
          <th className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">NAMA PAKET</th>
          <th className="text-[11px] text-slate-500 font-medium text-right px-5 py-3.5 uppercase tracking-wider">AKSI</th>
        </tr></thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-4 text-sm font-medium text-white">{p}</td>
              <td className="px-5 py-4 text-right"><ActionBtns /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarangTab({ search }: { search: string }) {
  const filtered = DATA_BARANG.filter(b => !search || b.nama.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead><tr className="border-b border-white/[0.06]">
            {['NAMA BARANG','TIPE','SATUAN','AKSI'].map(h => (
              <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.nama} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-4 text-sm font-medium text-white">{b.nama}</td>
                <td className="px-5 py-4 text-sm text-slate-400">{b.tipe}</td>
                <td className="px-5 py-4 text-sm text-slate-400">{b.satuan}</td>
                <td className="px-5 py-4"><ActionBtns /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NameDescTab({ data, col1, col2, search }: { data: { nama: string; desk: string }[]; col1: string; col2: string; search: string }) {
  const filtered = data.filter(d => !search || d.nama.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <table className="w-full">
        <thead><tr className="border-b border-white/[0.06]">
          <th className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{col1}</th>
          <th className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{col2}</th>
          <th className="text-[11px] text-slate-500 font-medium text-right px-5 py-3.5 uppercase tracking-wider">AKSI</th>
        </tr></thead>
        <tbody>
          {filtered.map(d => (
            <tr key={d.nama} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-4 text-sm font-medium text-white">{d.nama}</td>
              <td className="px-5 py-4 text-sm text-slate-400">{d.desk || '-'}</td>
              <td className="px-5 py-4 text-right"><ActionBtns /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KaryawanTab({ search }: { search: string }) {
  const filtered = DATA_KARYAWAN.filter(k => !search || k.nama.toLowerCase().includes(search.toLowerCase()) || k.posisi.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <table className="w-full">
        <thead><tr className="border-b border-white/[0.06]">
          {['NAMA KARYAWAN','POSISI','TELEPON','AKSI'].map(h => (
            <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {filtered.map(k => (
            <tr key={k.nama} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-4 text-sm font-medium text-white">{k.nama}</td>
              <td className="px-5 py-4 text-sm text-slate-400">{k.posisi}</td>
              <td className="px-5 py-4 text-sm text-slate-400">{k.telp}</td>
              <td className="px-5 py-4"><ActionBtns /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PromoTab({ search }: { search: string }) {
  const filtered = DATA_PROMO.filter(p => !search || p.nama.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead><tr className="border-b border-white/[0.06]">
            {['NAMA PROMO','PERIODE MULAI','PERIODE SELESAI','DESKRIPSI','AKSI'].map(h => (
              <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.nama} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-4 text-sm font-medium text-white">{p.nama}</td>
                <td className="px-5 py-4 text-sm text-slate-400">{p.mulai}</td>
                <td className="px-5 py-4 text-sm text-slate-400">{p.selesai}</td>
                <td className="px-5 py-4 text-sm text-slate-400 max-w-[300px] truncate">{p.desk}</td>
                <td className="px-5 py-4"><ActionBtns /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadsTab({ search }: { search: string }) {
  const filtered = DATA_LEADS.filter(l => !search || l.nama.toLowerCase().includes(search.toLowerCase()) || l.sumber.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[750px]">
          <thead><tr className="border-b border-white/[0.06]">
            {['NAMA','NO HP','SUMBER','JENIS CS','CATATAN','AKSI'].map(h => (
              <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center">
                <p className="text-base font-semibold text-white mb-1">Belum ada leads</p>
                <p className="text-sm text-slate-500">Mulai tambahkan lead pertama dengan klik tombol &quot;Tambah Lead&quot; di atas.</p>
              </td></tr>
            ) : filtered.map(l => (
              <tr key={l.noHp} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-4 text-sm font-medium text-white">{l.nama}</td>
                <td className="px-5 py-4 text-sm text-slate-400">{l.noHp}</td>
                <td className="px-5 py-4 text-sm text-slate-400">{l.sumber}</td>
                <td className="px-5 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${JENIS_CS_STYLE[l.jenisCs] || 'text-slate-400 bg-slate-500/10'}`}>{l.jenisCs}</span>
                </td>
                <td className="px-5 py-4 text-sm text-slate-400 max-w-[200px] truncate">{l.catatan}</td>
                <td className="px-5 py-4"><ActionBtns /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
