'use client';
import { useState, useEffect, useCallback, ReactNode } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

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

// Map tab key to DB table name
const TABLE_MAP: Record<TabKey, string> = {
  customer: 'customers', paket: 'paket', barang: 'barang', 'tipe-barang': 'tipe_barang',
  ukuran: 'ukuran', 'pecah-pola': 'pecah_pola', jabatan: 'jabatan', karyawan: 'karyawan',
  promo: 'promo', leads: 'leads',
};

const JENIS_CS_STYLE: Record<string, string> = {
  'CS Eksternal': 'text-blue-400 bg-blue-500/10',
  'Reseller': 'text-purple-400 bg-purple-500/10',
  'Agen': 'text-amber-400 bg-amber-500/10',
};

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

function ActionBtns({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onEdit} className="text-slate-500 hover:text-amber-400 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg></button>
      <button onClick={onDelete} className="text-slate-500 hover:text-red-400 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
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

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shrink-0">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      {label}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <tr><td colSpan={10} className="px-5 py-12 text-center">
      <p className="text-base font-semibold text-white mb-1">Belum ada data</p>
      <p className="text-sm text-slate-500">Mulai tambahkan {label} pertama dengan klik tombol di atas.</p>
    </td></tr>
  );
}

/* ═══ Main Page ═══ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export default function MasterPage() {
  const [tab, setTab] = useState<TabKey>('customer');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  // Extra data for dropdowns
  const [jabatanList, setJabatanList] = useState<Row[]>([]);
  const [tipeBarangList, setTipeBarangList] = useState<Row[]>([]);

  const tableName = TABLE_MAP[tab];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dbGet(tableName, search || undefined);
      setRows(data);
    } catch { setRows([]); }
    setLoading(false);
  }, [tableName, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load dropdown data for karyawan and barang tabs
  useEffect(() => {
    if (tab === 'karyawan') dbGet('jabatan').then(setJabatanList).catch(() => {});
    if (tab === 'barang') dbGet('tipe_barang').then(setTipeBarangList).catch(() => {});
  }, [tab]);

  const switchTab = (t: TabKey) => { setTab(t); setSearch(''); };

  async function handleDelete(id: number) {
    const yes = await toast.confirm({ title: 'Hapus Data?', message: 'Data ini akan dihapus permanen.', type: 'danger', confirmText: 'Ya, Hapus' });
    if (!yes) return;
    await dbDelete(tableName, id);
    toast.deleted('Data Dihapus');
    fetchData();
  }

  function handleEdit(row: Row) {
    setEditingRow(row);
    setModal(true);
  }

  async function handleSave(data: Row) {
    setSaving(true);
    try {
      if (editingRow) {
        await dbUpdate(tableName, editingRow.id, data);
        toast.success('Data Diperbarui', 'Perubahan berhasil disimpan.');
      } else {
        await dbCreate(tableName, data);
        toast.success('Data Ditambahkan', 'Data berhasil disimpan.');
      }
      setModal(false);
      setEditingRow(null);
      fetchData();
    } catch (e) { toast.error('Gagal Menyimpan', String(e)); }
    setSaving(false);
  }

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
  const fmtDate = (d: string) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{cur.title}</h1>
            <p className="text-sm text-slate-400 mt-1">{cur.subtitle}</p>
          </div>
          <AddBtn label={cur.addLabel} onClick={() => { setEditingRow(null); setModal(true); }} />
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder={cur.searchPlaceholder} />

        {/* Table */}
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">Memuat data...</div>
          ) : (
            <div className="overflow-x-auto">
              {tab === 'customer' && <TableCustomer rows={rows} onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'paket' && <TableSimple rows={rows} col="nama" header="NAMA PAKET" onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'barang' && <TableBarang rows={rows} onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'tipe-barang' && <TableNameDesc rows={rows} col1="nama" col2="deskripsi" h1="NAMA TIPE" h2="DESKRIPSI" onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'ukuran' && <TableNameDesc rows={rows} col1="nama" col2="deskripsi" h1="NAMA UKURAN" h2="DESKRIPSI" onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'pecah-pola' && <TableNameDesc rows={rows} col1="nama" col2="inisial" h1="NAMA PECAH POLA" h2="INISIAL" onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'jabatan' && <TableNameDesc rows={rows} col1="nama" col2="deskripsi" h1="NAMA JABATAN" h2="DESKRIPSI" onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'karyawan' && <TableKaryawan rows={rows} onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'promo' && <TablePromo rows={rows} fmtDate={fmtDate} onEdit={handleEdit} onDelete={handleDelete} />}
              {tab === 'leads' && <TableLeads rows={rows} onEdit={handleEdit} onDelete={handleDelete} />}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Modals ═══ */}
      <ModalForm tab={tab} open={modal} onClose={() => { setModal(false); setEditingRow(null); }} onSave={handleSave}
        saving={saving} jabatanList={jabatanList} tipeBarangList={tipeBarangList} editingRow={editingRow} />
    </div>
  );
}

