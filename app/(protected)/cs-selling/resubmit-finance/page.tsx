'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbGet, dbUpdate, dbCreate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

/**
 * Resubmit Finance — daftar order CS Selling yang ditolak Finance.
 * CS Selling bisa upload bukti transfer ulang di sini (mini dialog),
 * atomatis reset finance_status → order kembali ke queue Menunggu
 * Approval Finance.
 *
 * Filter: orders WHERE finance_status='REJECTED'
 *   AND (created_via='CS_SELLING' OR created_via IS NULL)
 * (tampil semua rejected termasuk yang legacy tanpa created_via).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtRp(n: number): string {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, y, mo, d] = m;
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${d} ${B[Number(mo) - 1]} ${y}`;
}

function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?/);
  if (!m) return s;
  const [, y, mo, d, hh, mi] = m;
  const B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const time = hh && mi ? ` · ${hh}:${mi}` : '';
  return `${d} ${B[Number(mo) - 1]} ${y}${time}`;
}

export default function ResubmitFinancePage() {
  const toast = useToast();
  const [orders, setOrders] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploadingOrder, setUploadingOrder] = useState<Row | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, l] = await Promise.all([
        dbGet('orders'),
        dbGet('order_payments').catch(() => []),
        dbGet('leads').catch(() => []),
      ]);
      setOrders(o);
      setPayments(p);
      setLeads(l);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const paymentsByOrder = useMemo(() => {
    const m: Record<number, Row[]> = {};
    for (const p of payments) {
      const oid = Number(p.order_id);
      (m[oid] || (m[oid] = [])).push(p);
    }
    return m;
  }, [payments]);

  const leadById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const l of leads) m[Number(l.id)] = String(l.nama || '');
    return m;
  }, [leads]);

  const rejectedOrders = useMemo(() => {
    return orders
      .filter(o => {
        const fs = String(o.finance_status || '').toUpperCase();
        if (fs !== 'REJECTED') return false;
        // Include CS_SELLING + legacy null created_via.
        const via = String(o.created_via || '').toUpperCase();
        return via === 'CS_SELLING' || via === '';
      })
      .sort((a, b) => {
        // Yang paling baru di-reject di atas (finance_approved_at DESC).
        const at = String(a.finance_approved_at || a.created_at || '');
        const bt = String(b.finance_approved_at || b.created_at || '');
        return bt.localeCompare(at);
      });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rejectedOrders;
    return rejectedOrders.filter(o =>
      String(o.no_order || '').toLowerCase().includes(q)
      || String(o.customer_nama || '').toLowerCase().includes(q)
      || String(o.customer_phone || '').toLowerCase().includes(q)
    );
  }, [rejectedOrders, search]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 bg-white/[0.03] rounded-2xl animate-pulse" />
      <div className="h-64 bg-white/[0.03] rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-rose-500/[0.14] via-red-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500/25 to-rose-500/5 border border-rose-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Resubmit Finance</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Order CS Selling yang ditolak Finance. Upload bukti transfer ulang → auto kembali ke queue Menunggu.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-2">
              <p className="text-[10px] text-rose-300/70 uppercase tracking-wider">Perlu Resubmit</p>
              <p className="text-xl font-bold text-white tabular-nums">{rejectedOrders.length}</p>
            </div>
            <button
              onClick={fetchAll}
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-white/10 bg-[#111827] hover:bg-white/[0.04] transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-4">
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari No Order, customer, atau nomor HP..."
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-rose-500/40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 w-28">No Order</th>
                <th className="text-left px-4 py-3 min-w-[200px]">Customer</th>
                <th className="text-left px-4 py-3 w-32">Leads</th>
                <th className="text-left px-4 py-3 w-32">No HP</th>
                <th className="text-right px-4 py-3 w-32">DP Desain</th>
                <th className="text-left px-4 py-3 min-w-[240px]">Catatan Finance</th>
                <th className="text-left px-4 py-3 w-36">Tgl Ditolak</th>
                <th className="text-center px-4 py-3 w-32">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    {rejectedOrders.length === 0
                      ? 'Tidak ada order CS Selling yang ditolak Finance. Semua clean.'
                      : 'Tidak ada hasil untuk pencarian tersebut.'}
                  </td>
                </tr>
              ) : (
                filteredOrders.map(o => {
                  const orderPayments = paymentsByOrder[Number(o.id)] || [];
                  const dpDesain = orderPayments.find(p => String(p.tipe) === 'dp_desain');
                  const dpAmt = Number(dpDesain?.amount || o.dp_desain || 0);
                  return (
                    <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-blue-300 font-mono text-xs">{o.no_order || `#${o.id}`}</td>
                      <td className="px-4 py-3 text-white font-medium">{o.customer_nama || '-'}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{leadById[Number(o.lead_id)] || '-'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs tabular-nums">{o.customer_phone || '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{dpAmt > 0 ? fmtRp(dpAmt) : '-'}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-rose-200 line-clamp-2" title={o.finance_notes || '(tanpa catatan)'}>
                          {o.finance_notes || <span className="text-slate-500 italic">Tanpa catatan</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fmtDateTime(o.finance_approved_at)}</td>
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => setUploadingOrder(o)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-md transition-colors shadow-lg shadow-emerald-500/20"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                          Upload Ulang
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filteredOrders.length > 0 && (
          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500">
            <span>{filteredOrders.length} order ditampilkan</span>
            <span>Sort: Ditolak terbaru dulu</span>
          </div>
        )}
      </div>

      {uploadingOrder && (
        <UploadUlangModal
          order={uploadingOrder}
          existingPayment={
            paymentsByOrder[Number(uploadingOrder.id)]?.find(p => String(p.tipe) === 'dp_desain') || null
          }
          onClose={() => setUploadingOrder(null)}
          onSaved={async () => {
            setUploadingOrder(null);
            await fetchAll();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   UploadUlangModal — mini form: bank + method + bukti_tf.
   Klik Kirim Ulang: update order_payments (dp_desain) + reset
   finance_status ke null.
   ───────────────────────────────────────────────────────────────────── */
