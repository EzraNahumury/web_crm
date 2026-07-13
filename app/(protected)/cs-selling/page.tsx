'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { dbGet, dbCreate } from '@/lib/api-db';
import { invalidateCache } from '@/lib/cache';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const WILAYAH_API = 'https://www.emsifa.com/api-wilayah-indonesia/api';
interface Wilayah { id: string; name: string }

function useWilayah(level: string, parentId?: string) {
  const [data, setData] = useState<Wilayah[]>([]);
  useEffect(() => {
    if (level === 'provinces') {
      fetch(`${WILAYAH_API}/provinces.json`).then(r => r.json()).then(setData).catch(() => {});
    } else if (parentId) {
      fetch(`${WILAYAH_API}/${level}/${parentId}.json`).then(r => r.json()).then(setData).catch(() => {});
    } else {
      setData([]);
    }
  }, [level, parentId]);
  return { data };
}

function fmtRp(n: number) { return new Intl.NumberFormat('id-ID').format(n); }
function parseRp(s: string): number { return parseInt(s.replace(/\D/g, ''), 10) || 0; }

const BANK_OPTIONS = ['BRI', 'BCA', 'BNI', 'MANDIRI', 'DANA', 'WISE', 'FLIP', 'F-BANK', 'SHOOPE PAY', 'GOPAY'];
const METHOD_OPTIONS = ['TF', 'QRIS', 'DLL'];

