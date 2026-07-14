'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
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
function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return '-';
}

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

// ─────────────────────────── DRAWER ───────────────────────────

function CsSellingDrawer({ open, onClose, onSaved, customers, leads, editOrder, editPayments }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  customers: Row[];
  leads: Row[];
  // When present, drawer runs in edit mode — pre-fills fields and
  // saves via UPDATE instead of INSERT.
  editOrder?: Row | null;
  editPayments?: Row[];
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

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
  const [namaTim, setNamaTim] = useState('');

  const [dpAmount, setDpAmount] = useState(0);
  const [dpBank, setDpBank] = useState('');
  const [dpMethod, setDpMethod] = useState('');
  const [dpMethodOther, setDpMethodOther] = useState('');

  const [buktiTf, setBuktiTf] = useState<string | null>(null);
  const [buktiTfName, setBuktiTfName] = useState('');
  const [keterangan, setKeterangan] = useState('');
  // Pilihan Layanan — mirrors the legacy create drawer:
  //   Reguler  → no extra field
  //   Express  → wajib pilih Durasi Express
  //   Prioritas → wajib pilih Deadline Lock (tanggal)
  const [pilihanLayanan, setPilihanLayanan] = useState('');
  const [expressDurasi, setExpressDurasi] = useState('');
  const [deadlineLock, setDeadlineLock] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: provinces } = useWilayah('provinces');
  const { data: regencies } = useWilayah('regencies', provId);
  const { data: districts } = useWilayah('districts', kabId);

  const customerOptions: Option[] = useMemo(
    () => customers.map(c => ({
      value: String(c.id), label: String(c.nama || ''),
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

  // Prefill on open when editing an existing order. Runs on every
  // (open + editOrder id) change so switching between edits reloads
  // the form. We rely on the caller passing latest editPayments too.
  // When switching from an edit back to a fresh create, reset state
  // so we don't leak the previous edit's values.
  useEffect(() => {
    if (!open) return;
    if (!editOrder) { reset(); return; }
    const o = editOrder;
    setCustomer(String(o.customer_nama || ''));
    setCustomerId(o.customer_id ? String(o.customer_id) : '');
    setAlamat(String(o.customer_alamat || ''));
    setProvinsi(String(o.customer_provinsi || ''));
    setKabupaten(String(o.customer_kabupaten || ''));
    setKecamatan(String(o.customer_kecamatan || ''));
    setNoHp(String(o.customer_phone || ''));
    setLeadId(o.lead_id ? String(o.lead_id) : '');
    setNamaTim(String(o.nama_tim || ''));
    setKeterangan(String(o.keterangan || ''));
    // Decode pilihan_paket. Reguler/Prioritas are stored plain;
    // Express is "Express - <durasi>".
    const raw = String(o.pilihan_paket || '');
    if (raw.startsWith('Express')) {
      setPilihanLayanan('Express');
      const parts = raw.split(' - ');
      setExpressDurasi(parts[1] || '');
    } else if (raw === 'Prioritas') {
      setPilihanLayanan('Prioritas');
      setDeadlineLock(String(o.deadline_lock || '').slice(0, 10));
    } else if (raw === 'Reguler') {
      setPilihanLayanan('Reguler');
    } else {
      setPilihanLayanan('');
    }
    const dpDesain = (editPayments || []).find(p => String(p.tipe) === 'dp_desain');
    if (dpDesain) {
      setDpAmount(Number(dpDesain.amount) || 0);
      setDpBank(String(dpDesain.bank_name || ''));
      setDpMethod(String(dpDesain.method || ''));
      setDpMethodOther(String(dpDesain.method_other || ''));
      setBuktiTf(dpDesain.bukti_tf ? String(dpDesain.bukti_tf) : null);
      setBuktiTfName(String(dpDesain.bukti_tf_name || ''));
    } else {
      setDpAmount(Number(o.dp_desain) || 0);
    }
  }, [open, editOrder, editPayments]);

  function reset() {
    setCustomer(''); setCustomerId(''); setAlamat('');
    setProvId(''); setProvinsi(''); setKabId(''); setKabupaten(''); setKecId(''); setKecamatan('');
    setNoHp(''); setLeadId(''); setNamaTim('');
    setDpAmount(0); setDpBank(''); setDpMethod(''); setDpMethodOther('');
    setKeterangan('');
    setPilihanLayanan(''); setExpressDurasi(''); setDeadlineLock('');
    setBuktiTf(null); setBuktiTfName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const [uploading, setUploading] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error('File Terlalu Besar', 'Ukuran maksimal 5 MB. Kompres foto TF-nya dulu.');
      return;
    }
    // Upload to the persistent UPLOAD_DIR (survives redeploys) via the
    // existing /api/upload route. On failure, fall back to base64 in the
    // column so the flow still works locally without a filesystem.
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok && j?.url) {
        setBuktiTf(String(j.url));
        setBuktiTfName(String(j.originalName || f.name));
      } else {
        throw new Error(j?.error || 'Upload gagal');
      }
    } catch (err) {
      console.warn('bukti TF filesystem upload failed, using base64 fallback:', err);
      const reader = new FileReader();
      reader.onload = () => {
        setBuktiTf(String(reader.result || ''));
        setBuktiTfName(f.name);
      };
      reader.readAsDataURL(f);
    }
    setUploading(false);
  }

  async function handleSave() {
    const missing: string[] = [];
    if (!customer.trim()) missing.push('Nama Customer');
    if (!alamat.trim()) missing.push('Alamat');
    if (!noHp.trim()) missing.push('No HP');
    if (!leadId) missing.push('Leads');
    if (!pilihanLayanan) missing.push('Pilihan Layanan');
    if (pilihanLayanan === 'Express' && !expressDurasi) missing.push('Durasi Express');
    if (pilihanLayanan === 'Prioritas' && !deadlineLock) missing.push('Deadline Lock');
    if (missing.length > 0) {
      toast.warning('Wajib Diisi', missing.join(', '));
      return;
    }
    setSaving(true);
    try {
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

      const todayIso = new Date().toISOString().split('T')[0];
      // orders.estimasi_deadline is NOT NULL in the base schema — CS Order
      // will overwrite it via Pembayaran, but on strict-mode DBs the insert
      // silently fails without a value here, so give it a 7-day placeholder.
      const weekLaterIso = (() => {
        const d = new Date(); d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
      })();

      // Reproduce the legacy create drawer's encoding:
      //   Express with a durasi becomes "Express - 3 hari"
      //   Prioritas stores its picked date in deadline_lock
      const pilihanPaketValue = pilihanLayanan
        ? (pilihanLayanan === 'Express' && expressDurasi ? `Express - ${expressDurasi}` : pilihanLayanan)
        : null;

      // Shared payload minus keys that only apply to insert vs update.
      const sharedPayload = {
        customer_id: custId,
        customer_nama: customer.trim(),
        customer_phone: noHp || null,
        customer_alamat: alamat || null,
        customer_kecamatan: kecamatan || null,
        customer_kabupaten: kabupaten || null,
        customer_provinsi: provinsi || null,
        lead_id: leadId ? Number(leadId) : null,
        nama_tim: namaTim || null,
        dp_desain: dpAmount || 0,
        keterangan: keterangan.trim() || null,
        pilihan_paket: pilihanPaketValue,
        deadline_lock: pilihanLayanan === 'Prioritas' && deadlineLock ? deadlineLock : null,
      };

      let orderId: number;
      let noOrder = '';

      if (editOrder) {
        // Edit mode — update in place, keep no_order / status / dates.
        orderId = Number(editOrder.id);
        noOrder = String(editOrder.no_order || `#${orderId}`);
        try {
          await dbUpdate('orders', orderId, sharedPayload);
        } catch (err) {
          console.error('[cs-selling] update order failed:', err);
          toast.error('Gagal Update', String(err));
          setSaving(false);
          return;
        }
      } else {
        const allOrders = await dbGet('orders');
        const maxNum = allOrders.reduce((max: number, o: { no_order?: string }) => {
          const m = o.no_order?.match(/^ORD(\d+)$/);
          return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        noOrder = `ORD${String(maxNum + 1).padStart(3, '0')}`;

        const baseOrderPayload = {
          ...sharedPayload,
          no_order: noOrder,
          tanggal_order: todayIso,
          estimasi_deadline: weekLaterIso,
          status: 'SELLING',
        };

        try {
          orderId = await dbCreate('orders', { ...baseOrderPayload, created_via: 'CS_SELLING' });
        } catch (err) {
          console.warn('orders insert with created_via failed, retrying without:', err);
          orderId = await dbCreate('orders', baseOrderPayload);
        }
        console.log('[cs-selling] order created', { orderId, noOrder, status: 'SELLING' });
      }

      // Verify the DB actually stored 'SELLING' — legacy schema had
      // orders.status as ENUM without 'SELLING', which silently coerces
      // to the default 'PENDING' on non-strict MySQL. If we see that,
      // force-run migrations, then try to UPDATE the status back.
      // Skip when editing — the row's status was already set correctly
      // at create time and we don't want to bump it out of a downstream
      // state (e.g. PENDING → SELLING).
      if (!editOrder) try {
        const check = await dbGet('orders', undefined, { id: orderId });
        const storedStatus = String((check[0] as Row)?.status || '').toUpperCase();
        if (storedStatus !== 'SELLING') {
          console.warn('[cs-selling] status coerced to', storedStatus, '- forcing migrations + repair');
          try {
            await fetch('/api/admin/run-migrations').then(r => r.json());
            await dbUpdate('orders', orderId, { status: 'SELLING' });
            const recheck = await dbGet('orders', undefined, { id: orderId });
            const nowStatus = String((recheck[0] as Row)?.status || '').toUpperCase();
            if (nowStatus !== 'SELLING') {
              toast.error(
                'Migrasi Belum Aktif',
                'Kolom status masih ENUM lama. Jalankan /api/admin/run-migrations manual lalu redeploy.'
              );
            }
          } catch (repairErr) {
            console.error('[cs-selling] status repair failed:', repairErr);
            toast.error(
              'Status Order Tidak Konsisten',
              'Order tersimpan tapi status bukan SELLING. Hubungi admin untuk repair schema.'
            );
          }
        }
      } catch (verifyErr) {
        console.warn('[cs-selling] status verify failed:', verifyErr);
      }

      if (dpAmount > 0 || buktiTf) {
        // Try the full insert first (needs migration 021 for bukti_tf).
        // If the column doesn't exist yet, retry without it so at least
        // the amount + bank + method land in order_payments.
        const basePayment = {
          order_id: orderId,
          tipe: 'dp_desain',
          amount: dpAmount || 0,
          bank_name: dpBank || null,
          method: dpMethod || null,
          method_other: dpMethod === 'DLL' ? (dpMethodOther || null) : null,
          urutan: 1,
        };
        const fullPayment = { ...basePayment, bukti_tf: buktiTf || null, bukti_tf_name: buktiTfName || null };

        // When editing, reuse the existing dp_desain row if there is one
        // so we don't stack duplicates. Otherwise insert fresh.
        const existingDp = editOrder ? (editPayments || []).find(p => String(p.tipe) === 'dp_desain') : null;
        try {
          if (existingDp) {
            await dbUpdate('order_payments', Number(existingDp.id), fullPayment);
          } else {
            await dbCreate('order_payments', fullPayment);
          }
        } catch (err) {
          console.warn('order_payments write with bukti_tf failed, retrying without:', err);
          try {
            if (existingDp) {
              await dbUpdate('order_payments', Number(existingDp.id), basePayment);
            } else {
              await dbCreate('order_payments', basePayment);
            }
            if (buktiTf) {
              toast.warning('Bukti TF Belum Tersimpan',
                'Order + nominal tersimpan tapi bukti TF gagal upload. Jalankan /api/admin/run-migrations lalu upload ulang.');
            }
          } catch (err2) {
            console.warn('order_payments fallback write also failed:', err2);
            toast.warning('Detail DP Belum Tersimpan',
              'Order tersimpan tapi detail bank/bukti TF belum. Jalankan /api/admin/run-migrations.');
          }
        }
      }

      invalidateCache('wp_orders', 'wp_dashboard');
      if (editOrder) {
        toast.success('Order CS Selling Diperbarui', `${noOrder} berhasil diperbarui.`);
      } else {
        toast.success('Order CS Selling Tersimpan', `${noOrder} diteruskan ke CS Order untuk dilengkapi.`);
      }
      reset();
      // Wait for the parent to refetch so the new row is definitely on
      // screen before the drawer disappears — closes the race where the
      // user sees an empty table for a split second post-save.
      await Promise.resolve(onSaved());
      onClose();
    } catch (e) {
      toast.error('Gagal Menyimpan', String(e));
    }
    setSaving(false);
  }

  if (!open) return null;

  const inputCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm transition-colors';
  const labelCls = 'block text-sm font-medium text-white mb-1.5';

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[440px] bg-[#0c1120] border-l border-white/[0.06] shadow-2xl shadow-black/50 flex flex-col animate-slide-in-right">
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-white">
            {editOrder ? `Update Order ${editOrder.no_order || ''}` : 'Buat Order Baru'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <section>
            <h3 className="text-sm font-bold text-white mb-3">Data Customer</h3>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nama Customer <span className="text-rose-400">*</span></label>
                <div className="space-y-1.5">
                  <SearchableSelect
                    value={customerId}
                    options={customerOptions}
                    placeholder="Cari customer atau ketik nama baru..."
                    onChange={handleCustomerPick}
                  />
                  <input type="text" value={customer} onChange={e => { setCustomer(e.target.value); setCustomerId(''); }}
                    placeholder="atau ketik nama baru..." className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Alamat Lengkap <span className="text-rose-400">*</span></label>
                <input type="text" value={alamat} onChange={e => setAlamat(e.target.value)}
                  placeholder="Jl. Contoh No. 123" className={inputCls} />
              </div>
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
                  placeholder={kabId ? 'Pilih kab/kota dulu...' : 'Pilih kab/kota dulu'}
                  disabled={!kabId}
                  onChange={v => {
                    setKecId(v);
                    const d = districts.find(x => x.id === v);
                    setKecamatan(d?.name || '');
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>No HP <span className="text-rose-400">*</span></label>
                <input type="text" value={noHp} onChange={e => setNoHp(e.target.value)}
                  placeholder="08123456789" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pilihan Leads <span className="text-rose-400">*</span></label>
                <SearchableSelect
                  value={leadId}
                  options={leadOptions}
                  placeholder="Pilih leads..."
                  onChange={setLeadId}
                />
                <p className="text-[11px] text-slate-500 mt-1">Sumber pilihan dari Master → Leads.</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-white mb-3">Data Order</h3>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nama Tim</label>
                <input type="text" value={namaTim} onChange={e => setNamaTim(e.target.value)}
                  placeholder="Nama tim" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pilihan Layanan <span className="text-rose-400">*</span></label>
                <select
                  value={pilihanLayanan}
                  onChange={e => {
                    const v = e.target.value;
                    setPilihanLayanan(v);
                    if (v !== 'Express') setExpressDurasi('');
                    if (v !== 'Prioritas') setDeadlineLock('');
                  }}
                  className={`${inputCls} appearance-none cursor-pointer`}
                >
                  <option value="">Pilih layanan...</option>
                  <option value="Reguler">Reguler</option>
                  <option value="Express">Express</option>
                  <option value="Prioritas">Prioritas</option>
                </select>
              </div>
              {pilihanLayanan === 'Express' && (
                <div>
                  <label className={labelCls}>Durasi Express <span className="text-rose-400">*</span></label>
                  <select value={expressDurasi} onChange={e => setExpressDurasi(e.target.value)}
                    className={`${inputCls} appearance-none cursor-pointer`}>
                    <option value="">Pilih durasi...</option>
                    <option value="1 hari">1 hari</option>
                    <option value="3 hari">3 hari</option>
                    <option value="5 hari">5 hari</option>
                    <option value="7 hari">7 hari</option>
                    <option value="10 - 12 hari">10 - 12 hari</option>
                  </select>
                </div>
              )}
              {pilihanLayanan === 'Prioritas' && (
                <div>
                  <label className={labelCls}>Deadline Lock <span className="text-rose-400">*</span></label>
                  <input type="date" value={deadlineLock} onChange={e => setDeadlineLock(e.target.value)}
                    className={inputCls} />
                  <p className="text-[11px] text-slate-500 mt-1">CS input tanggal deadline khusus untuk pesanan Prioritas.</p>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-white mb-3">DP Desain</h3>
            <div className="space-y-2">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">Rp</span>
                <input type="text" value={fmtRp(dpAmount)} onChange={e => setDpAmount(parseRp(e.target.value))}
                  className={`${inputCls} pl-10`} placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={dpBank} onChange={e => setDpBank(e.target.value)}
                  className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
                  <option value="">Nama Bank...</option>
                  {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={dpMethod} onChange={e => {
                  const m = e.target.value; setDpMethod(m);
                  if (m !== 'DLL') setDpMethodOther('');
                }} className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer">
                  <option value="">Metode...</option>
                  {METHOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {dpMethod === 'DLL' && (
                <input type="text" value={dpMethodOther} onChange={e => setDpMethodOther(e.target.value)}
                  placeholder="Ketik metode pembayaran..." className={`${inputCls} text-xs`} />
              )}
              <div className="pt-2">
                <label className={`${labelCls} text-xs`}>Keterangan</label>
                <textarea
                  value={keterangan}
                  onChange={e => setKeterangan(e.target.value)}
                  rows={3}
                  placeholder="Catatan tambahan untuk order/DP ini..."
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-white mb-3">Upload DP Desain</h3>
            <label className={labelCls}>Bukti TF</label>
            {!buktiTf ? (
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/10 rounded-lg py-6 cursor-pointer hover:border-blue-500/40 hover:bg-white/[0.02] transition-colors ${uploading ? 'opacity-60 cursor-wait' : ''}`}>
                {uploading ? (
                  <>
                    <svg className="w-7 h-7 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs text-slate-400">Mengupload...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-xs text-slate-400">Klik atau drop file untuk upload</span>
                    <span className="text-[10px] text-slate-500">PNG, JPG, PDF · max 5 MB</span>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChange} disabled={uploading} />
              </label>
            ) : (
              <div className="border border-white/10 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-slate-300 truncate">{buktiTfName || 'bukti.tf'}</span>
                  </div>
                  <button onClick={() => { setBuktiTf(null); setBuktiTfName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-xs text-slate-500 hover:text-rose-400">Ganti</button>
                </div>
                {(buktiTf.startsWith('data:image') || /\.(png|jpe?g|gif|webp)$/i.test(buktiTfName) || buktiTf.startsWith('/api/files/') || buktiTf.startsWith('/uploads/')) && (
                  // Preview works for both base64 fallbacks and URL-based files.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={buktiTf} alt="Bukti TF" className="max-h-48 rounded border border-white/10" />
                )}
              </div>
            )}
          </section>
        </div>

        <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2 shrink-0">
          <button onClick={onClose} disabled={saving}
            className="text-sm font-medium text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Menyimpan...' : (editOrder ? 'Update' : 'Simpan')}
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────── LIST PAGE ───────────────────────────

export default function CsSellingPage() {
  const [orders, setOrders] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // When editOrder is set, the drawer opens in edit mode with the row's
  // data pre-filled. Closing the drawer clears it, so opening "Buat
  // Order Baru" always lands in create mode.
  const [editOrder, setEditOrder] = useState<Row | null>(null);
  const toast = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, l, c] = await Promise.all([
        dbGet('orders'),
        dbGet('order_payments').catch(() => []),
        dbGet('leads').catch(() => []),
        dbGet('customers').catch(() => []),
      ]);
      // Peek at how many SELLING rows the DB actually returned — helpful
      // when the count in the UI looks off after a save.
      const sellingCount = (o as Row[]).filter(x => String(x.status || '').toUpperCase() === 'SELLING').length;
      console.log('[cs-selling] fetched', { total: o.length, selling: sellingCount });
      setOrders(o);
      setPayments(p);
      setLeads(l);
      setCustomers(c);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Payments belonging to the currently-editing order, passed into the
  // drawer so it can pre-fill DP Desain amount + bukti TF.
  const editPayments = useMemo(() => {
    if (!editOrder) return [];
    return payments.filter(p => Number(p.order_id) === Number(editOrder.id));
  }, [payments, editOrder]);

  function openEdit(o: Row) {
    setEditOrder(o);
    setDrawerOpen(true);
  }

  async function handleDelete(o: Row) {
    const yes = await toast.confirm({
      title: 'Hapus Order?',
      message: `Order ${o.no_order || `#${o.id}`} akan dihapus permanen. Pembayaran + bukti TF-nya juga terhapus.`,
      type: 'danger',
      confirmText: 'Ya, Hapus',
    });
    if (!yes) return;
    const orderId = Number(o.id);
    try {
      // Best-effort delete each related order_payments row. If the FK is
      // set to ON DELETE CASCADE these become redundant but harmless.
      const rowPayments = payments.filter(p => Number(p.order_id) === orderId);
      for (const p of rowPayments) {
        try { await dbDelete('order_payments', Number(p.id)); } catch {}
      }
      await dbDelete('orders', orderId);
      invalidateCache('wp_orders', 'wp_dashboard');
      toast.deleted('Order Dihapus', `${o.no_order || `#${orderId}`} berhasil dihapus.`);
      await fetchAll();
    } catch (e) {
      toast.error('Gagal Hapus', String(e));
    }
  }

  // One-shot migration bootstrap. In production, new schema migrations
  // (like widening orders.status from ENUM to VARCHAR so 'SELLING' can
  // be stored) may not have applied yet if the auto-migration hook
  // didn't fire. Silently hit the admin endpoint the first time this
  // page mounts so subsequent CS Selling saves land correctly.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    fetch('/api/admin/run-migrations')
      .then(r => r.json())
      .then(j => console.log('[cs-selling] migration bootstrap:', j))
      .catch(err => console.warn('[cs-selling] migration bootstrap failed:', err));
  }, []);

  // CS Selling scope: only rows still waiting for CS Order to pick up.
  // Once CS Order saves the Pembayaran, status flips SELLING → PENDING
  // and the row leaves this menu completely — CS Selling doesn't track
  // completed orders, that's the CS Order table's job.
  // Every order CS Selling originated, except those already in production
  // (DONE). CS Selling stays visible after CS Order takes over so the
  // team can watch their submission move through Finance → CS Order.
  const rows = useMemo(() => {
    return orders
      .filter((o: Row) => {
        const st = String(o.status || '').toUpperCase();
        const via = String(o.created_via || '').toUpperCase();
        if (st === 'DONE') return false;
        return via === 'CS_SELLING' || st === 'SELLING';
      })
      .sort((a: Row, b: Row) => Number(b.id) - Number(a.id));
  }, [orders]);

  const filtered = useMemo(() => {
    return rows.filter((r: Row) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return String(r.no_order || '').toLowerCase().includes(q)
        || String(r.customer_nama || '').toLowerCase().includes(q)
        || String(r.customer_phone || '').toLowerCase().includes(q);
    });
  }, [rows, search]);

  const paymentsByOrder = useMemo(() => {
    const m: Record<number, Row[]> = {};
    for (const p of payments) {
      const oid = Number(p.order_id);
      if (!m[oid]) m[oid] = [];
      m[oid].push(p);
    }
    return m;
  }, [payments]);

  const leadById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const l of leads) m[Number(l.id)] = String(l.nama || '');
    return m;
  }, [leads]);

  // All rows here are SELLING by construction — the filter above drops
  // anything else, so we just use rows.length for the single stat card.

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">CS Selling</h1>
          <p className="text-sm text-slate-500 mt-1">
            Input order awal + DP Desain. Detail order (paket, deadline, DP Produksi) dilanjutkan di menu CS Order.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            title="Refresh — muat ulang daftar order"
            className="text-sm font-medium text-slate-300 border border-white/10 hover:bg-white/[0.04] px-3 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
          <button onClick={() => { setEditOrder(null); setDrawerOpen(true); }}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Buat Order Baru
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:max-w-sm gap-3">
        {[
          { label: 'Menunggu CS Order', count: rows.length, color: 'from-fuchsia-500/20 to-fuchsia-500/5', border: 'border-fuchsia-500/15', text: 'text-fuchsia-400', dot: 'bg-fuchsia-400' },
        ].map(s => (
          <div key={s.label} className={`relative rounded-xl bg-gradient-to-br ${s.color} border ${s.border} p-4 overflow-hidden`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.text} tabular-nums`}>{s.count}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari no order, customer, no HP..."
            className="w-full pl-9 pr-3 py-2 bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg placeholder-white/25 focus:outline-none focus:border-blue-500/40" />
        </div>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                <th className="text-left px-4 py-3">No</th>
                <th className="text-left px-4 py-3">No Order</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Leads</th>
                <th className="text-left px-4 py-3">No HP</th>
                <th className="text-right px-4 py-3">DP Desain</th>
                <th className="text-center px-4 py-3">Bukti TF</th>
                <th className="text-left px-4 py-3">Tgl Order</th>
                <th className="text-left px-4 py-3">Finance</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">Memuat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                  Belum ada order menunggu. Klik <strong className="text-white">Buat Order Baru</strong> untuk mulai.
                </td></tr>
              ) : filtered.map((o: Row, i: number) => {
                const p = paymentsByOrder[Number(o.id)] || [];
                const dpDesain = p.find((x: Row) => String(x.tipe) === 'dp_desain');
                const dpAmt = Number(dpDesain?.amount || o.dp_desain || 0);
                const hasBukti = !!dpDesain?.bukti_tf;
                const fs = String(o.finance_status || '').toUpperCase();
                const financeChip =
                  fs === 'APPROVED'
                    ? { label: 'Approved', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' }
                    : fs === 'REJECTED'
                      ? { label: 'Ditolak', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30', dot: 'bg-rose-400' }
                      : { label: 'Menunggu', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' };
                return (
                  <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3.5 text-sm text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3.5 text-sm text-blue-400 font-medium">{o.no_order}</td>
                    <td className="px-4 py-3.5 text-sm text-white font-medium">{o.customer_nama}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{leadById[Number(o.lead_id)] || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-400">{o.customer_phone || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 text-right tabular-nums">
                      {dpAmt > 0 ? `Rp ${fmtRp(dpAmt)}` : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {hasBukti ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          Ada
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-400">{fmtDate(o.tanggal_order)}</td>
                    <td className="px-4 py-3.5">
                      <span
                        title={o.finance_notes ? `Catatan Finance: ${o.finance_notes}` : undefined}
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${financeChip.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${financeChip.dot}`} />
                        {financeChip.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(o)}
                          title="Edit order"
                          className="text-slate-500 hover:text-amber-400 transition-colors p-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(o)}
                          title="Hapus order"
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CsSellingDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditOrder(null); }}
        onSaved={fetchAll}
        customers={customers}
        leads={leads}
        editOrder={editOrder}
        editPayments={editPayments}
      />
    </div>
  );
}