function UploadUlangModal({
  order,
  existingPayment,
  onClose,
  onSaved,
}: {
  order: Row;
  existingPayment: Row | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [bank, setBank] = useState(String(existingPayment?.bank_name || ''));
  const [method, setMethod] = useState(String(existingPayment?.method || 'TF'));
  const [methodOther, setMethodOther] = useState(String(existingPayment?.method_other || ''));
  const [buktiTf, setBuktiTf] = useState<string | null>(existingPayment?.bukti_tf ? String(existingPayment.bukti_tf) : null);
  const [buktiName, setBuktiName] = useState(String(existingPayment?.bukti_tf_name || ''));
  const [bankList, setBankList] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dbGet('bank').then(rs => setBankList(Array.isArray(rs) ? rs : [])).catch(() => setBankList([]));
  }, []);

  async function handleFile(f: File) {
    if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) {
      toast.error('Tipe File Tidak Didukung', 'Hanya gambar atau PDF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBuktiTf(String(reader.result || ''));
      setBuktiName(f.name);
    };
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!buktiTf) {
      toast.error('Bukti Belum Diupload', 'Upload bukti transfer dulu sebelum kirim.');
      return;
    }
    setSaving(true);
    try {
      // Update / create dp_desain payment
      const paymentPayload = {
        order_id: order.id,
        tipe: 'dp_desain',
        amount: Number(existingPayment?.amount || order.dp_desain || 0),
        bank_name: bank || null,
        method: method || null,
        method_other: method === 'DLL' ? (methodOther || null) : null,
        urutan: 1,
        bukti_tf: buktiTf,
        bukti_tf_name: buktiName || null,
      };
      if (existingPayment?.id) {
        await dbUpdate('order_payments', Number(existingPayment.id), paymentPayload);
      } else {
        await dbCreate('order_payments', paymentPayload);
      }
      // Reset finance status supaya order kembali ke queue Menunggu.
      await dbUpdate('orders', Number(order.id), {
        finance_status: null,
        finance_notes: null,
        finance_approved_by: null,
        finance_approved_at: null,
      });
      toast.success(
        'Bukti Dikirim Ulang',
        `${order.no_order} kembali ke Approval Finance untuk review ulang.`
      );
      await onSaved();
    } catch (e) {
      toast.error('Gagal Kirim', String(e));
    }
    setSaving(false);
  }

  const isImage = buktiTf && (buktiTf.startsWith('data:image') || /\.(png|jpe?g|gif|webp)$/i.test(buktiName));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div className="relative bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-r from-emerald-500/[0.08] to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">Upload Bukti Ulang</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="text-blue-300 font-mono">{order.no_order}</span> · {order.customer_nama || '(Tanpa nama)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/[0.05] rounded-lg disabled:opacity-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Catatan Finance banner */}
          {order.finance_notes && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3">
              <p className="text-[10px] font-bold text-rose-300 uppercase tracking-widest">Catatan Finance</p>
              <p className="text-xs text-rose-100 mt-1 whitespace-pre-wrap">{order.finance_notes}</p>
            </div>
          )}

          {/* Bank + Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Bank</label>
              <select
                value={bank}
                onChange={e => setBank(e.target.value)}
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/40"
              >
                <option value="">Pilih bank...</option>
                {bankList.map(b => (
                  <option key={b.id} value={b.nama}>{b.nama}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Metode</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/40"
              >
                <option value="TF">TF</option>
                <option value="QRIS">QRIS</option>
                <option value="TUNAI">TUNAI</option>
                <option value="DLL">DLL</option>
              </select>
            </div>
          </div>
          {method === 'DLL' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Metode Lain</label>
              <input
                type="text"
                value={methodOther}
                onChange={e => setMethodOther(e.target.value)}
                placeholder="Sebutkan metode lain..."
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500/40"
              />
            </div>
          )}

          {/* Bukti TF */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Bukti Transfer <span className="text-rose-400">*</span>
            </label>
            {!buktiTf ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                className={`border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-emerald-500/60 bg-emerald-500/[0.05]' : 'border-white/10 hover:border-emerald-500/40 bg-white/[0.02]'
                }`}
              >
                <svg className="w-8 h-8 text-slate-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" />
                </svg>
                <p className="text-xs text-slate-400">Klik untuk pilih file atau drop di sini</p>
                <p className="text-[10px] text-slate-600 mt-1">PNG / JPG / PDF</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 truncate flex-1" title={buktiName}>{buktiName || 'bukti.tf'}</span>
                  <button
                    onClick={() => { setBuktiTf(null); setBuktiName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-[10px] text-rose-300 border border-rose-500/40 hover:bg-rose-500/10 px-2 py-1 rounded"
                  >
                    Ganti
                  </button>
                </div>
                {isImage && (
                  <img src={buktiTf} alt="Bukti TF" className="max-h-48 rounded border border-white/10 w-full object-contain bg-white/5" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06] bg-white/[0.015]">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={saving || !buktiTf}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20"
          >
            {saving ? 'Mengirim...' : 'Kirim Ulang ke Finance'}
          </button>
        </div>
      </div>
    </div>
  );
}