interface Option { value: string; label: string; sublabel?: string }
function SearchableSelect({
  value, options, placeholder = 'Pilih...', disabled, onChange, maxHeight = 240,
}: {
  value: string; options: Option[]; placeholder?: string; disabled?: boolean;
  onChange: (v: string) => void; maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(
    () => options.find(o => o.value === value)?.label ?? '',
    [options, value]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const triggerCls = `w-full bg-[#0d1117] border border-white/10 text-white text-left focus:border-blue-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm transition-colors cursor-pointer flex items-center justify-between gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => !disabled && setOpen(o => !o)} className={triggerCls} disabled={disabled}>
        <span className={selectedLabel ? 'text-white' : 'text-slate-500'}>{selectedLabel || placeholder}</span>
        <svg className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <input ref={inputRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari..."
              className="w-full bg-[#0a0e17] border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50" />
          </div>
          <div style={{ maxHeight }} className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">Tidak ada hasil</div>
            ) : filtered.map(o => (
              <button key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${o.value === value ? 'bg-blue-600/20 text-blue-300' : 'text-slate-300 hover:bg-white/[0.04]'}`}>
                <div>{o.label}</div>
                {o.sublabel && <div className="text-[11px] text-slate-500 truncate">{o.sublabel}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CsSellingPage() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  // Data Customer
  const [customer, setCustomer] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [alamat, setAlamat] = useState('');
  const [provId, setProvId] = useState('');
  const [provinsi, setProvinsi] = useState('');
  const [kabId, setKabId] = useState('');
  const [kabupaten, setKabupaten] = useState('');
  const [kecId, setKecId] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [noHp, setNoHp] = useState('');
  const [leadId, setLeadId] = useState('');

  const [customers, setCustomers] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const { data: provinces } = useWilayah('provinces');
  const { data: regencies } = useWilayah('regencies', provId);
  const { data: districts } = useWilayah('districts', kabId);

  useEffect(() => {
    dbGet('customers').then(setCustomers).catch(() => {});
    dbGet('leads').then(setLeads).catch(() => {});
  }, []);

  // Data Order
  const [namaTim, setNamaTim] = useState('');

  // DP Desain payment
  const [dpAmount, setDpAmount] = useState(0);
  const [dpBank, setDpBank] = useState('');
  const [dpMethod, setDpMethod] = useState('');
  const [dpMethodOther, setDpMethodOther] = useState('');

  // Bukti TF upload
  const [buktiTf, setBuktiTf] = useState<string | null>(null);
  const [buktiTfName, setBuktiTfName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const customerOptions: Option[] = useMemo(
    () => customers.map(c => ({
      value: String(c.id),
      label: String(c.nama || ''),
      sublabel: [c.no_hp, c.kabupaten_kota].filter(Boolean).join(' · '),
    })),
    [customers]
  );
  const leadOptions: Option[] = useMemo(
    () => leads.map(l => ({ value: String(l.id), label: String(l.nama || '') })),
    [leads]
  );

  function handleCustomerPick(v: string) {
    setCustomerId(v);
    const c = customers.find(x => String(x.id) === v);
    if (c) {
      setCustomer(String(c.nama || ''));
      setNoHp(String(c.no_hp || ''));
      setAlamat(String(c.alamat_lengkap || ''));
      setProvinsi(String(c.provinsi || ''));
      setKabupaten(String(c.kabupaten_kota || ''));
      setKecamatan(String(c.kecamatan || ''));
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    // Guard: 5 MB soft cap so a huge photo doesn't stall the JSON POST.
    if (f.size > 5 * 1024 * 1024) {
      toast.error('File Terlalu Besar', 'Ukuran maksimal 5 MB. Kompres foto TF-nya dulu.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      setBuktiTf(s);
      setBuktiTfName(f.name);
    };
    reader.readAsDataURL(f);
  }
  function clearFile() {
    setBuktiTf(null);
    setBuktiTfName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleReset() {
    setCustomer(''); setCustomerId(''); setAlamat('');
    setProvId(''); setProvinsi(''); setKabId(''); setKabupaten(''); setKecId(''); setKecamatan('');
    setNoHp(''); setLeadId(''); setNamaTim('');
    setDpAmount(0); setDpBank(''); setDpMethod(''); setDpMethodOther('');
    clearFile();
  }

  async function handleSubmit() {
    const missing: string[] = [];
    if (!customer.trim()) missing.push('Nama Customer');
    if (!alamat.trim()) missing.push('Alamat');
    if (!noHp.trim()) missing.push('No HP');
    if (!leadId) missing.push('Leads');
    if (missing.length > 0) {
      toast.warning('Wajib Diisi', missing.join(', '));
      return;
    }
    setSaving(true);
    try {
      // Reuse existing customers row when the name matches (case-insensitive)
      // so this page doesn't fragment the master customer list.
      let custId: number | null = customerId ? Number(customerId) : null;
      if (!custId) {
        const match = customers.find(
          c => String(c.nama || '').trim().toLowerCase() === customer.trim().toLowerCase()
        );
        if (match) {
          custId = Number(match.id);
        } else {
          custId = await dbCreate('customers', {
            nama: customer.trim(),
            no_hp: noHp || null,
            alamat_lengkap: alamat || null,
            kecamatan: kecamatan || null,
            kabupaten_kota: kabupaten || null,
            provinsi: provinsi || null,
          });
        }
      }

      // Generate no_order sequentially, matching the pattern used by
      // /orders — /^ORD\d+$/ — so both pages share the same namespace.
      const allOrders = await dbGet('orders');
      const maxNum = allOrders.reduce((max: number, o: { no_order?: string }) => {
        const m = o.no_order?.match(/^ORD(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0);
      const noOrder = `ORD${String(maxNum + 1).padStart(3, '0')}`;
      const todayIso = new Date().toISOString().split('T')[0];

      // Order shell: SELLING is the CS Selling handoff state. CS Order
      // finishes it later — items, paket, deadline, DP Produksi, etc.
      const orderId = await dbCreate('orders', {
        no_order: noOrder,
        customer_id: custId,
        customer_nama: customer.trim(),
        customer_phone: noHp || null,
        customer_alamat: alamat || null,
        customer_kecamatan: kecamatan || null,
        customer_kabupaten: kabupaten || null,
        customer_provinsi: provinsi || null,
        lead_id: leadId ? Number(leadId) : null,
        nama_tim: namaTim || null,
        tanggal_order: todayIso,
        status: 'SELLING',
        dp_desain: dpAmount || 0,
      });

      // DP Desain payment — always insert if amount OR bukti present so
      // CS Order can see the initial transfer even without a nominal.
      if (dpAmount > 0 || buktiTf) {
        try {
          await dbCreate('order_payments', {
            order_id: orderId,
            tipe: 'dp_desain',
            amount: dpAmount || 0,
            bank_name: dpBank || null,
            method: dpMethod || null,
            method_other: dpMethod === 'DLL' ? (dpMethodOther || null) : null,
            urutan: 1,
            bukti_tf: buktiTf || null,
            bukti_tf_name: buktiTfName || null,
          });
        } catch (err) {
          console.warn('order_payments insert failed:', err);
          toast.warning('Detail DP Belum Tersimpan',
            'Order tersimpan tapi detail bank/bukti TF belum. Jalankan /api/admin/run-migrations lalu edit di CS Order.');
        }
      }

      invalidateCache('wp_orders', 'wp_dashboard');
      toast.success('Order CS Selling Tersimpan', `${noOrder} diteruskan ke CS Order untuk dilengkapi.`);
      handleReset();
    } catch (e) {
      toast.error('Gagal Menyimpan', String(e));
    }
    setSaving(false);
  }

  const inputCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm transition-colors';
  const labelCls = 'block text-sm font-medium text-white mb-1.5';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">CS Selling</h1>
        <p className="text-sm text-slate-500 mt-1">
          Input data customer, DP Desain, dan bukti TF. Detail order (paket, deadline, DP Produksi) dilengkapi tim CS Order.
        </p>
      </div>

      {/* Data Customer */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">Data Customer</h2>

        <div>
          <label className={labelCls}>Nama Customer <span className="text-rose-400">*</span></label>
          <div className="space-y-1.5">
            <SearchableSelect
              value={customerId}
              options={customerOptions}
              placeholder="Cari customer yang sudah ada..."
              onChange={handleCustomerPick}
            />
            <input type="text" value={customer} onChange={e => { setCustomer(e.target.value); setCustomerId(''); }}
              placeholder="atau ketik nama customer baru..." className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Alamat Lengkap <span className="text-rose-400">*</span></label>
          <input type="text" value={alamat} onChange={e => setAlamat(e.target.value)}
            placeholder="Jl. Contoh No. 123" className={inputCls} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Provinsi</label>
            <SearchableSelect
              value={provId}
              options={provinces.map(p => ({ value: p.id, label: p.name }))}
              placeholder="Pilih provinsi..."
              onChange={v => {
                setProvId(v);
                const p = provinces.find(x => x.id === v);
                setProvinsi(p?.name || '');
                setKabId(''); setKabupaten(''); setKecId(''); setKecamatan('');
              }}
            />
          </div>
          <div>
            <label className={labelCls}>Kabupaten/Kota</label>
            <SearchableSelect
              value={kabId}
              options={regencies.map(r => ({ value: r.id, label: r.name }))}
              placeholder={provId ? 'Pilih kab/kota...' : 'Pilih provinsi dulu'}
              disabled={!provId}
              onChange={v => {
                setKabId(v);
                const r = regencies.find(x => x.id === v);
                setKabupaten(r?.name || '');
                setKecId(''); setKecamatan('');
              }}
            />
          </div>
          <div>
            <label className={labelCls}>Kecamatan</label>
            <SearchableSelect
              value={kecId}
              options={districts.map(d => ({ value: d.id, label: d.name }))}
              placeholder={kabId ? 'Pilih kecamatan...' : 'Pilih kab/kota dulu'}
              disabled={!kabId}
              onChange={v => {
                setKecId(v);
                const d = districts.find(x => x.id === v);
                setKecamatan(d?.name || '');
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>No HP <span className="text-rose-400">*</span></label>
            <input type="text" value={noHp} onChange={e => setNoHp(e.target.value)}
              placeholder="08123456789" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Leads <span className="text-rose-400">*</span></label>
            <SearchableSelect
              value={leadId}
              options={leadOptions}
              placeholder="Pilih leads..."
              onChange={setLeadId}
            />
          </div>
        </div>
      </section>

      {/* Data Order */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">Data Order</h2>
        <div>
          <label className={labelCls}>Nama Tim</label>
          <input type="text" value={namaTim} onChange={e => setNamaTim(e.target.value)}
            placeholder="Nama tim" className={inputCls} />
        </div>
      </section>

      {/* DP Desain */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 space-y-3">
        <h2 className="text-base font-semibold text-white">DP Desain</h2>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">Rp</span>
          <input type="text" value={fmtRp(dpAmount)} onChange={e => setDpAmount(parseRp(e.target.value))}
            className={`${inputCls} pl-10`} placeholder="0" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={dpBank} onChange={e => setDpBank(e.target.value)}
            className={`${inputCls} appearance-none cursor-pointer text-xs`}>
            <option value="">Nama Bank...</option>
            {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={dpMethod} onChange={e => {
            const m = e.target.value;
            setDpMethod(m);
            if (m !== 'DLL') setDpMethodOther('');
          }} className={`${inputCls} appearance-none cursor-pointer text-xs`}>
            <option value="">Metode...</option>
            {METHOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {dpMethod === 'DLL' && (
          <input type="text" value={dpMethodOther} onChange={e => setDpMethodOther(e.target.value)}
            placeholder="Ketik metode pembayaran..." className={`${inputCls} text-xs`} />
        )}
      </section>

      {/* Upload DP Design */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 space-y-3">
        <h2 className="text-base font-semibold text-white">Upload DP Desain</h2>
        <label className={labelCls}>Bukti TF</label>

        {!buktiTf ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/10 rounded-lg py-8 cursor-pointer hover:border-blue-500/40 hover:bg-white/[0.02] transition-colors">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm text-slate-400">Klik atau drop file untuk upload</span>
            <span className="text-[11px] text-slate-500">PNG, JPG, atau PDF · max 5 MB</span>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChange} />
          </label>
        ) : (
          <div className="border border-white/10 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-slate-300 truncate">{buktiTfName || 'bukti.tf'}</span>
              </div>
              <button onClick={clearFile} className="text-xs text-slate-500 hover:text-rose-400">Ganti</button>
            </div>
            {buktiTf.startsWith('data:image') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={buktiTf} alt="Bukti TF" className="max-h-64 rounded border border-white/10" />
            )}
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pb-8">
        <button onClick={handleReset} disabled={saving}
          className="text-sm font-medium text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
          Reset
        </button>
        <button onClick={handleSubmit} disabled={saving}
          className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan & Kirim ke CS Order'}
        </button>
      </div>
    </div>
  );
}
