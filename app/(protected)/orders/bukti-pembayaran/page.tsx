'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { dbGet, dbCreate, dbUpdate } from '@/lib/api-db';
import { invalidateCache } from '@/lib/cache';
import { useToast } from '@/lib/toast';
import { sha256Hex } from '@/lib/hash';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtRp(n: number) { return new Intl.NumberFormat('id-ID').format(n); }
function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(v);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

interface DpUpload {
  paymentId: number;
  // Display label for the row (e.g. "DP Produksi #II").
  label: string;
  urutan: number;
  amount: number;
  tanggal: string;
  // Kalau row ini pakai metode Cash, upload area disembunyikan dan
  // row otomatis "lengkap" tanpa perlu bukti TF — cukup dicatat note.
  isCash: boolean;
  existingBuktiTf: string | null;
  existingBuktiTfName: string | null;
  // Local state for a fresh upload — replaces existing on save.
  file: File | null;
  buktiTf: string | null;
  buktiTfName: string;
}

export default function BuktiPembayaranPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [pickedOrderId, setPickedOrderId] = useState<string>('');
  const [rows, setRows] = useState<DpUpload[]>([]);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('order_payments').catch(() => []),
      ]);
      setOrders(o);
      setPayments(p);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Bukti Pembayaran candidates: CS_SELLING orders whose Rincian is done
  // (status has moved past SELLING → PENDING/CONFIRMED/IN_PROGRESS) and
  // whose Bukti step hasn't been marked complete yet. Once bukti_uploaded
  // flips to 1 they leave this queue.
  const candidateOrders = useMemo(() => {
    return orders
      .filter(o => {
        const via = String(o.created_via || '').toUpperCase();
        const st = String(o.status || '').toUpperCase();
        const bu = Number(o.bukti_uploaded);
        return via === 'CS_SELLING'
          && st !== 'SELLING' && st !== 'DONE'
          && bu !== 1;
      })
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [orders]);

  const pickedOrder = useMemo(
    () => orders.find(o => String(o.id) === pickedOrderId) || null,
    [orders, pickedOrderId]
  );

  // Sync rows whenever the picker changes. Rules:
  //   • Hanya row dp_produksi yang muncul di sini — DP Desain sudah
  //     di-upload di CS Selling (repeat order pun sudah punya bukti
  //     dari cycle sebelumnya, jadi tidak perlu upload ulang).
  //   • Row dengan amount 0 di-skip.
  //   • Row dengan method='CASH' tetap muncul tapi upload disembunyikan
  //     (isCash=true) — pembayaran cash tidak butuh bukti transfer.
  useEffect(() => {
    if (!pickedOrderId) { setRows([]); return; }
    const oid = Number(pickedOrderId);
    const orderPays = payments
      .filter(p => Number(p.order_id) === oid);

    const relevant = orderPays.filter(p => {
      const tipe = String(p.tipe);
      const amt = Number(p.amount) || (Number(p.tunai) || 0) + (Number(p.trf) || 0);
      if (amt <= 0) return false;
      return tipe === 'dp_produksi';
    });

    relevant.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));

    // Roman numeral untuk penamaan DP Produksi #II/#III/dst (row I di
    // schedule konseptual adalah DP Desain, sudah dihandle di CS Selling).
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    setRows(
      relevant.map(p => {
        const idxProduksi = Number(p.urutan) || 0;
        const label = `DP Produksi #${roman[idxProduksi + 1] || String(idxProduksi + 2)}`;
        const isCash = String(p.method || '').toUpperCase() === 'CASH';
        return {
          paymentId: Number(p.id),
          label,
          urutan: idxProduksi,
          amount: Number(p.amount) || (Number(p.tunai) || 0) + (Number(p.trf) || 0),
          tanggal: String(p.tanggal || '').slice(0, 10),
          isCash,
          existingBuktiTf: p.bukti_tf ? String(p.bukti_tf) : null,
          existingBuktiTfName: p.bukti_tf_name ? String(p.bukti_tf_name) : null,
          file: null,
          buktiTf: null,
          buktiTfName: '',
        };
      })
    );
  }, [pickedOrderId, payments]);

  function updateRow(paymentId: number, patch: Partial<DpUpload>) {
    setRows(rs => rs.map(r => r.paymentId === paymentId ? { ...r, ...patch } : r));
  }

  async function handleFile(paymentId: number, f: File) {
    // Reject anything that isn't a real payment proof (image / PDF).
    // Drag-drop from WhatsApp Desktop sometimes drops the message
    // metadata as text/plain — this guard keeps that out.
    if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) {
      toast.error('Tipe File Tidak Didukung', 'Hanya gambar (PNG/JPG) atau PDF yang bisa diupload sebagai bukti TF.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('File Terlalu Besar', 'Ukuran maksimal 5 MB. Kompres foto TF-nya dulu.');
      return;
    }
    // Upload immediately so we already have a URL by the time user
    // clicks Simpan. On failure, fall back to a base64 data URI so
    // the flow still works.
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok && j?.url) {
        updateRow(paymentId, { file: f, buktiTf: String(j.url), buktiTfName: String(j.originalName || f.name) });
        return;
      }
      throw new Error(j?.error || 'Upload gagal');
    } catch (err) {
      console.warn('filesystem upload failed, using base64:', err);
      const reader = new FileReader();
      reader.onload = () => {
        updateRow(paymentId, { file: f, buktiTf: String(reader.result || ''), buktiTfName: f.name });
      };
      reader.readAsDataURL(f);
    }
  }

  function onFileChange(paymentId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(paymentId, f);
  }

  function clearFile(paymentId: number) {
    updateRow(paymentId, { file: null, buktiTf: null, buktiTfName: '' });
    const ref = inputRefs.current[paymentId];
    if (ref) ref.value = '';
  }

  // Row cash otomatis "lengkap" — tidak butuh bukti TF.
  const filledCount = rows.filter(r => r.isCash || r.buktiTf || r.existingBuktiTf).length;
  const canSave = pickedOrder && rows.length > 0 && filledCount === rows.length;

  async function handleSave() {
    if (!pickedOrder) return;
    if (!canSave) {
      toast.warning('Bukti Belum Lengkap', 'Semua DP Produksi harus punya bukti TF sebelum kirim ke Finance.');
      return;
    }
    setSaving(true);
    try {
      // Persist each row's bukti_tf into order_payments if it changed.
      for (const r of rows) {
        if (!r.buktiTf) continue; // no new upload, keep existing
        try {
          await dbUpdate('order_payments', r.paymentId, {
            bukti_tf: r.buktiTf,
            bukti_tf_name: r.buktiTfName || null,
          });
        } catch (err) {
          console.warn('bukti_tf update failed for payment', r.paymentId, err);
        }
      }

      // Flip bukti_uploaded=1 + reset finance_status so Approval Finance
      // gets the order into its Menunggu tab for full-invoice review.
      // Legacy DB without bukti_uploaded column: fall back gracefully.
      try {
        await dbUpdate('orders', Number(pickedOrder.id), {
          bukti_uploaded: 1,
          finance_status: null,
          finance_notes: null,
        });
      } catch (err) {
        console.warn('orders update with bukti_uploaded failed, retrying without:', err);
        try {
          await dbUpdate('orders', Number(pickedOrder.id), {
            finance_status: null,
            finance_notes: null,
          });
          toast.warning('Kolom bukti_uploaded Belum Ada',
            'Jalankan /api/admin/run-migrations lalu ulangi simpan supaya order pindah ke Finance.');
        } catch {}
      }

      // Auto-create WO (placeholder, wo_confirmed=0) supaya order langsung
      // muncul di Produksi → Waiting List sebagai read-only. Gate Waiting
      // List → Approval Design tetap dijaga oleh finance_status='APPROVED',
      // jadi row tidak bisa maju sampai Finance verify. Gate Proofing →
      // Approval WO dijaga oleh wo_confirmed=1 supaya admin wajib buka
      // menu Work Orders dan detail WO-nya dulu sebelum proses lanjut.
      try {
        const orderId = Number(pickedOrder.id);
        const allWos = await dbGet('work_orders');
        const existingWo = (allWos as Row[]).find(w => Number(w.order_id) === orderId);
        if (!existingWo) {
          const now = new Date();
          const prefix = `WO${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
          const suffixRe = new RegExp(`^${prefix}-(\\d+)$`);
          const maxNum = (allWos as Row[]).reduce((max: number, w: Row) => {
            const m = String(w.no_wo || '').match(suffixRe);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
          }, 0);
          const noWo = `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
          const trackingHash = await sha256Hex(noWo);

          const stagesRaw = await dbGet('production_stages');
          const sortedStages = (stagesRaw as Row[])
            .filter(s => s.active === undefined || s.active === 1 || s.active === true)
            .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
          const firstStageId = sortedStages[0]?.id;

          const orderItems = await dbGet('order_items').catch(() => []);
          const rowsForOrder = (orderItems as Row[]).filter(it => Number(it.order_id) === orderId);
          const paketNames = rowsForOrder.map(it => String(it.paket_nama || '')).filter(Boolean).join(', ') || '-';
          const totalQty = rowsForOrder.reduce((s, it) => s + (Number(it.qty) || 0), 0);
          // work_orders.deadline NOT NULL di base schema. Kasih placeholder
          // +7 hari; admin nanti overwrite via menu Work Orders sesuai
          // jadwal produksi sebenarnya.
          const woDeadline = (() => {
            const d = new Date(); d.setDate(d.getDate() + 7);
            return d.toISOString().split('T')[0];
          })();

          const woId = await dbCreate('work_orders', {
            no_wo: noWo,
            tracking_hash: trackingHash,
            order_id: orderId,
            customer_nama: String(pickedOrder.customer_nama || '').trim(),
            paket: paketNames,
            bahan: '-',
            jumlah: totalQty,
            deadline: woDeadline,
            keterangan: String(pickedOrder.keterangan || ''),
            status: 'PROSES_PRODUKSI',
            current_stage_id: firstStageId,
            // wo_confirmed=0: WO cuma placeholder — Admin harus detail via
            // menu Work Orders sebelum row Proofing bisa lanjut ke Approval WO.
            wo_confirmed: 0,
          });

          for (const stage of sortedStages) {
            try {
              await dbCreate('wo_progress', {
                work_order_id: woId,
                stage_id: stage.id,
                status: stage.id === firstStageId ? 'TERSEDIA' : 'BELUM',
              });
            } catch {}
          }

          try {
            await dbUpdate('orders', orderId, {
              tracking_link: `/tracking/${trackingHash}`,
            });
          } catch {}
        }
      } catch (err) {
        console.warn('auto-create WO from Bukti Pembayaran failed:', err);
        toast.warning('WO Belum Terbentuk',
          'Order tersimpan tapi WO otomatis belum terbentuk. Buat manual dari menu Work Orders.');
      }

      invalidateCache('wp_orders', 'wp_dashboard');
      toast.success('Bukti Pembayaran Tersimpan',
        `${pickedOrder.no_order} diteruskan ke Approval Finance untuk review invoice.`);
      setPickedOrderId('');
      await fetchAll();
    } catch (e) {
      toast.error('Gagal Menyimpan', String(e));
    }
    setSaving(false);
  }

  const inputCls = 'w-full bg-[#0d1117] border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/40 rounded-lg px-3 py-2';

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-white">Bukti Pembayaran</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload bukti transfer untuk tiap DP Produksi. Setelah lengkap, order diteruskan ke Approval Finance untuk review invoice.
        </p>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Pilih Order <span className="text-rose-400">*</span>
          </label>
          <select
            value={pickedOrderId}
            onChange={e => setPickedOrderId(e.target.value)}
            className={`${inputCls} appearance-none cursor-pointer`}
            disabled={loading}
          >
            <option value="">— Pilih customer / no order —</option>
            {candidateOrders.map(o => (
              <option key={o.id} value={o.id}>
                {o.no_order} · {o.customer_nama || '-'}
              </option>
            ))}
          </select>
          {!loading && candidateOrders.length === 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              Tidak ada order yang menunggu upload bukti. Order muncul di sini setelah CS Order menyimpan Rincian Order dan sebelum Finance approve invoice.
            </p>
          )}
        </div>

        {pickedOrder && (
          <div className="text-[11px] text-slate-500 border border-white/[0.06] bg-white/[0.02] rounded-lg p-3 flex flex-wrap gap-x-6 gap-y-1">
            <span>Customer: <strong className="text-slate-300">{pickedOrder.customer_nama}</strong></span>
            <span>No HP: <strong className="text-slate-300">{pickedOrder.customer_phone || '-'}</strong></span>
            <span>Tgl Order: <strong className="text-slate-300">{fmtDate(pickedOrder.tanggal_order)}</strong></span>
          </div>
        )}
      </div>

      {pickedOrder && rows.length === 0 && (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-8 text-center">
          <p className="text-sm text-slate-400">
            Order ini belum punya DP Produksi. Lengkapi <strong className="text-white">Rincian Order</strong> dulu di CS Order.
          </p>
        </div>
      )}

      {pickedOrder && rows.length > 0 && (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              Upload Bukti DP Produksi ({filledCount}/{rows.length})
            </h2>
            <span className="text-[11px] text-slate-500">
              DP Desain sudah di-upload di CS Selling, jadi tidak perlu di sini.
            </span>
          </div>

          <div className="space-y-3">
            {rows.map((r) => {
              const activeBukti = r.buktiTf || r.existingBuktiTf;
              const activeName = r.buktiTfName || r.existingBuktiTfName || 'bukti.tf';
              const isDragging = dragOverId === r.paymentId;
              return (
                <div key={r.paymentId} className="border border-white/10 rounded-lg p-4 bg-[#0d1117]">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {r.label}
                        {r.isCash && (
                          <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-300 bg-amber-500/10">
                            Cash
                          </span>
                        )}
                        {!r.isCash && r.existingBuktiTf && !r.buktiTf && (
                          <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                            Bukti sudah ada
                          </span>
                        )}
                        {!r.isCash && r.buktiTf && (
                          <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-300 bg-blue-500/10">
                            Baru diupload
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {r.tanggal ? fmtDate(r.tanggal) : 'Tanggal belum diset'} · Nominal Rp {fmtRp(r.amount)}
                      </div>
                    </div>
                    {!r.isCash && activeBukti && (
                      <button
                        onClick={() => clearFile(r.paymentId)}
                        className="text-xs text-slate-500 hover:text-rose-400 shrink-0"
                      >
                        Ganti
                      </button>
                    )}
                  </div>

                  {r.isCash ? (
                    <div className="border-2 border-dashed border-amber-500/30 rounded-lg py-6 px-4 text-center bg-amber-500/5">
                      <div className="text-sm text-amber-200 font-medium">Pembayaran CASH</div>
                      <div className="text-[11px] text-amber-400/70 mt-1">Bukti transfer tidak diperlukan — cukup dicatat sebagai pembayaran tunai.</div>
                    </div>
                  ) : !activeBukti ? (
                    <label
                      onDragEnter={(e) => { e.preventDefault(); setDragOverId(r.paymentId); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverId(r.paymentId); }}
                      onDragLeave={(e) => {
                        // Only clear when the pointer actually leaves the label,
                        // not when it hops between child nodes.
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        setDragOverId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverId(null);
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleFile(r.paymentId, f);
                      }}
                      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-6 cursor-pointer transition-colors ${
                        isDragging
                          ? 'border-blue-500/60 bg-blue-500/10'
                          : 'border-white/10 hover:border-blue-500/40 hover:bg-white/[0.02]'
                      }`}
                    >
                      <svg className={`w-6 h-6 ${isDragging ? 'text-blue-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <span className={`text-xs ${isDragging ? 'text-blue-300' : 'text-slate-400'}`}>
                        {isDragging ? 'Lepaskan file di sini' : 'Klik atau drop file untuk upload'}
                      </span>
                      <span className="text-[10px] text-slate-500">PNG, JPG, PDF · max 5 MB · drag dari WhatsApp / folder OK</span>
                      <input
                        ref={el => { inputRefs.current[r.paymentId] = el; }}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => onFileChange(r.paymentId, e)}
                      />
                    </label>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs text-slate-300 truncate">{activeName}</span>
                      </div>
                      {(activeBukti.startsWith('data:image')
                        || /\.(png|jpe?g|gif|webp)$/i.test(activeName)
                        || activeBukti.startsWith('/api/files/')) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={activeBukti} alt="Bukti TF" className="max-h-40 rounded border border-white/10" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={() => setPickedOrderId('')} disabled={saving}
              className="text-sm font-medium text-slate-400 hover:text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              Batal
            </button>
            <button onClick={handleSave} disabled={!canSave || saving}
              className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg transition-colors disabled:opacity-40">
              {saving ? 'Menyimpan...' : 'Simpan & Kirim ke Finance'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
