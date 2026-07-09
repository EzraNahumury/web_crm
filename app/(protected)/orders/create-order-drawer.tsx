'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
// paket & barang now fetched from DB
import { dbGet, dbCreate } from '@/lib/api-db';
import { invalidateCache } from '@/lib/cache';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// API Wilayah Indonesia
const WILAYAH_API = 'https://www.emsifa.com/api-wilayah-indonesia/api';

interface Wilayah { id: string; name: string }

function useWilayah(level: string, parentId?: string) {
  const [data, setData] = useState<Wilayah[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (level === 'provinces') {
      setLoading(true);
      fetch(`${WILAYAH_API}/provinces.json`).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
    } else if (parentId) {
      setLoading(true);
      fetch(`${WILAYAH_API}/${level}/${parentId}.json`).then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
    } else {
      setData([]);
    }
  }, [level, parentId]);
  return { data, loading };
}

interface OrderItem {
  id: number;
  paket: string;
  qty: number;
}

interface DetailBahanItem {
  id: number;
  bagian: string;
  bahan: string;
}

const DEFAULT_BAGIAN = ['FRONT BODY', 'BACK BODY', 'SLEEVE', 'COMBINATION', 'COLLAR', 'SLEEVE ENDS', 'SIDE PANTS STRIPE', 'PANTS'];

function initDetailBahan(): DetailBahanItem[] {
  return DEFAULT_BAGIAN.map((b, i) => ({ id: i + 1, bagian: b, bahan: '' }));
}

// bahan options now fetched from DB

const fmtDate = (d: string) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID').format(n);
}
function parseRp(s: string): number {
  return parseInt(s.replace(/\D/g, ''), 10) || 0;
}

function RupiahInput({ value, onChange, readOnly, className }: {
  value: number; onChange?: (v: number) => void; readOnly?: boolean; className?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">Rp</span>
      <input
        type="text"
        value={fmtRp(value)}
        onChange={e => onChange?.(parseRp(e.target.value))}
        readOnly={readOnly}
        className={`w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 transition-colors pl-10 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''} ${className || ''}`}
      />
    </div>
  );
}

function today() {
  return new Date().toISOString().split('T')[0];
}
function weekLater() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