/* ═══ Modal Form ═══ */
function ModalForm({ tab, open, onClose, onSave, saving, jabatanList, tipeBarangList, editingRow }: {
  tab: TabKey; open: boolean; onClose: () => void; onSave: (data: Row) => void;
  saving: boolean; jabatanList: Row[]; tipeBarangList: Row[]; editingRow: Row | null;
}) {
  const [form, setForm] = useState<Row>({});
  const isEdit = !!editingRow;
  useEffect(() => {
    if (open) {
      if (editingRow) {
        // Pre-fill form, exclude non-column fields (id, timestamps, JOIN aliases)
        const exclude = new Set(['id', 'created_at', 'updated_at', 'jabatan_nama', 'tipe_nama']);
        const rest: Row = {};
        for (const [k, v] of Object.entries(editingRow)) {
          if (!exclude.has(k)) rest[k] = v;
        }
        setForm(rest);
      } else {
        setForm({});
      }
    }
  }, [open, editingRow]);
  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const submit = () => onSave(form);
  const footer = (
    <div className="flex items-center justify-end gap-3 mt-6">
      <button onClick={onClose} className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
      <button onClick={submit} disabled={saving} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">{saving ? 'Menyimpan...' : 'Simpan'}</button>
    </div>
  );

  const labels: Record<TabKey, string> = {
    customer: 'Customer', paket: 'Paket', barang: 'Barang',
    'tipe-barang': 'Tipe Barang', ukuran: 'Ukuran', 'pecah-pola': 'Pecah Pola',
    jabatan: 'Jabatan', karyawan: 'Karyawan', promo: 'Promo', leads: 'Lead',
  };
  const modalTitle = isEdit ? `Edit ${labels[tab]}` : `Tambah ${labels[tab]} Baru`;

  return (
    <Modal open={open} onClose={onClose} title={modalTitle}>
      <div className="space-y-4">
        {tab === 'customer' && <>
          <Field label="Nama *" value={form.nama} onChange={v => set('nama', v)} />
          <Field label="No HP *" value={form.no_hp} onChange={v => set('no_hp', v)} placeholder="08xxxxxxxxxx" />
          <Field label="Alamat Lengkap" value={form.alamat_lengkap} onChange={v => set('alamat_lengkap', v)} placeholder="Jalan, nomor, RT/RW" />
          <RegionFields form={form} set={set} />
        </>}
        {tab === 'paket' && <>
          <Field label="Nama Paket" value={form.nama} onChange={v => set('nama', v)} placeholder="e.g., KAOS" />
          <Field label="Deskripsi (Opsional)" value={form.deskripsi} onChange={v => set('deskripsi', v)} />
        </>}
        {tab === 'barang' && <>
          <Field label="Nama Barang *" value={form.nama} onChange={v => set('nama', v)} />
          <div><label className="block text-sm font-medium text-white mb-1.5">Tipe Barang *</label>
            <select value={form.tipe_barang_id || ''} onChange={e => set('tipe_barang_id', e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">Pilih tipe barang</option>
              {tipeBarangList.map((t: Row) => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select>
          </div>
          <Field label="Satuan *" value={form.satuan} onChange={v => set('satuan', v)} placeholder="PCS, KILOGRAM, METER" />
        </>}
        {(tab === 'tipe-barang' || tab === 'ukuran' || tab === 'jabatan') && <>
          <Field label={tab === 'tipe-barang' ? 'Nama Tipe Barang *' : tab === 'ukuran' ? 'Nama Ukuran *' : 'Nama Jabatan *'} value={form.nama} onChange={v => set('nama', v)} />
          <Field label="Deskripsi" value={form.deskripsi} onChange={v => set('deskripsi', v)} textarea />
        </>}
        {tab === 'pecah-pola' && <>
          <Field label="Nama Pecah Pola *" value={form.nama} onChange={v => set('nama', v)} />
          <Field label="Inisial" value={form.inisial} onChange={v => set('inisial', v)} />
        </>}
        {tab === 'karyawan' && <>
          <Field label="Nama Karyawan" value={form.nama} onChange={v => set('nama', v)} />
          <div><label className="block text-sm font-medium text-white mb-1.5">Posisi / Jabatan</label>
            <select value={form.jabatan_id || ''} onChange={e => set('jabatan_id', e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">Pilih Posisi</option>
              {jabatanList.map((j: Row) => <option key={j.id} value={j.id}>{j.nama}</option>)}
            </select>
          </div>
          <Field label="Nomor Telepon" value={form.telepon} onChange={v => set('telepon', v)} />
        </>}
        {tab === 'promo' && <>
          <Field label="Nama Promo" value={form.nama} onChange={v => set('nama', v)} />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-white mb-1.5">Periode Mulai</label><input type="date" value={form.periode_mulai || ''} onChange={e => set('periode_mulai', e.target.value)} className={`${inputCls} date-input`} /></div>
            <div><label className="block text-sm font-medium text-white mb-1.5">Periode Selesai</label><input type="date" value={form.periode_selesai || ''} onChange={e => set('periode_selesai', e.target.value)} className={`${inputCls} date-input`} /></div>
          </div>
          <Field label="Deskripsi (Opsional)" value={form.deskripsi} onChange={v => set('deskripsi', v)} textarea />
        </>}
        {tab === 'leads' && <>
          <Field label="Nama *" value={form.nama} onChange={v => set('nama', v)} />
          <Field label="No HP *" value={form.no_hp} onChange={v => set('no_hp', v)} placeholder="08xxxxxxxxxx" />
          <div><label className="block text-sm font-medium text-white mb-1.5">Sumber</label>
            <select value={form.sumber || ''} onChange={e => set('sumber', e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">Pilih sumber</option>
              {['Instagram','WhatsApp','Facebook','Referral','Website','Lainnya'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-white mb-1.5">Jenis CS</label>
            <select value={form.jenis_cs || ''} onChange={e => set('jenis_cs', e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">Pilih jenis CS</option>
              {['CS Eksternal','Reseller','Agen'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <Field label="Catatan" value={form.catatan} onChange={v => set('catatan', v)} textarea />
        </>}
      </div>
      {footer}
    </Modal>
  );
}

/* ═══ Region cascading dropdowns ═══ */
const REGION_API = 'https://www.emsifa.com/api-wilayah-indonesia/api';

interface RegionItem { id: string; name: string }

function RegionFields({ form, set }: { form: Row; set: (k: string, v: string) => void }) {
  const [provinces, setProvinces] = useState<RegionItem[]>([]);
  const [cities, setCities] = useState<RegionItem[]>([]);
  const [districts, setDistricts] = useState<RegionItem[]>([]);
  const [villages, setVillages] = useState<RegionItem[]>([]);

  // Internal IDs for cascading
  const [provId, setProvId] = useState('');
  const [cityId, setCityId] = useState('');
  const [distId, setDistId] = useState('');

  useEffect(() => {
    fetch(`${REGION_API}/provinces.json`).then(r => r.json()).then(setProvinces).catch(() => {});
  }, []);

  const handleProvince = (id: string) => {
    const name = provinces.find(p => p.id === id)?.name || '';
    setProvId(id);
    set('provinsi', name);
    setCityId(''); set('kabupaten_kota', '');
    setDistId(''); set('kecamatan', '');
    set('desa_kelurahan', '');
    setCities([]); setDistricts([]); setVillages([]);
    if (id) fetch(`${REGION_API}/regencies/${id}.json`).then(r => r.json()).then(setCities).catch(() => {});
  };

  const handleCity = (id: string) => {
    const name = cities.find(c => c.id === id)?.name || '';
    setCityId(id);
    set('kabupaten_kota', name);
    setDistId(''); set('kecamatan', '');
    set('desa_kelurahan', '');
    setDistricts([]); setVillages([]);
    if (id) fetch(`${REGION_API}/districts/${id}.json`).then(r => r.json()).then(setDistricts).catch(() => {});
  };

  const handleDistrict = (id: string) => {
    const name = districts.find(d => d.id === id)?.name || '';
    setDistId(id);
    set('kecamatan', name);
    set('desa_kelurahan', '');
    setVillages([]);
    if (id) fetch(`${REGION_API}/villages/${id}.json`).then(r => r.json()).then(setVillages).catch(() => {});
  };

  const handleVillage = (id: string) => {
    const name = villages.find(v => v.id === id)?.name || '';
    set('desa_kelurahan', name);
  };

  const selectCls = `${inputCls} appearance-none cursor-pointer`;
  const disabledCls = `${inputCls} opacity-50 cursor-not-allowed`;

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">Provinsi</label>
        <select value={provId} onChange={e => handleProvince(e.target.value)} className={selectCls}>
          <option value="">Pilih provinsi...</option>
          {provinces.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">Kab/Kota</label>
        <select value={cityId} onChange={e => handleCity(e.target.value)}
          className={provId ? selectCls : disabledCls} disabled={!provId}>
          <option value="">{provId ? 'Pilih kab/kota...' : 'Pilih provinsi dulu'}</option>
          {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">Kecamatan</label>
        <select value={distId} onChange={e => handleDistrict(e.target.value)}
          className={cityId ? selectCls : disabledCls} disabled={!cityId}>
          <option value="">{cityId ? 'Pilih kecamatan...' : 'Pilih kabupaten/kota dulu'}</option>
          {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">Desa/Kel</label>
        <select value={villages.find(v => v.name === form.desa_kelurahan)?.id || ''} onChange={e => handleVillage(e.target.value)}
          className={distId ? selectCls : disabledCls} disabled={!distId}>
          <option value="">{distId ? 'Pilih desa/kelurahan...' : 'Pilih kecamatan dulu'}</option>
          {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
    </>
  );
}

function Field({ label, value, onChange, placeholder, textarea }: {
  label: string; value?: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-1.5">{label}</label>
      {textarea
        ? <textarea rows={3} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} resize-none`} />
        : <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
      }
    </div>
  );
}

/* ═══ Table components ═══ */
function TableCustomer({ rows, onEdit, onDelete }: { rows: Row[]; onEdit: (r: Row) => void; onDelete: (id: number) => void }) {
  return (
    <table className="w-full min-w-[700px]"><thead><tr className="border-b border-white/[0.06]">
      {['NAMA','NO HP','ALAMAT','WILAYAH','AKSI'].map(h => <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>)}
    </tr></thead><tbody>
      {rows.length === 0 ? <EmptyState label="customer" /> : rows.map(r => {
        const wilayah = [r.desa_kelurahan, r.kecamatan, r.kabupaten_kota, r.provinsi].filter(Boolean).join(', ');
        return (
          <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
            <td className="px-5 py-4 text-sm font-medium text-white">{r.nama}</td>
            <td className="px-5 py-4 text-sm text-slate-400">{r.no_hp || '-'}</td>
            <td className="px-5 py-4 text-sm text-slate-400 max-w-[200px] truncate">{r.alamat_lengkap || '-'}</td>
            <td className="px-5 py-4 text-sm text-slate-400 max-w-[250px] truncate">{wilayah || '-'}</td>
            <td className="px-5 py-4"><ActionBtns onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} /></td>
          </tr>
        );
      })}
    </tbody></table>
  );
}

function TableSimple({ rows, col, header, onEdit, onDelete }: { rows: Row[]; col: string; header: string; onEdit: (r: Row) => void; onDelete: (id: number) => void }) {
  return (
    <table className="w-full"><thead><tr className="border-b border-white/[0.06]">
      <th className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{header}</th>
      <th className="text-[11px] text-slate-500 font-medium text-right px-5 py-3.5 uppercase tracking-wider">AKSI</th>
    </tr></thead><tbody>
      {rows.length === 0 ? <EmptyState label="data" /> : rows.map(r => (
        <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
          <td className="px-5 py-4 text-sm font-medium text-white">{r[col]}</td>
          <td className="px-5 py-4 text-right"><ActionBtns onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} /></td>
        </tr>
      ))}
    </tbody></table>
  );
}

function TableBarang({ rows, onEdit, onDelete }: { rows: Row[]; onEdit: (r: Row) => void; onDelete: (id: number) => void }) {
  return (
    <table className="w-full min-w-[600px]"><thead><tr className="border-b border-white/[0.06]">
      {['NAMA BARANG','TIPE','SATUAN','AKSI'].map(h => <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>)}
    </tr></thead><tbody>
      {rows.length === 0 ? <EmptyState label="barang" /> : rows.map(r => (
        <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
          <td className="px-5 py-4 text-sm font-medium text-white">{r.nama}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{r.tipe_nama || '-'}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{r.satuan}</td>
          <td className="px-5 py-4"><ActionBtns onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} /></td>
        </tr>
      ))}
    </tbody></table>
  );
}

function TableNameDesc({ rows, col1, col2, h1, h2, onEdit, onDelete }: { rows: Row[]; col1: string; col2: string; h1: string; h2: string; onEdit: (r: Row) => void; onDelete: (id: number) => void }) {
  return (
    <table className="w-full"><thead><tr className="border-b border-white/[0.06]">
      <th className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h1}</th>
      <th className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h2}</th>
      <th className="text-[11px] text-slate-500 font-medium text-right px-5 py-3.5 uppercase tracking-wider">AKSI</th>
    </tr></thead><tbody>
      {rows.length === 0 ? <EmptyState label="data" /> : rows.map(r => (
        <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
          <td className="px-5 py-4 text-sm font-medium text-white">{r[col1]}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{r[col2] || '-'}</td>
          <td className="px-5 py-4 text-right"><ActionBtns onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} /></td>
        </tr>
      ))}
    </tbody></table>
  );
}

function TableKaryawan({ rows, onEdit, onDelete }: { rows: Row[]; onEdit: (r: Row) => void; onDelete: (id: number) => void }) {
  return (
    <table className="w-full"><thead><tr className="border-b border-white/[0.06]">
      {['NAMA KARYAWAN','POSISI','TELEPON','AKSI'].map(h => <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>)}
    </tr></thead><tbody>
      {rows.length === 0 ? <EmptyState label="karyawan" /> : rows.map(r => (
        <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
          <td className="px-5 py-4 text-sm font-medium text-white">{r.nama}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{r.jabatan_nama || '-'}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{r.telepon || '-'}</td>
          <td className="px-5 py-4"><ActionBtns onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} /></td>
        </tr>
      ))}
    </tbody></table>
  );
}

function TablePromo({ rows, fmtDate, onEdit, onDelete }: { rows: Row[]; fmtDate: (d: string) => string; onEdit: (r: Row) => void; onDelete: (id: number) => void }) {
  return (
    <table className="w-full min-w-[800px]"><thead><tr className="border-b border-white/[0.06]">
      {['NAMA PROMO','PERIODE MULAI','PERIODE SELESAI','DESKRIPSI','AKSI'].map(h => <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>)}
    </tr></thead><tbody>
      {rows.length === 0 ? <EmptyState label="promo" /> : rows.map(r => (
        <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
          <td className="px-5 py-4 text-sm font-medium text-white">{r.nama}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(r.periode_mulai)}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{fmtDate(r.periode_selesai)}</td>
          <td className="px-5 py-4 text-sm text-slate-400 max-w-[300px] truncate">{r.deskripsi || '-'}</td>
          <td className="px-5 py-4"><ActionBtns onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} /></td>
        </tr>
      ))}
    </tbody></table>
  );
}

function TableLeads({ rows, onEdit, onDelete }: { rows: Row[]; onEdit: (r: Row) => void; onDelete: (id: number) => void }) {
  return (
    <table className="w-full min-w-[750px]"><thead><tr className="border-b border-white/[0.06]">
      {['NAMA','NO HP','SUMBER','JENIS CS','CATATAN','AKSI'].map(h => <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>)}
    </tr></thead><tbody>
      {rows.length === 0 ? <EmptyState label="leads" /> : rows.map(r => (
        <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
          <td className="px-5 py-4 text-sm font-medium text-white">{r.nama}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{r.no_hp}</td>
          <td className="px-5 py-4 text-sm text-slate-400">{r.sumber || '-'}</td>
          <td className="px-5 py-4"><span className={`text-xs font-medium px-2.5 py-1 rounded-full ${JENIS_CS_STYLE[r.jenis_cs] || 'text-slate-400 bg-slate-500/10'}`}>{r.jenis_cs || '-'}</span></td>
          <td className="px-5 py-4 text-sm text-slate-400 max-w-[200px] truncate">{r.catatan || '-'}</td>
          <td className="px-5 py-4"><ActionBtns onEdit={() => onEdit(r)} onDelete={() => onDelete(r.id)} /></td>
        </tr>
      ))}
    </tbody></table>
  );
}
