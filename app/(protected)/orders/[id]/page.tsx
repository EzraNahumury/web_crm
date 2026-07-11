'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Structured payment — matches the Buat Order Baru drawer so edit parity
// is guaranteed. Loaded from order_payments and synced back on save.
interface PaymentInfo {
  amount: number;
  bank: string;
  method: string;
  methodOther: string;
}
const emptyPayment = (): PaymentInfo => ({ amount: 0, bank: '', method: '', methodOther: '' });
const BANK_OPTIONS = ['BRI', 'BCA', 'BNI', 'MANDIRI', 'DANA', 'WISE', 'FLIP', 'F-BANK', 'SHOOPE PAY', 'GOPAY'];
const METHOD_OPTIONS = ['TF', 'QRIS', 'DLL'];

function fmtMoney(v: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v || 0);
}
function parseDateParts(d: string): [number, number, number] | null {
  if (!d) return null;
  // Extract yyyy-mm-dd from ISO or date string without timezone conversion
  const m = String(d).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}
function fmtDate(d: string) {
  const p = parseDateParts(d);
  if (!p) return '-';
  return `${String(p[2]).padStart(2,'0')}/${String(p[1]).padStart(2,'0')}/${p[0]}`;
}
function toDateInput(d: string) {
  const p = parseDateParts(d);
  if (!p) return '';
  return `${p[0]}-${String(p[1]).padStart(2,'0')}-${String(p[2]).padStart(2,'0')}`;
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [order, setOrder] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [orderItems, setOrderItems] = useState<Row[]>([]);
  const [leadInfo, setLeadInfo] = useState<Row | null>(null);
  const [leadsList, setLeadsList] = useState<Row[]>([]);
  const [nominalPay, setNominalPay] = useState<PaymentInfo>(emptyPayment());
  const [dpDesainPay, setDpDesainPay] = useState<PaymentInfo>(emptyPayment());
  const [dpProduksiPays, setDpProduksiPays] = useState<PaymentInfo[]>([emptyPayment()]);
  const [existingPaymentIds, setExistingPaymentIds] = useState<number[]>([]);
  const toast = useToast();

  useEffect(() => {
    dbGet('orders').then(async rows => {
      const found = rows.find((o: Row) => String(o.id) === String(params.id));
      if (found) {
        setOrder(found); setForm(found);
        // Fetch related data
        try {
          const items = await dbGet('order_items');
          setOrderItems(items.filter((i: Row) => String(i.order_id) === String(found.id)));
        } catch {}
        try {
          const leads = await dbGet('leads');
          setLeadsList(leads);
          if (found.lead_id) {
            setLeadInfo(leads.find((l: Row) => String(l.id) === String(found.lead_id)) || null);
          }
        } catch {}
        // Load structured payments — falls back to the scalar columns on the
        // order row when the detailed rows don't exist yet.
        try {
          const payments: Row[] = await dbGet('order_payments');
          const mine = payments.filter((p: Row) => String(p.order_id) === String(found.id));
          setExistingPaymentIds(mine.map((p: Row) => Number(p.id)));
          const rowToPay = (r: Row | undefined): PaymentInfo => ({
            amount: Number(r?.amount) || 0,
            bank: String(r?.bank_name || ''),
            method: String(r?.method || ''),
            methodOther: String(r?.method_other || ''),
          });
          const nomRow = mine.find((p: Row) => p.tipe === 'nominal_order');
          const desainRow = mine.find((p: Row) => p.tipe === 'dp_desain');
          const prodRows = mine
            .filter((p: Row) => p.tipe === 'dp_produksi')
            .sort((a: Row, b: Row) => Number(a.urutan || 0) - Number(b.urutan || 0));
          setNominalPay(nomRow ? rowToPay(nomRow) : { amount: Number(found.nominal_order) || 0, bank: '', method: '', methodOther: '' });
          setDpDesainPay(desainRow ? rowToPay(desainRow) : { amount: Number(found.dp_desain) || 0, bank: '', method: '', methodOther: '' });
          setDpProduksiPays(prodRows.length > 0
            ? prodRows.map(rowToPay)
            : [{ amount: Number(found.dp_produksi) || 0, bank: '', method: '', methodOther: '' }]);
        } catch {
          // order_payments not available — populate from scalar columns only
          setNominalPay({ amount: Number(found.nominal_order) || 0, bank: '', method: '', methodOther: '' });
          setDpDesainPay({ amount: Number(found.dp_desain) || 0, bank: '', method: '', methodOther: '' });
          setDpProduksiPays([{ amount: Number(found.dp_produksi) || 0, bank: '', method: '', methodOther: '' }]);
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.id]);

  async function handleSave() {
    if (!order) return;
    setSaving(true);
    try {
      const dpProduksiTotal = dpProduksiPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const kekurangan = Math.max(0, nominalPay.amount - dpDesainPay.amount - dpProduksiTotal);
      await dbUpdate('orders', order.id, {
        customer_nama: form.customer_nama,
        customer_phone: form.customer_phone,
        customer_alamat: form.customer_alamat,
        customer_desa: form.customer_desa,
        customer_kecamatan: form.customer_kecamatan,
        customer_kabupaten: form.customer_kabupaten,
        customer_provinsi: form.customer_provinsi,
        nama_tim: form.nama_tim,
        tanggal_order: form.tanggal_order || null,
        estimasi_deadline: form.estimasi_deadline || null,
        keterangan: form.keterangan,
        nominal_order: nominalPay.amount,
        dp_desain: dpDesainPay.amount,
        dp_produksi: dpProduksiTotal,
        kekurangan,
        tanggal_acc_proofing: form.tanggal_acc_proofing || null,
        status: form.status,
        lead_id: form.lead_id || null,
        pilihan_paket: form.pilihan_paket || null,
        deadline_lock: form.deadline_lock || null,
      });

      // Sync order_payments — delete old rows, then re-insert. Wrapped in
      // try/catch per row so the whole save doesn't fail if the detailed
      // table isn't ready yet on this instance.
      let paymentSyncFailed = false;
      for (const pid of existingPaymentIds) {
        try { await dbDelete('order_payments', pid); } catch (e) { paymentSyncFailed = true; console.warn('delete order_payments', pid, e); }
      }
      const insertPay = async (
        tipe: 'nominal_order' | 'dp_desain' | 'dp_produksi',
        p: PaymentInfo,
        urutan: number
      ) => {
        if (!p.amount || p.amount <= 0) return;
        try {
          await dbCreate('order_payments', {
            order_id: order.id,
            tipe,
            amount: p.amount,
            bank_name: p.bank || null,
            method: p.method || null,
            method_other: p.method === 'DLL' ? (p.methodOther || null) : null,
            urutan,
          });
        } catch (e) {
          paymentSyncFailed = true;
          console.warn(`insert ${tipe} #${urutan}`, e);
        }
      };
      await insertPay('nominal_order', nominalPay, 1);
      await insertPay('dp_desain', dpDesainPay, 1);
      for (let i = 0; i < dpProduksiPays.length; i++) {
        await insertPay('dp_produksi', dpProduksiPays[i], i + 1);
      }

      setOrder({ ...order, ...form, nominal_order: nominalPay.amount, dp_desain: dpDesainPay.amount, dp_produksi: dpProduksiTotal });
      if (form.lead_id) {
        setLeadInfo(leadsList.find(l => String(l.id) === String(form.lead_id)) || null);
      } else {
        setLeadInfo(null);
      }
      setEditing(false);
      toast.success('Order Diperbarui', 'Data order berhasil disimpan.');
      if (paymentSyncFailed) {
        toast.warning(
          'Detail Pembayaran Belum Tersimpan',
          'Nominal + DP tersimpan, tapi detail bank/metode belum. Hubungi admin bila perlu.'
        );
      }
    } catch (e) { toast.error('Gagal Update', String(e)); }
    setSaving(false);
  }

  async function handleDelete() {
    if (!order) return;
    const yes = await toast.confirm({
      title: 'Hapus Order?',
      message: `Order ${order.no_order} akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`,
      type: 'danger',
      confirmText: 'Ya, Hapus',
    });
    if (!yes) return;
    try {
      await dbDelete('orders', order.id);
      toast.deleted('Order Dihapus', `${order.no_order} berhasil dihapus.`);
      router.push('/orders');
    } catch (e) { toast.error('Gagal Hapus', String(e)); }
  }

  if (loading) return (
    <div className="space-y-4 max-w-3xl">{[1,2,3].map(i => <div key={i} className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />)}</div>
  );
  if (!order) return (
    <div className="text-center py-20">
      <p className="text-slate-500">Order tidak ditemukan</p>
      <button onClick={() => router.push('/orders')} className="mt-4 text-blue-400 text-sm">Kembali ke Orders</button>
    </div>
  );

  const statusLabel = order.status === 'DONE' ? 'Selesai' : order.status === 'IN_PROGRESS' ? 'Proses' : 'Pending';
  const statusCls = order.status === 'DONE' ? 'text-emerald-400 bg-emerald-500/10' : order.status === 'IN_PROGRESS' ? 'text-blue-400 bg-blue-500/10' : 'text-amber-400 bg-amber-500/10';

  const lbl = 'text-[11px] text-blue-400/70 font-medium uppercase tracking-wider mb-0.5';
  const val = 'text-sm font-medium text-white';
  const inp = 'w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40';
  const set = (k: string, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-0 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/orders')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          Kembali ke Orders
        </button>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => { setForm(order); setEditing(false); }}
                className="text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={handleSave} disabled={saving}
                className="text-xs text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-colors">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                Edit Order
              </button>
              <button onClick={handleDelete} className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/20 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                Hapus Order
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-white">Order Details – {order.no_order}</h1>
        {editing ? (
          <select value={form.status} onChange={e => set('status', e.target.value)} className="text-xs bg-[#0d1117] border border-white/10 text-white rounded-full px-3 py-1 focus:outline-none">
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">Proses</option>
            <option value="DONE">Selesai</option>
          </select>
        ) : (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCls}`}>{statusLabel}</span>
        )}
      </div>

      {/* Data Customer */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
        <h2 className="text-base font-bold text-white mb-5">Data Customer</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div><p className={lbl}>Nama Customer</p>{editing ? <input value={form.customer_nama || ''} onChange={e => set('customer_nama', e.target.value)} className={inp} /> : <p className={val}>{order.customer_nama}</p>}</div>
          <div><p className={lbl}>No HP</p>{editing ? <input value={form.customer_phone || ''} onChange={e => set('customer_phone', e.target.value)} className={inp} /> : <p className={val}>{order.customer_phone || '-'}</p>}</div>
          <div className="col-span-2"><p className={lbl}>Alamat Lengkap</p>{editing ? <input value={form.customer_alamat || ''} onChange={e => set('customer_alamat', e.target.value)} className={inp} /> : <p className={val}>{order.customer_alamat || '-'}</p>}</div>
          <div><p className={lbl}>Desa/Kelurahan</p>{editing ? <input value={form.customer_desa || ''} onChange={e => set('customer_desa', e.target.value)} className={inp} /> : <p className={val}>{order.customer_desa || '-'}</p>}</div>
          <div><p className={lbl}>Kecamatan</p>{editing ? <input value={form.customer_kecamatan || ''} onChange={e => set('customer_kecamatan', e.target.value)} className={inp} /> : <p className={val}>{order.customer_kecamatan || '-'}</p>}</div>
          <div><p className={lbl}>Kabupaten/Kota</p>{editing ? <input value={form.customer_kabupaten || ''} onChange={e => set('customer_kabupaten', e.target.value)} className={inp} /> : <p className={val}>{order.customer_kabupaten || '-'}</p>}</div>
          <div><p className={lbl}>Provinsi</p>{editing ? <input value={form.customer_provinsi || ''} onChange={e => set('customer_provinsi', e.target.value)} className={inp} /> : <p className={val}>{order.customer_provinsi || '-'}</p>}</div>
        </div>
      </section>

      {/* Data Order */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
        <h2 className="text-base font-bold text-white mb-5">Data Order</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <div><p className={lbl}>No Order</p><p className={val}>{order.no_order}</p></div>
          <div><p className={lbl}>Tanggal Order</p>{editing ? <input type="date" value={toDateInput(form.tanggal_order || '')} onChange={e => set('tanggal_order', e.target.value)} className={`${inp} date-input`} /> : <p className={val}>{fmtDate(order.tanggal_order)}</p>}</div>
          <div><p className={lbl}>Nama Tim</p>{editing ? <input value={form.nama_tim || ''} onChange={e => set('nama_tim', e.target.value)} className={inp} /> : <p className={val}>{order.nama_tim || '-'}</p>}</div>
          <div><p className={lbl}>Estimasi Deadline</p>{editing ? <input type="date" value={toDateInput(form.estimasi_deadline || '')} onChange={e => set('estimasi_deadline', e.target.value)} className={`${inp} date-input`} /> : <p className={val}>{fmtDate(order.estimasi_deadline)}</p>}</div>
          <div><p className={lbl}>Tanggal ACC Proofing</p>{editing ? <input type="date" value={toDateInput(form.tanggal_acc_proofing || '')} onChange={e => set('tanggal_acc_proofing', e.target.value)} className={`${inp} date-input`} /> : <p className={val}>{fmtDate(order.tanggal_acc_proofing)}</p>}</div>
          <div className="col-span-2"><PilihanLayananEdit editing={editing} form={form} order={order} set={set} inp={inp} lbl={lbl} val={val} /></div>
          <div className="col-span-2"><p className={lbl}>Keterangan</p>{editing ? <textarea value={form.keterangan || ''} onChange={e => set('keterangan', e.target.value)} rows={2} className={`${inp} resize-none`} /> : <p className={val}>{order.keterangan || '-'}</p>}</div>
        </div>
      </section>

      {/* Leads */}
      {(editing || leadInfo) && (
        <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
          <h2 className="text-base font-bold text-white mb-5">Leads</h2>
          {editing ? (
            <div>
              <p className={lbl}>Pilih Leads</p>
              <select
                value={form.lead_id || ''}
                onChange={e => set('lead_id', e.target.value)}
                className={inp}
              >
                <option value="">(Tidak ada leads)</option>
                {leadsList.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.nama}{l.jenis_cs ? ` - ${l.jenis_cs}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div><p className={lbl}>Nama</p><p className={val}>{leadInfo?.nama}</p></div>
              <div><p className={lbl}>Jenis CS</p><p className={val}>{leadInfo?.jenis_cs || '-'}</p></div>
            </div>
          )}
        </section>
      )}

      {/* Items */}
      <ItemsSection orderId={order.id} items={orderItems} onRefresh={async () => {
        const items = await dbGet('order_items');
        setOrderItems(items.filter((i: Row) => String(i.order_id) === String(order.id)));
      }} />

      {/* Pembayaran — struktur mengikuti Buat Order Baru: bank + metode per
          payment + multi-row DP Produksi */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
        <h2 className="text-base font-bold text-white mb-5">Pembayaran</h2>
        {editing ? (
          <div className="space-y-5">
            <PaymentEdit label="Nominal Order" value={nominalPay} onChange={setNominalPay} />
            <PaymentEdit label="DP Desain" value={dpDesainPay} onChange={setDpDesainPay} />
            <div className="space-y-3">
              {dpProduksiPays.map((p, i) => (
                <PaymentEdit
                  key={i}
                  label={dpProduksiPays.length > 1 ? `DP Produksi #${i + 1}` : 'DP Produksi'}
                  value={p}
                  onChange={v => setDpProduksiPays(prev => prev.map((x, idx) => idx === i ? v : x))}
                  onRemove={dpProduksiPays.length > 1 ? () => setDpProduksiPays(prev => prev.filter((_, idx) => idx !== i)) : undefined}
                />
              ))}
              <button
                type="button"
                onClick={() => setDpProduksiPays(prev => [...prev, emptyPayment()])}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-white/10 text-xs text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Tambah DP Produksi
              </button>
            </div>
            <div>
              <p className={lbl}>Kekurangan</p>
              <p className={val}>
                {fmtMoney(Math.max(0, nominalPay.amount - dpDesainPay.amount - dpProduksiPays.reduce((s, p) => s + p.amount, 0)))}
              </p>
            </div>
          </div>
        ) : (
          <PaymentReadonly
            nominal={nominalPay}
            desain={dpDesainPay}
            produksi={dpProduksiPays}
            fallbackNominal={Number(order.nominal_order) || 0}
            fallbackDesain={Number(order.dp_desain) || 0}
            fallbackProduksi={Number(order.dp_produksi) || 0}
            lbl={lbl}
            val={val}
          />
        )}
      </section>

      {/* Link Tracking */}
      <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6">
        <h2 className="text-base font-bold text-white mb-5">Link Tracking</h2>
        {order.tracking_link ? (
          <TrackingLink url={order.tracking_link} />
        ) : (
          <p className="text-sm text-slate-500">Link tracking akan tersedia setelah Work Order dibuat.</p>
        )}
      </section>
    </div>
  );
}

function ItemsSection({ orderId, items, onRefresh }: { orderId: number; items: Row[]; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [newPaket, setNewPaket] = useState('');
  const [newQty, setNewQty] = useState('');
  const [paketList, setPaketList] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    dbGet('paket').then(setPaketList).catch(() => {});
  }, []);

  async function handleAdd() {
    if (!newPaket) { toast.warning('Validasi', 'Pilih paket'); return; }
    setSaving(true);
    try {
      await dbCreate('order_items', { order_id: orderId, paket_nama: newPaket, bahan_kain: '', qty: Number(newQty) || 0 });
      setAdding(false); setNewPaket(''); setNewQty('');
      toast.success('Item Ditambahkan');
      onRefresh();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function handleDeleteItem(id: number) {
    const yes = await toast.confirm({ title: 'Hapus Item?', message: 'Item ini akan dihapus.', type: 'danger', confirmText: 'Hapus' });
    if (!yes) return;
    await dbDelete('order_items', id);
    toast.deleted('Item Dihapus');
    onRefresh();
  }

  const inp = 'w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer';

  return (
    <section className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 mb-4">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-white">Items</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg hover:bg-blue-500/10 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Tambah Item
          </button>
        )}
      </div>
      <table className="w-full">
        <thead><tr className="border-b border-white/[0.06]">
          <th className="text-[11px] text-slate-500 font-medium text-left pb-3 uppercase tracking-wider">Paket</th>
          <th className="text-[11px] text-slate-500 font-medium text-left pb-3 uppercase tracking-wider">QTY</th>
          <th className="text-[11px] text-slate-500 font-medium text-right pb-3 uppercase tracking-wider w-16">Aksi</th>
        </tr></thead>
        <tbody>
          {items.map((item: Row) => (
            <tr key={item.id} className="border-b border-white/[0.04]">
              <td className="py-3 text-sm text-blue-400 font-medium">{item.paket_nama}</td>
              <td className="py-3 text-sm text-white">{item.qty || 0}</td>
              <td className="py-3 text-right">
                <button onClick={() => handleDeleteItem(item.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && !adding && (
            <tr><td colSpan={3} className="py-6 text-center text-sm text-slate-500">Tidak ada item. Klik &quot;Tambah Item&quot; untuk menambahkan.</td></tr>
          )}
          {adding && (
            <tr className="border-b border-white/[0.04] bg-white/[0.02]">
              <td className="py-2 pr-2">
                <select value={newPaket} onChange={e => setNewPaket(e.target.value)} className={inp}>
                  <option value="">Pilih paket...</option>
                  {[...paketList].sort((a, b) => String(a.nama).localeCompare(String(b.nama))).map(p => <option key={p.id} value={p.nama}>{p.nama}</option>)}
                </select>
              </td>
              <td className="py-2 pr-2">
                <input type="number" min={0} value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="0" className={inp} />
              </td>
              <td className="py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={handleAdd} disabled={saving} className="text-emerald-400 hover:text-emerald-300 transition-colors p-1" title="Simpan">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  </button>
                  <button onClick={() => { setAdding(false); setNewPaket(''); setNewQty(''); }} className="text-slate-500 hover:text-slate-300 transition-colors p-1" title="Batal">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

// Removed: DetailBahanSection + EkspedisiEdit. Both belong to the retired
// Buat Order Baru fields. Kept here for git-history reference in one place
// via commit messages instead of dead code.

function PaymentEdit({ label, value, onChange, onRemove }: {
  label: string;
  value: PaymentInfo;
  onChange: (v: PaymentInfo) => void;
  onRemove?: () => void;
}) {
  const patch = (p: Partial<PaymentInfo>) => onChange({ ...value, ...p });
  const selCls = 'w-full bg-[#0d1117] border border-white/10 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer';
  const lblCls = 'text-[11px] text-blue-400/70 font-medium uppercase tracking-wider';
  return (
    <div className="space-y-2 rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <p className={lblCls}>{label}</p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-slate-500 hover:text-red-400 transition-colors p-0.5" title="Hapus">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      <RpInput value={value.amount} onChange={v => patch({ amount: v })} />
      <div className="grid grid-cols-2 gap-2">
        <select value={value.bank} onChange={e => patch({ bank: e.target.value })} className={selCls}>
          <option value="">Nama Bank...</option>
          {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={value.method}
          onChange={e => {
            const m = e.target.value;
            patch({ method: m, methodOther: m === 'DLL' ? value.methodOther : '' });
          }}
          className={selCls}
        >
          <option value="">Metode...</option>
          {METHOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {value.method === 'DLL' && (
        <input
          type="text"
          value={value.methodOther}
          onChange={e => patch({ methodOther: e.target.value })}
          placeholder="Ketik metode pembayaran..."
          className="w-full bg-[#0d1117] border border-white/10 text-white text-xs placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500/40"
        />
      )}
    </div>
  );
}

function PaymentReadonly({ nominal, desain, produksi, fallbackNominal, fallbackDesain, fallbackProduksi, lbl, val }: {
  nominal: PaymentInfo;
  desain: PaymentInfo;
  produksi: PaymentInfo[];
  fallbackNominal: number;
  fallbackDesain: number;
  fallbackProduksi: number;
  lbl: string;
  val: string;
}) {
  const totalProduksi = produksi.reduce((s, p) => s + (p.amount || 0), 0) || fallbackProduksi;
  const kekurangan = Math.max(0, (nominal.amount || fallbackNominal) - (desain.amount || fallbackDesain) - totalProduksi);
  const row = (label: string, p: PaymentInfo, fallbackAmount: number) => {
    const amt = p.amount || fallbackAmount;
    const method = p.method === 'DLL' ? (p.methodOther || 'DLL') : p.method;
    return (
      <div>
        <p className={lbl}>{label}</p>
        <p className={val}>{fmtMoney(amt)}</p>
        {(p.bank || method) && (
          <p className="text-[11px] text-slate-500 mt-0.5">{[p.bank, method].filter(Boolean).join(' · ')}</p>
        )}
      </div>
    );
  };
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
      {row('Nominal Order', nominal, fallbackNominal)}
      {row('DP Desain', desain, fallbackDesain)}
      {produksi.length > 0 && produksi.some(p => p.amount > 0)
        ? produksi
            .map((p, i) => p.amount > 0 ? (
              <div key={i}>
                <p className={lbl}>{produksi.length > 1 ? `DP Produksi #${i + 1}` : 'DP Produksi'}</p>
                <p className={val}>{fmtMoney(p.amount)}</p>
                {(p.bank || p.method) && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{[p.bank, p.method === 'DLL' ? (p.methodOther || 'DLL') : p.method].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            ) : null)
            .filter(Boolean)
        : (
          <div>
            <p className={lbl}>DP Produksi</p>
            <p className={val}>{fmtMoney(fallbackProduksi)}</p>
          </div>
        )}
      <div>
        <p className={lbl}>Kekurangan</p>
        <p className={val}>{fmtMoney(kekurangan)}</p>
      </div>
    </div>
  );
}

function TrackingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const full = typeof window !== 'undefined' && url.startsWith('/') ? `${window.location.origin}${url}` : url;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-[#0d1117] border border-white/[0.06] px-4 py-3 text-sm text-slate-400 break-all">{full}</div>
      <div className="flex gap-2">
        <button onClick={() => { navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-1.5 text-xs text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg hover:bg-blue-500/10 transition-colors">
          {copied ? 'Tersalin!' : 'Copy Link'}
        </button>
        <a href={url} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/[0.04] transition-colors">
          Buka Tracking
        </a>
      </div>
    </div>
  );
}

function RpInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const fmt = (n: number) => n ? new Intl.NumberFormat('id-ID').format(n) : '';
  const parse = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0;
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">Rp</span>
      <input type="text" value={fmt(value)} onChange={e => onChange(parse(e.target.value))} placeholder="0"
        className="w-full bg-[#0d1117] border border-white/10 text-white rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500/40" />
    </div>
  );
}

// Combined editor for Pilihan Layanan. Splits pilihan_paket into base
// ("Reguler" | "Express" | "Prioritas") + durasi when the stored string is
// "Express - {durasi}", then rejoins on change. Deadline lock only surfaces
// for Prioritas.
function PilihanLayananEdit({ editing, form, order, set, inp, lbl, val }: {
  editing: boolean;
  form: Row;
  order: Row;
  set: (k: string, v: string | number) => void;
  inp: string;
  lbl: string;
  val: string;
}) {
  if (!editing) {
    return (
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <p className={lbl}>Pilihan Layanan</p>
          <p className={val}>{order.pilihan_paket || '-'}</p>
        </div>
        {order.pilihan_paket && String(order.pilihan_paket).toLowerCase().startsWith('prioritas') && (
          <div>
            <p className={lbl}>Deadline Lock</p>
            <p className={val}>{fmtDate(order.deadline_lock)}</p>
          </div>
        )}
      </div>
    );
  }

  const raw = String(form.pilihan_paket || '');
  const isExpress = raw.toLowerCase().startsWith('express');
  const isPrioritas = raw.toLowerCase().startsWith('prioritas');
  const isReguler = raw.toLowerCase().startsWith('reguler');
  const base = isExpress ? 'Express' : isPrioritas ? 'Prioritas' : isReguler ? 'Reguler' : '';
  const durasi = isExpress ? raw.replace(/^Express\s*-\s*/i, '').trim() : '';

  const durationOptions = ['1 hari', '3 hari', '5 hari', '7 hari', '10 - 12 hari'];

  const setBase = (b: string) => {
    if (b === 'Express') {
      set('pilihan_paket', durasi ? `Express - ${durasi}` : 'Express');
      set('deadline_lock', '');
    } else if (b === 'Prioritas') {
      set('pilihan_paket', 'Prioritas');
    } else if (b === 'Reguler') {
      set('pilihan_paket', 'Reguler');
      set('deadline_lock', '');
    } else {
      set('pilihan_paket', '');
      set('deadline_lock', '');
    }
  };

  const setDurasi = (d: string) => {
    set('pilihan_paket', d ? `Express - ${d}` : 'Express');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <p className={lbl}>Pilihan Layanan</p>
          <select value={base} onChange={e => setBase(e.target.value)} className={inp}>
            <option value="">(Pilih layanan)</option>
            <option value="Reguler">Reguler</option>
            <option value="Express">Express</option>
            <option value="Prioritas">Prioritas</option>
          </select>
        </div>
        {base === 'Express' && (
          <div>
            <p className={lbl}>Durasi Express</p>
            <select value={durasi} onChange={e => setDurasi(e.target.value)} className={inp}>
              <option value="">(Pilih durasi)</option>
              {durationOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        {base === 'Prioritas' && (
          <div>
            <p className={lbl}>Deadline Lock</p>
            <input
              type="date"
              value={toDateInput(form.deadline_lock || '')}
              onChange={e => set('deadline_lock', e.target.value)}
              className={`${inp} date-input`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