// Dropdown with a search box on top. Renders the visible trigger the same
// way our other selects look so it drops in as a swap for a <select>.
// Options are strings; the caller controls option list + which value maps
// back to which id via getOptionKey/getOptionValue when it needs the id.
interface Option { value: string; label: string; sublabel?: string }
function SearchableSelect({
  value,
  options,
  placeholder = 'Pilih...',
  disabled,
  onChange,
  className = '',
  maxHeight = 240,
}: {
  value: string;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  maxHeight?: number;
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
    return options.filter(o =>
      o.label.toLowerCase().includes(q)
      || (o.sublabel || '').toLowerCase().includes(q)
    );
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Autofocus the search box the moment the panel opens.
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const triggerCls = `w-full bg-[#0d1117] border border-white/10 text-white text-left focus:border-blue-500/50 focus:outline-none rounded-lg px-4 py-2.5 text-sm transition-colors cursor-pointer flex items-center justify-between gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        className={triggerCls}
        disabled={disabled}
      >
        <span className={selectedLabel ? 'text-white' : 'text-slate-500'}>
          {selectedLabel || placeholder}
        </span>
        <svg className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-[#0c1120] border border-white/10 rounded-lg shadow-xl shadow-black/60 overflow-hidden">
          <div className="p-2 border-b border-white/[0.06]">
            <div className="relative">
              <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari..."
                autoComplete="off"
                className="w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 text-xs pl-7 pr-2 py-1.5 rounded-md focus:outline-none focus:border-blue-500/40"
              />
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight }}>
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">Tidak ada hasil</p>
            ) : (
              filtered.map(o => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${active ? 'bg-blue-500/[0.15] text-white' : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'}`}
                  >
                    <p className="truncate">{o.label}</p>
                    {o.sublabel && <p className="text-[10px] text-slate-500 truncate">{o.sublabel}</p>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateOrderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [customer, setCustomer] = useState('');
  const [alamat, setAlamat] = useState('');
  const [provId, setProvId] = useState('');
  const [provinsi, setProvinsi] = useState('');
  const [kabId, setKabId] = useState('');
  const [kabupaten, setKabupaten] = useState('');
  const [kecId, setKecId] = useState('');
  const [kecamatan, setKecamatan] = useState('');

  const { data: provList, loading: provLoading } = useWilayah('provinces');
  const { data: kabList, loading: kabLoading } = useWilayah('regencies', provId);
  const { data: kecList, loading: kecLoading } = useWilayah('districts', kabId);
  const [noHp, setNoHp] = useState('');
  const [leadId, setLeadId] = useState('');
  const [pilihanPaket, setPilihanPaket] = useState('');
  const [expressDurasi, setExpressDurasi] = useState('');
  const [deadlineLock, setDeadlineLock] = useState('');
  const [namaTim, setNamaTim] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ id: 1, paket: '', qty: 0 }]);
  const [detailBahan, setDetailBahan] = useState<DetailBahanItem[]>(initDetailBahan);
  const [tglOrder, setTglOrder] = useState(today());
  const [deadline, setDeadline] = useState(weekLater());
  const [tglAccProofing, setTglAccProofing] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [ekspedisi, setEkspedisi] = useState('');
  const [ekspedisiLainnya, setEkspedisiLainnya] = useState('');
  const [nominalOrder, setNominalOrder] = useState(0);
  const [dpDesain, setDpDesain] = useState(0);
  const [dpProduksi, setDpProduksi] = useState(0);
  const kekurangan = Math.max(0, nominalOrder - dpDesain - dpProduksi);
  const [selectedPromos, setSelectedPromos] = useState<string[]>([]);

  // Fetch dropdown data from DB
  const [leadsList, setLeadsList] = useState<Row[]>([]);
  const [promoList, setPromoList] = useState<Row[]>([]);
  const [paketList, setPaketList] = useState<Row[]>([]);
  const [barangList, setBarangList] = useState<Row[]>([]);
  const [customersList, setCustomersList] = useState<Row[]>([]);
  useEffect(() => {
    if (open) {
      dbGet('leads').then(setLeadsList).catch(() => {});
      dbGet('promo').then(setPromoList).catch(() => {});
      dbGet('paket').then(setPaketList).catch(() => {});
      dbGet('barang').then(setBarangList).catch(() => {});
      dbGet('customers').then(setCustomersList).catch(() => {});
    }
  }, [open]);

  // Customer autocomplete — match by nama, prefer prefix matches at the top
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showCustomerDropdown) return;
    const onClickOutside = (e: MouseEvent) => {
      if (customerWrapRef.current && !customerWrapRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showCustomerDropdown]);

  const customerSuggestions = useMemo(() => {
    const q = customer.trim().toLowerCase();
    if (!q) return [];
    const matches = customersList.filter(c => String(c.nama || '').toLowerCase().includes(q));
    matches.sort((a, b) => {
      const an = String(a.nama || '').toLowerCase();
      const bn = String(b.nama || '').toLowerCase();
      const aStarts = an.startsWith(q) ? 0 : 1;
      const bStarts = bn.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return an.localeCompare(bn);
    });
    return matches.slice(0, 8);
  }, [customer, customersList]);

  function pickCustomer(c: Row) {
    setCustomer(String(c.nama || ''));
    setAlamat(String(c.alamat_lengkap || ''));
    setNoHp(String(c.no_hp || ''));
    setShowCustomerDropdown(false);
  }

  function addItem() {
    setItems(prev => [...prev, { id: Date.now(), paket: '', qty: 0 }]);
  }

  function removeItem(id: number) {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: number, field: 'paket' | 'qty', value: string | number) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function togglePromo(id: string) {
    setSelectedPromos(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleSave() {
    const missing: string[] = [];
    if (!customer.trim()) missing.push('Nama Customer');
    if (!alamat.trim()) missing.push('Alamat Lengkap');
    if (!noHp.trim()) missing.push('No HP');
    if (!leadId.trim()) missing.push('Leads');
    if (!pilihanPaket.trim()) missing.push('Pilihan Layanan');
    if (pilihanPaket === 'Express' && !expressDurasi.trim()) missing.push('Durasi Express');
    if (pilihanPaket === 'Prioritas' && !deadlineLock.trim()) missing.push('Deadline Lock');
    if (!items.some(i => i.paket.trim() && i.qty > 0)) missing.push('Item Order (minimal 1 paket + qty)');
    if (!tglOrder) missing.push('Tanggal Order');
    if (missing.length > 0) {
      toast.warning('Wajib Diisi', missing.join(', '));
      return;
    }
    setSaving(true);
    try {
      // Auto-register / match customer in master
      // Match by nama (case-insensitive) — if found, reuse that id;
      // otherwise create a new customers record so the master always has a record.
      const allCustomers = await dbGet('customers');
      const existingCust = allCustomers.find(
        (c: { nama?: string }) => String(c.nama || '').trim().toLowerCase() === customer.trim().toLowerCase()
      );
      let customerId: number;
      if (existingCust) {
        customerId = Number(existingCust.id);
      } else {
        customerId = await dbCreate('customers', {
          nama: customer,
          no_hp: noHp || null,
          alamat_lengkap: alamat || null,
          kecamatan: kecamatan || null,
          kabupaten_kota: kabupaten || null,
          provinsi: provinsi || null,
        });
      }

      // Generate no_order based on highest existing number to avoid duplicates after deletions
      const orders = await dbGet('orders');
      const maxNum = orders.reduce((max: number, o: { no_order?: string }) => {
        const match = o.no_order?.match(/^ORD(\d+)$/);
        return match ? Math.max(max, parseInt(match[1], 10)) : max;
      }, 0);
      const noOrder = `ORD${String(maxNum + 1).padStart(3, '0')}`;

      // Create order
      const orderId = await dbCreate('orders', {
        no_order: noOrder,
        customer_id: customerId,
        customer_nama: customer,
        customer_phone: noHp,
        customer_alamat: alamat,
        customer_kecamatan: kecamatan,
        customer_kabupaten: kabupaten,
        customer_provinsi: provinsi,
        lead_id: leadId || null,
        pilihan_paket: pilihanPaket
          ? (pilihanPaket === 'Express' && expressDurasi ? `Express - ${expressDurasi}` : pilihanPaket)
          : null,
        deadline_lock: pilihanPaket === 'Prioritas' && deadlineLock ? deadlineLock : null,
        nama_tim: namaTim,
        tanggal_order: tglOrder,
        estimasi_deadline: deadline,
        keterangan,
        status: 'PENDING',
        nominal_order: nominalOrder,
        dp_desain: dpDesain,
        dp_produksi: dpProduksi,
        kekurangan,
        tanggal_acc_proofing: tglAccProofing || null,
        ekspedisi: ekspedisi === 'LAINNYA'
          ? (ekspedisiLainnya || null)
          : ekspedisi ? (ekspedisiLainnya ? `${ekspedisi} - ${ekspedisiLainnya}` : ekspedisi) : null,
      });

      // Create order items
      for (const item of items) {
        if (item.paket) {
          await dbCreate('order_items', {
            order_id: orderId,
            paket_nama: item.paket,
            bahan_kain: '',
            qty: item.qty || 0,
          });
        }
      }

      // Create detail bahan
      for (const db of detailBahan) {
        if (db.bahan) {
          await dbCreate('order_detail_bahan', {
            order_id: orderId,
            bagian: db.bagian,
            bahan: db.bahan,
          });
        }
      }

      // Create order promos
      for (const promoId of selectedPromos) {
        await dbCreate('order_promos', {
          order_id: orderId,
          promo_id: parseInt(promoId),
        });
      }

      invalidateCache('wp_orders', 'wp_dashboard');
      handleReset();
      onClose();
      toast.success('Order Berhasil Dibuat', `Order ${noOrder} telah disimpan.`);
      window.location.reload();
    } catch (e) {
      toast.error('Gagal Menyimpan', String(e));
    }
    setSaving(false);
  }

  function handleReset() {
    setCustomer(''); setAlamat(''); setProvId(''); setProvinsi('');
    setKabId(''); setKabupaten(''); setKecId(''); setKecamatan('');
    setNoHp(''); setLeadId(''); setPilihanPaket(''); setExpressDurasi(''); setDeadlineLock(''); setNamaTim('');
    setItems([{ id: 1, paket: '', qty: 0 }]); setTglOrder(today());
    setDetailBahan(initDetailBahan());
    setDeadline(weekLater()); setTglAccProofing(''); setKeterangan('');
    setEkspedisi(''); setEkspedisiLainnya('');
    setNominalOrder(0); setDpDesain(0); setDpProduksi(0);
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
              <div ref={customerWrapRef} className="relative">
                <label className={labelCls}>Nama Customer<span className="text-red-500 ml-0.5">*</span></label>
                <input
                  type="text"
                  value={customer}
                  onChange={e => { setCustomer(e.target.value); setShowCustomerDropdown(true); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Cari customer atau ketik nama baru..."
                  autoComplete="off"
                  className={inputCls}
                />
                {showCustomerDropdown && customerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-lg bg-[#0c1120] border border-white/10 shadow-xl shadow-black/50 z-20">
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                      Customer ditemukan ({customerSuggestions.length})
                    </div>
                    {customerSuggestions.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickCustomer(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-white/[0.04] border-b border-white/[0.04] last:border-b-0 transition-colors"
                      >
                        <p className="text-sm font-medium text-white truncate">{c.nama}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {c.no_hp || '—'}
                          {c.alamat_lengkap ? ` · ${c.alamat_lengkap}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Alamat Lengkap<span className="text-red-500 ml-0.5">*</span></label>
                <input type="text" value={alamat} onChange={e => setAlamat(e.target.value)}
                  placeholder="Jl. Contoh No. 123" className={inputCls} />
              </div>
              <div>
                <label className={`${labelCls} text-amber-400`}>Provinsi</label>
                <SearchableSelect
                  value={provId}
                  options={provList.map(p => ({ value: p.id, label: p.name }))}
                  placeholder={provLoading ? 'Memuat...' : 'Pilih provinsi...'}
                  disabled={provLoading}
                  onChange={v => {
                    const sel = provList.find(p => p.id === v);
                    setProvId(v);
                    setProvinsi(sel?.name || '');
                    setKabId(''); setKabupaten(''); setKecId(''); setKecamatan('');
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>Kabupaten/Kota</label>
                <SearchableSelect
                  value={kabId}
                  options={kabList.map(k => ({ value: k.id, label: k.name }))}
                  placeholder={kabLoading ? 'Memuat...' : !provId ? 'Pilih provinsi dulu' : 'Pilih kabupaten/kota...'}
                  disabled={!provId || kabLoading}
                  onChange={v => {
                    const sel = kabList.find(k => k.id === v);
                    setKabId(v);
                    setKabupaten(sel?.name || '');
                    setKecId(''); setKecamatan('');
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>Kecamatan</label>
                <SearchableSelect
                  value={kecId}
                  options={kecList.map(k => ({ value: k.id, label: k.name }))}
                  placeholder={kecLoading ? 'Memuat...' : !kabId ? 'Pilih kab/kota dulu' : 'Pilih kecamatan...'}
                  disabled={!kabId || kecLoading}
                  onChange={v => {
                    const sel = kecList.find(k => k.id === v);
                    setKecId(v);
                    setKecamatan(sel?.name || '');
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>No HP<span className="text-red-500 ml-0.5">*</span></label>
                <input type="tel" value={noHp} onChange={e => setNoHp(e.target.value)}
                  placeholder="08123456789" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Leads<span className="text-red-500 ml-0.5">*</span></label>
                <select value={leadId} onChange={e => setLeadId(e.target.value)} className={selectCls}>
                  <option value="">Pilih leads...</option>
                  {leadsList.map(l => (
                    <option key={l.id} value={l.id}>{l.nama}{l.jenis_cs ? ` - ${l.jenis_cs}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Pilihan Layanan<span className="text-red-500 ml-0.5">*</span></label>
                <select
                  value={pilihanPaket}
                  onChange={e => {
                    const v = e.target.value;
                    setPilihanPaket(v);
                    if (v !== 'Express') setExpressDurasi('');
                    if (v !== 'Prioritas') setDeadlineLock('');
                  }}
                  className={selectCls}
                >
                  <option value="">Pilih layanan...</option>
                  <option value="Reguler">Reguler</option>
                  <option value="Express">Express</option>
                  <option value="Prioritas">Prioritas</option>
                </select>
                {pilihanPaket === 'Express' && (
                  <div className="mt-3">
                    <label className={labelCls}>Durasi Express<span className="text-red-500 ml-0.5">*</span></label>
                    <select value={expressDurasi} onChange={e => setExpressDurasi(e.target.value)} className={selectCls}>
                      <option value="">Pilih durasi...</option>
                      <option value="1 hari">1 hari</option>
                      <option value="3 hari">3 hari</option>
                      <option value="5 hari">5 hari</option>
                      <option value="7 hari">7 hari</option>
                      <option value="10 - 12 hari">10 - 12 hari</option>
                    </select>
                  </div>
                )}
                {pilihanPaket === 'Prioritas' && (
                  <div className="mt-3">
                    <label className={labelCls}>Deadline Lock<span className="text-red-500 ml-0.5">*</span></label>
                    <input
                      type="date"
                      value={deadlineLock}
                      onChange={e => setDeadlineLock(e.target.value)}
                      className={`${inputCls} date-input`}
                    />
                    <p className="text-xs text-slate-500 mt-1">CS input tanggal deadline khusus untuk pesanan Prioritas.</p>
                  </div>
                )}
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
                <label className={labelCls}>Item Order<span className="text-red-500 ml-0.5">*</span></label>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex gap-2 items-stretch">
                      <div className="flex-1 flex rounded-lg border border-white/10 bg-[#0d1117] overflow-hidden focus-within:border-blue-500/50 transition-colors">
                        <select value={item.paket} onChange={e => updateItem(item.id, 'paket', e.target.value)}
                          className="flex-1 min-w-0 bg-transparent text-white text-sm px-4 py-2.5 focus:outline-none appearance-none cursor-pointer">
                          <option value="">Pilih paket</option>
                          {[...paketList].sort((a, b) => String(a.nama).localeCompare(String(b.nama))).map(p => <option key={p.id} value={p.nama}>{p.nama}</option>)}
                        </select>
                        <div className="flex items-center gap-1.5 px-3 border-l border-white/10 bg-white/[0.02]">
                          <span className="text-xs font-medium text-slate-500 uppercase">Qty</span>
                          <input type="number" min={0} value={item.qty || ''}
                            onChange={e => updateItem(item.id, 'qty', parseInt(e.target.value) || 0)}
                            placeholder="0" className="no-spin w-12 bg-transparent text-white text-sm text-right focus:outline-none placeholder-slate-600" />
                        </div>
                      </div>
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

              {/* Detail Bahan */}
              <div>
                <label className={labelCls}>Detail Bahan</label>
                <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                  {detailBahan.map((db, idx) => (
                    <div key={db.id} className={`flex items-center ${idx !== 0 ? 'border-t border-white/[0.06]' : ''}`}>
                      <input value={db.bagian} onChange={e => setDetailBahan(prev => prev.map(d => d.id === db.id ? { ...d, bagian: e.target.value } : d))}
                        className="text-xs font-medium text-slate-400 w-[140px] shrink-0 px-3 py-2.5 bg-white/[0.02] uppercase border-0 focus:outline-none focus:text-white" placeholder="Nama bagian" />
                      <div className="flex-1 border-l border-white/[0.06]">
                        <SearchableSelect
                          value={db.bahan}
                          options={[...barangList].sort((a, b) => String(a.nama).localeCompare(String(b.nama))).map(b => ({ value: String(b.nama), label: String(b.nama) }))}
                          placeholder="Pilih bahan"
                          onChange={v => setDetailBahan(prev => prev.map(d => d.id === db.id ? { ...d, bahan: v } : d))}
                          className="[&>button]:!bg-transparent [&>button]:!border-0 [&>button]:!rounded-none [&>button]:!py-2.5"
                        />
                      </div>
                      <button onClick={() => setDetailBahan(prev => prev.filter(d => d.id !== db.id))}
                        className="shrink-0 text-slate-500 hover:text-red-400 transition-colors px-2 py-2.5 border-l border-white/[0.06]">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setDetailBahan(prev => [...prev, { id: Date.now(), bagian: '', bahan: '' }])}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-white/10 text-sm text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Tambah Item
                </button>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${labelCls} text-amber-400`}>Tanggal Order<span className="text-red-500 ml-0.5">*</span></label>
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
                <label className={labelCls}>Tanggal ACC Proofing</label>
                <input type="date" value={tglAccProofing} onChange={e => setTglAccProofing(e.target.value)}
                  className={`${inputCls} date-input`} />
              </div>

              <div>
                <label className={labelCls}>Keterangan</label>
                <textarea value={keterangan} onChange={e => setKeterangan(e.target.value)}
                  rows={3} placeholder="Detail tambahan untuk order ini..."
                  className={`${inputCls} resize-none`} />
              </div>

              {/* Ekspedisi */}
              <div>
                <label className={labelCls}>Ekspedisi</label>
                <select value={ekspedisi} onChange={e => { setEkspedisi(e.target.value); setEkspedisiLainnya(''); }}
                  className={selectCls}>
                  <option value="">Pilih ekspedisi...</option>
                  <option value="JNE">JNE</option>
                  <option value="J&T">J&T</option>
                  <option value="LION PARCEL">Lion Parcel</option>
                  <option value="LAINNYA">Lainnya</option>
                </select>
                {ekspedisi && (
                  <input type="text" value={ekspedisiLainnya} onChange={e => setEkspedisiLainnya(e.target.value)}
                    placeholder={ekspedisi === 'LAINNYA' ? 'Ketik nama ekspedisi...' : 'Nomor resi / keterangan...'}
                    className={`${inputCls} mt-2`} />
                )}
              </div>
            </div>
          </div>

          {/* ── Pembayaran ── */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4 uppercase">Pembayaran</h3>
            <div className="space-y-4">
              <div>
                <label className={`${labelCls} text-amber-400`}>Nominal Order</label>
                <RupiahInput value={nominalOrder} onChange={setNominalOrder} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${labelCls} text-amber-400`}>DP Desain</label>
                  <RupiahInput value={dpDesain} onChange={setDpDesain} />
                </div>
                <div>
                  <label className={`${labelCls} text-amber-400`}>DP Produksi</label>
                  <RupiahInput value={dpProduksi} onChange={setDpProduksi} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Kekurangan</label>
                <RupiahInput value={kekurangan} readOnly />
              </div>
            </div>
          </div>

          {/* ── Promo ── */}
          <div>
            <label className={labelCls}>Promo yang Diambil (S&K berlaku)</label>
            <div className="space-y-3 mt-2">
              {promoList.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">Belum ada promo. Tambahkan di Master Data.</p>
              ) : promoList.map(promo => (
                <label key={promo.id}
                  className={`block p-4 rounded-lg border cursor-pointer transition-colors ${selectedPromos.includes(String(promo.id)) ? 'border-blue-500/40 bg-blue-500/[0.06]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedPromos.includes(String(promo.id))}
                      onChange={() => togglePromo(String(promo.id))}
                      className="mt-1 w-4 h-4 rounded border-slate-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">{promo.nama}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{fmtDate(promo.periode_mulai)} - {fmtDate(promo.periode_selesai)}</p>
                      {promo.deskripsi && <p className="text-xs text-slate-400 mt-2 leading-relaxed uppercase">{promo.deskripsi}</p>}
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
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </>
  );
}
