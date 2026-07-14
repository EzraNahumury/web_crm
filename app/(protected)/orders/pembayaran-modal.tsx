'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { invalidateCache } from '@/lib/cache';
import { useToast } from '@/lib/toast';
import { sha256Hex } from '@/lib/hash';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtRp(n: number) {
  if (!n) return '-';
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtRpPlain(n: number) {
  return new Intl.NumberFormat('id-ID').format(n);
}
function parseRp(s: string): number {
  return parseInt(s.replace(/\D/g, ''), 10) || 0;
}

interface ItemLine { id: number; nama: string; qty: number; harga: number }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // Optional order to pre-fill from CS Selling handoff. If omitted, users can
  // pick from a dropdown inside the modal.
  seedOrderId?: number | null;
  // Read-only view (from Aksi → Read on the /orders list): every input is
  // disabled, the Simpan button hides, and a tracking link appears at the
  // bottom so the reader can jump to the customer tracking page.
  readOnly?: boolean;
}

export default function PembayaranModal({ open, onClose, onSaved, seedOrderId, readOnly = false }: Props) {
  const toast = useToast();
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Bootstrap data
  const [orders, setOrders] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [pickedOrderId, setPickedOrderId] = useState<string>('');

  // Header
  const [nama, setNama] = useState('');
  const [alamat, setAlamat] = useState('');
  const [leadId, setLeadId] = useState<string>('');
  const [pembayTunai, setPembayTunai] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'bank' | ''>('');

  // Item lines
  const [itemLines, setItemLines] = useState<ItemLine[]>([]);

  // Ekspedisi
  const [ekspNama, setEkspNama] = useState('');
  const [ekspKg, setEkspKg] = useState<string>('');
  const [ekspBiaya, setEkspBiaya] = useState(0);

  // DP Design (dari CS Selling, read-only di modal ini). Kalau ada
  // pre-fill dari order_payments dp_desain, jumlahnya masuk sini.
  const [dpDesainAmount, setDpDesainAmount] = useState(0);
  const [dpDesainPaymentId, setDpDesainPaymentId] = useState<number | null>(null);

  // NB
  const [nb, setNb] = useState('');
  // Diskon percentage (0-100, default 0).
  const [diskonPct, setDiskonPct] = useState(0);
  // DP Produksi percentage (0-100, default 70).
  const [dpProdPct, setDpProdPct] = useState(70);
  // Tracking link surfaced at the bottom in read-only mode.
  const [trackingLink, setTrackingLink] = useState('');
  const [noOrder, setNoOrder] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [o, p, i, l] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('order_payments').catch(() => []),
        dbGet('order_items').catch(() => []),
        dbGet('leads').catch(() => []),
      ]);
      setOrders(o);
      setPayments(p);
      setItems(i);
      setLeads(l);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (open) fetchAll(); }, [open, fetchAll]);
  useEffect(() => {
    if (!open) return;
    // Sync picker with the seed each time the modal opens so switching
    // between rows shows the right order, and opening the blank "Pembayaran
    // AYRES" button clears any stale pick.
    setPickedOrderId(seedOrderId ? String(seedOrderId) : '');
  }, [open, seedOrderId]);

  // Prefill from the picked order
  useEffect(() => {
    if (!pickedOrderId) {
      // Clear so a fresh open (no seed) shows an empty invoice.
      setNama(''); setAlamat(''); setLeadId(''); setEkspNama(''); setEkspKg(''); setEkspBiaya(0);
      setNb(''); setTrackingLink(''); setNoOrder('');
      setDpDesainAmount(0); setDpDesainPaymentId(null);
      setDiskonPct(0); setDpProdPct(70);
      setItemLines([{ id: 1, nama: '', qty: 0, harga: 0 }]);
      return;
    }
    const o = orders.find(x => String(x.id) === pickedOrderId);
    if (!o) return;
    setNama(String(o.customer_nama || ''));
    const addrParts = [o.customer_alamat, o.customer_kecamatan, o.customer_kabupaten, o.customer_provinsi]
      .filter(Boolean).join(', ');
    setAlamat(addrParts);
    setLeadId(o.lead_id ? String(o.lead_id) : '');
    setEkspNama(String(o.ekspedisi_nama || ''));
    setEkspKg(o.ekspedisi_kg ? String(o.ekspedisi_kg) : '');
    setEkspBiaya(Number(o.ekspedisi_biaya) || 0);
    setNb(String(o.keterangan || ''));
    setTrackingLink(String(o.tracking_link || ''));
    setNoOrder(String(o.no_order || ''));
    // Diskon% dari order (kolom baru). Kalau tidak ada, default 0.
    setDiskonPct(Number(o.diskon_pct) || 0);

    // Load item lines
    const orderItems = items.filter(it => Number(it.order_id) === Number(o.id));
    if (orderItems.length > 0) {
      setItemLines(orderItems.map((it, idx) => ({
        id: idx + 1,
        nama: String(it.paket_nama || ''),
        qty: Number(it.qty) || 0,
        harga: Number(it.harga) || 0,
      })));
    } else {
      setItemLines([{ id: 1, nama: '', qty: 0, harga: 0 }]);
    }

    // Load DP Design dari CS Selling (order_payments.tipe='dp_desain').
    // Fallback ke orders.dp_desain scalar kalau row tidak ada.
    const dpDesainPay = payments.find(pp =>
      Number(pp.order_id) === Number(o.id) && String(pp.tipe) === 'dp_desain'
    );
    setDpDesainAmount(Number(dpDesainPay?.amount) || Number(o.dp_desain) || 0);
    setDpDesainPaymentId(dpDesainPay ? Number(dpDesainPay.id) : null);
  }, [pickedOrderId, orders, items, payments]);

  // One-shot migration bootstrap on modal open — makes sure migration
  // 022 (order_payments.tanggal/tunai/trf) has landed before anyone
  // saves a Pembayaran, otherwise the DP schedule reads back blank.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (!open || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    fetch('/api/admin/run-migrations')
      .then(r => r.json())
      .then(j => console.log('[pembayaran] migration bootstrap:', j))
      .catch(err => console.warn('[pembayaran] migration bootstrap failed:', err));
  }, [open]);

  // ─── Derived totals ───
  const totalPembelian = useMemo(
    () => itemLines.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.harga) || 0), 0),
    [itemLines]
  );
  // Grand Total = Total Pembelian + Ekspedisi (auto).
  const grandTotal = totalPembelian + (Number(ekspBiaya) || 0);
  // Diskon amount = grandTotal × diskonPct / 100.
  const diskonAmount = Math.round((grandTotal * diskonPct) / 100);
  // DP Produksi = grandTotal × dpProdPct / 100 (persen langsung dari
  // Grand Total, bukan dari sisa setelah dikurangi diskon / DP Design).
  const dpProduksi = Math.round((grandTotal * dpProdPct) / 100);
  // Sisa Tagihan = apa yang belum dibayar sama sekali oleh customer
  // setelah dikurangi diskon + DP Design + DP Produksi.
  const sisaTagihan = grandTotal - diskonAmount - (Number(dpDesainAmount) || 0) - dpProduksi;

  // ─── Helpers ───
  function addItemLine() {
    setItemLines(rs => [...rs, { id: (rs[rs.length - 1]?.id || 0) + 1, nama: '', qty: 0, harga: 0 }]);
  }
  function removeItemLine(idx: number) {
    setItemLines(rs => rs.filter((_, i) => i !== idx));
  }
  function updateItemLine(idx: number, k: keyof ItemLine, v: string | number) {
    setItemLines(rs => rs.map((r, i) => i === idx ? { ...r, [k]: v } : r));
  }

  // Dropdown = handoff pool for CS Order. Only orders that
  //   • are still at status='SELLING' (haven't been promoted yet), and
  //   • have finance_status='APPROVED' (Finance verified the bukti TF)
  // show up here. That means CS Selling → Finance → CS Order is a
  // linear pipeline: no bypass.
  const orderPickerOptions = useMemo(
    () => orders
      .filter(o =>
        String(o.status || '').toUpperCase() === 'SELLING'
        && String(o.finance_status || '').toUpperCase() === 'APPROVED'
      )
      .sort((a, b) => Number(b.id) - Number(a.id))
      .map(o => ({
        id: o.id,
        label: `${o.no_order} · ${o.customer_nama || '-'}`,
        status: String(o.status),
      })),
    [orders]
  );

  const leadName = leads.find(l => String(l.id) === leadId)?.nama || '';

  // Rasterize the on-screen invoice to a canvas. html2canvas-pro
  // (a drop-in fork) is used because it understands the modern CSS
  // color functions (oklch, lab, color-mix) Tailwind 4 emits, which
  // vanilla html2canvas can't parse. The onclone hook swaps every
  // form control in the cloned tree for a static text node so
  // input/textarea/select values actually show up in the export.
  async function rasterizeInvoice(): Promise<HTMLCanvasElement | null> {
    if (!invoiceRef.current) return null;
    const html2canvas = (await import('html2canvas-pro')).default;
    return html2canvas(invoiceRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      onclone: (clonedDoc) => {
        const controls = clonedDoc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
        controls.forEach(el => {
          let text = '';
          if (el.tagName === 'SELECT') {
            const sel = el as HTMLSelectElement;
            text = sel.options[sel.selectedIndex]?.text || '';
          } else if (el.tagName === 'TEXTAREA') {
            text = (el as HTMLTextAreaElement).value;
          } else {
            const inp = el as HTMLInputElement;
            if (inp.type === 'radio' || inp.type === 'checkbox') {
              const mark = clonedDoc.createElement('span');
              mark.textContent = inp.checked ? '●' : '○';
              mark.setAttribute('style', 'display:inline-block; width:12px; text-align:center; color:#111;');
              el.replaceWith(mark);
              return;
            }
            text = inp.value;
          }
          const replacement = clonedDoc.createElement(el.tagName === 'TEXTAREA' ? 'div' : 'span');
          replacement.textContent = text;
          const cs = clonedDoc.defaultView?.getComputedStyle(el);
          replacement.setAttribute(
            'style',
            [
              `display:${el.tagName === 'TEXTAREA' ? 'block' : 'inline-block'}`,
              'padding:0 4px',
              'min-height:1.25rem',
              'width:' + (cs?.width || 'auto'),
              'text-align:' + (cs?.textAlign || 'left'),
              'font-family:' + (cs?.fontFamily || 'inherit'),
              'font-size:' + (cs?.fontSize || 'inherit'),
              'font-weight:' + (cs?.fontWeight || 'inherit'),
              'color:' + (cs?.color || '#111'),
              'white-space:pre-wrap',
              'vertical-align:middle',
              'box-sizing:border-box',
            ].join(';')
          );
          el.replaceWith(replacement);
        });
      },
    });
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const canvas = await rasterizeInvoice();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `pembayaran-${nama.replace(/\s+/g, '-') || 'ayres'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      toast.error('Gagal Download', String(e));
    }
    setDownloading(false);
  }

  // Render the same rasterized invoice into a single A4-portrait PDF.
  // If the invoice is taller than one page, the image is split across
  // as many pages as needed so nothing gets cropped.
  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const canvas = await rasterizeInvoice();
      if (!canvas) return;
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableW = pageW - margin * 2;
      const imgH = (canvas.height * usableW) / canvas.width;

      if (imgH <= pageH - margin * 2) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, usableW, imgH);
      } else {
        // Slice the canvas into per-page chunks so long invoices don't
        // get squashed to fit a single page. Each slice is drawn at
        // full width; height is whatever fits in the page's usable area.
        const usableH = pageH - margin * 2;
        // Convert usable page height (mm) back into canvas px height per slice.
        const sliceHpx = Math.floor((canvas.width * usableH) / usableW);
        let yOffset = 0;
        let page = 0;
        while (yOffset < canvas.height) {
          const hpx = Math.min(sliceHpx, canvas.height - yOffset);
          const chunk = document.createElement('canvas');
          chunk.width = canvas.width;
          chunk.height = hpx;
          const ctx = chunk.getContext('2d');
          if (!ctx) break;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, chunk.width, chunk.height);
          ctx.drawImage(canvas, 0, yOffset, canvas.width, hpx, 0, 0, canvas.width, hpx);
          if (page > 0) pdf.addPage();
          const drawH = (hpx * usableW) / canvas.width;
          pdf.addImage(chunk.toDataURL('image/png'), 'PNG', margin, margin, usableW, drawH);
          yOffset += hpx;
          page++;
        }
      }
      pdf.save(`pembayaran-${nama.replace(/\s+/g, '-') || 'ayres'}.pdf`);
    } catch (e) {
      toast.error('Gagal Download PDF', String(e));
    }
    setDownloadingPdf(false);
  }

  async function handleSave() {
    if (!pickedOrderId) {
      toast.warning('Pilih Order', 'Pilih order yang akan diisi pembayarannya.');
      return;
    }
    if (!nama.trim()) {
      toast.warning('Wajib Diisi', 'Nama customer belum diisi.');
      return;
    }
    setSaving(true);
    try {
      const orderId = Number(pickedOrderId);
      // Update the order shell with header fields + ekspedisi + note +
      // diskon% + scalar totals. Ekspedisi/diskon columns may not exist
      // yet on legacy DBs → try/catch layered fallback.
      const baseUpdate = {
        customer_nama: nama.trim(),
        customer_alamat: alamat,
        lead_id: leadId ? Number(leadId) : null,
        keterangan: nb,
        nominal_order: grandTotal,
        dp_produksi: dpProduksi,
        kekurangan: sisaTagihan,
        status: 'PENDING', // promoted from SELLING
      } as Row;
      try {
        await dbUpdate('orders', orderId, {
          ...baseUpdate,
          ekspedisi_nama: ekspNama || null,
          ekspedisi_kg: ekspKg ? Number(ekspKg) : null,
          ekspedisi_biaya: ekspBiaya || null,
          diskon_pct: diskonPct,
        });
      } catch (err) {
        // Fallback: drop columns yang mungkin belum ada.
        console.warn('order update with ekspedisi/diskon failed, retrying without:', err);
        try {
          await dbUpdate('orders', orderId, { ...baseUpdate, diskon_pct: diskonPct });
        } catch (err2) {
          console.warn('order update with diskon_pct failed, retrying without:', err2);
          await dbUpdate('orders', orderId, baseUpdate);
        }
      }

      // Sync order_items: delete all existing then insert current lines
      const existingItems = items.filter(it => Number(it.order_id) === orderId);
      for (const it of existingItems) {
        try { await dbDelete('order_items', Number(it.id)); } catch {}
      }
      for (const line of itemLines) {
        if (!line.nama.trim() && !line.qty && !line.harga) continue;
        try {
          await dbCreate('order_items', {
            order_id: orderId,
            paket_nama: line.nama.trim() || '-',
            bahan_kain: '',
            qty: line.qty || 0,
            harga: line.harga || 0,
          });
        } catch (err) {
          // Fallback without harga if migration 022 hasn't landed
          console.warn('order_items insert with harga failed:', err);
          await dbCreate('order_items', {
            order_id: orderId,
            paket_nama: line.nama.trim() || '-',
            bahan_kain: '',
            qty: line.qty || 0,
          });
        }
      }

      // Sync order_payments untuk Rincian Order versi baru:
      //   • dp_desain (dari CS Selling) di-preserve — cuma update amount
      //     kalau CS Order override. Bukti TF + bank + method tetap.
      //   • dp_produksi: hapus semua row dp_produksi lama, buat SATU row
      //     baru dengan amount = dpProduksi (hasil kalkulasi %).
      // Row lain (tipe custom) tidak disentuh.
      const existingPayments = payments.filter(pp => Number(pp.order_id) === orderId);
      const prevDpDesain = existingPayments.find(pp => String(pp.tipe) === 'dp_desain');
      const oldDpProduksi = existingPayments.filter(pp => String(pp.tipe) === 'dp_produksi');
      for (const pp of oldDpProduksi) {
        try { await dbDelete('order_payments', Number(pp.id)); } catch {}
      }

      // Update / insert DP Desain row supaya amount konsisten dengan
      // apa yang tampil di summary. Kalau CS Selling belum bikin, kita
      // buat sekarang (repeat-order case) — Bukti Pembayaran page tetap
      // bisa handle bukti untuk row ini nanti.
      if (dpDesainAmount > 0 || prevDpDesain) {
        const dpDesainPayload: Row = {
          order_id: orderId,
          tipe: 'dp_desain',
          amount: dpDesainAmount || Number(prevDpDesain?.amount) || 0,
          urutan: 1,
        };
        try {
          if (prevDpDesain) {
            await dbUpdate('order_payments', Number(prevDpDesain.id), {
              amount: dpDesainPayload.amount,
            });
          } else {
            await dbCreate('order_payments', dpDesainPayload);
          }
        } catch (err) {
          console.warn('dp_desain sync failed:', err);
        }
      }

      // Insert single DP Produksi row (amount = calc). Bukti TF-nya
      // diisi belakangan oleh CS Order via Bukti Pembayaran menu.
      if (dpProduksi > 0) {
        try {
          await dbCreate('order_payments', {
            order_id: orderId,
            tipe: 'dp_produksi',
            amount: dpProduksi,
            urutan: 1,
          });
        } catch (err) {
          console.warn('dp_produksi create failed:', err);
        }
      }

      // Auto-create a WO for this order so it lands in Produksi Waiting List.
      // Reset finance_status so Finance re-approves the completed invoice
      // (not just the initial DP Desain from CS Selling). Waiting List
      // stays read-only in produksi until Finance flips finance_status
      // back to APPROVED.
      try {
        const allWos = await dbGet('work_orders');
        const existingWo = allWos.find((w: Row) => Number(w.order_id) === orderId);
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

          const paketNames = itemLines.map(l => l.nama).filter(Boolean).join(', ') || '-';
          const totalQty = itemLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
          // work_orders.deadline is NOT NULL in the base schema. Prefer
          // work_orders.deadline is NOT NULL, jadi kita kasih placeholder
          // 7 hari ke depan. Production akan overwrite kolom ini via
          // menu Work Orders sesuai jadwal produksi sebenarnya.
          const woDeadline = (() => {
            const d = new Date(); d.setDate(d.getDate() + 7);
            return d.toISOString().split('T')[0];
          })();

          const woId = await dbCreate('work_orders', {
            no_wo: noWo,
            tracking_hash: trackingHash,
            order_id: orderId,
            customer_nama: nama.trim(),
            paket: paketNames,
            bahan: '-',
            jumlah: totalQty,
            deadline: woDeadline,
            keterangan: nb,
            status: 'PROSES_PRODUKSI',
            current_stage_id: firstStageId,
            // wo_confirmed=0 sengaja. Rincian Order dari CS Order
            // cuma placeholder — admin produksi masih perlu buka
            // menu Work Orders dan detail-kan WO (spesifikasi paket,
            // bahan, dsb) sebelum flow produksi bisa lanjut lewat
            // gate di stage Proofing. Save Work Orders → wo_confirmed
            // otomatis flip ke 1 dan Selesai & Lanjut membuka.
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
        console.warn('auto-create WO from Pembayaran failed:', err);
        toast.warning('WO Tidak Terbentuk',
          'Order tersimpan tapi WO otomatis belum terbentuk. Buat WO manual dari Menu Work Orders.');
      }

      // Do NOT touch finance_status here. In the new two-step CS Order
      // flow, Finance re-review is triggered only after CS Order finishes
      // the Bukti Pembayaran submenu (which flips bukti_uploaded=1 and
      // resets finance_status). Rincian Order save alone shouldn't
      // requeue the order at Finance — it's not ready yet.

      invalidateCache('wp_orders', 'wp_dashboard');
      // Refetch the modal's own payments/items list so the pre-fill
      // effect re-runs with the just-persisted rows. Without this,
      // closing + reopening the same session could still see stale
      // state because we hadn't picked up the new inserts.
      await fetchAll();
      toast.success('Pembayaran Tersimpan', 'Order berhasil dilengkapi dari CS Order.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Gagal Menyimpan', String(e));
    }
    setSaving(false);
  }

  if (!open) return null;

  const cellCls = 'border border-slate-700 px-2 py-1.5 text-sm';
  const inputCls = 'w-full bg-transparent focus:outline-none text-slate-900 text-sm px-1';
  const smInputCls = 'w-full bg-transparent focus:outline-none text-slate-900 text-sm text-right px-1 tabular-nums';

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 overflow-y-auto">
        <div className="w-full max-w-5xl bg-white border border-white/[0.06] rounded-xl shadow-2xl shadow-black/50 my-8 flex flex-col max-h-[92vh]">
          {/* Top bar: picker + actions (screen only) */}
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap shrink-0">
            <div className="flex items-center gap-3 flex-1">
              {readOnly ? (
                <div className="text-sm font-semibold text-slate-800">
                  {noOrder || 'Order'} · <span className="text-slate-500 font-normal">Read only</span>
                </div>
              ) : (
                <>
                  <label className="text-xs font-medium text-slate-600 shrink-0">Order:</label>
                  <select value={pickedOrderId} onChange={e => setPickedOrderId(e.target.value)}
                    className="flex-1 max-w-xs bg-white border border-slate-300 text-slate-900 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500">
                    <option value="">— Pilih order —</option>
                    {orderPickerOptions.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label} {o.status === 'SELLING' ? '(dari CS Selling)' : ''}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleDownload} disabled={downloading || downloadingPdf || !nama}
                className="text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded transition-colors disabled:opacity-40">
                {downloading ? 'Menyiapkan...' : 'Download PNG'}
              </button>
              <button onClick={handleDownloadPdf} disabled={downloading || downloadingPdf || !nama}
                className="text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded transition-colors disabled:opacity-40">
                {downloadingPdf ? 'Menyiapkan...' : 'Download PDF'}
              </button>
              {!readOnly && (
                <button onClick={handleSave} disabled={saving || !pickedOrderId}
                  className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded transition-colors disabled:opacity-40">
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              )}
              <button onClick={onClose} className="text-slate-500 hover:text-slate-800 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Invoice — this is what gets exported */}
          <div className="overflow-y-auto flex-1 bg-slate-100 p-4">
            <div ref={invoiceRef} className="bg-white text-slate-900 mx-auto max-w-4xl p-8" style={{ fontFamily: '"Helvetica","Arial",sans-serif' }}>
              {/* Header with logo + title */}
              <div className="flex items-center justify-between mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/new logo.png" alt="AYRES" className="h-10 opacity-90" />
                <h1 className="text-2xl font-bold tracking-wide text-slate-900">RINCIAN ORDER</h1>
                <div className="w-24 text-right text-[10px] text-slate-500">Invoice</div>
              </div>

              {/* Info table */}
              <table className="w-full border-collapse mb-3 text-sm">
                <tbody>
                  <tr>
                    <td className={`${cellCls} bg-slate-100 font-semibold w-32`}>NAMA</td>
                    <td className={`${cellCls} w-4 text-center`}>:</td>
                    <td className={`${cellCls}`}>
                      <input type="text" value={nama} onChange={e => setNama(e.target.value)}
                        placeholder="Nama customer" className={inputCls} readOnly={readOnly} />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${cellCls} bg-slate-100 font-semibold`}>ALAMAT</td>
                    <td className={`${cellCls} text-center`}>:</td>
                    <td className={`${cellCls}`}>
                      <input type="text" value={alamat} onChange={e => setAlamat(e.target.value)}
                        placeholder="Alamat lengkap" className={inputCls} readOnly={readOnly} />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${cellCls} bg-slate-100 font-semibold`}>PILIHAN LEADS</td>
                    <td className={`${cellCls} text-center`}>:</td>
                    <td className={`${cellCls}`}>
                      <select value={leadId} onChange={e => setLeadId(e.target.value)}
                        disabled={readOnly}
                        className={`${inputCls} appearance-none cursor-pointer disabled:cursor-not-allowed`}>
                        <option value="">— Pilih leads —</option>
                        {leads.map((l: Row) => (
                          <option key={l.id} value={l.id}>{l.nama}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className={`${cellCls} bg-slate-100 font-semibold`}>PEMBAY. TUNAI</td>
                    <td className={`${cellCls} text-center`}>:</td>
                    <td className={`${cellCls}`}>
                      <div className="flex items-center gap-4">
                        <input type="text" value={pembayTunai} onChange={e => setPembayTunai(e.target.value)}
                          placeholder="Catatan tunai" className={`${inputCls} flex-1`} readOnly={readOnly} />
                        <label className="flex items-center gap-1 text-xs">
                          <input type="radio" name="payMethod" checked={payMethod === 'cash'} onChange={() => setPayMethod('cash')} disabled={readOnly} />
                          <span>Cash</span>
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="radio" name="payMethod" checked={payMethod === 'bank'} onChange={() => setPayMethod('bank')} disabled={readOnly} />
                          <span>Bank</span>
                        </label>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Item table */}
              <table className="w-full border-collapse mb-3 text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-700 px-2 py-1.5 text-left">NAMA BARANG</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-20">QTY</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-40">HARGA</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-40">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {itemLines.map((line, idx) => {
                    const total = (line.qty || 0) * (line.harga || 0);
                    return (
                      <tr key={line.id}>
                        <td className={cellCls}>
                          <div className="flex items-center gap-2">
                            <input type="text" value={line.nama}
                              onChange={e => updateItemLine(idx, 'nama', e.target.value)}
                              placeholder="Nama barang" className={inputCls} readOnly={readOnly} />
                            {!readOnly && itemLines.length > 1 && (
                              <button onClick={() => removeItemLine(idx)} title="Hapus"
                                className="text-slate-400 hover:text-rose-500 shrink-0 text-lg leading-none px-1">×</button>
                            )}
                          </div>
                        </td>
                        <td className={cellCls}>
                          <input type="number" value={line.qty || ''}
                            onChange={e => updateItemLine(idx, 'qty', Number(e.target.value) || 0)}
                            className={smInputCls} readOnly={readOnly} />
                        </td>
                        <td className={cellCls}>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">Rp</span>
                            <input type="text" value={line.harga ? fmtRpPlain(line.harga) : ''}
                              onChange={e => updateItemLine(idx, 'harga', parseRp(e.target.value))}
                              className={smInputCls} readOnly={readOnly} />
                          </div>
                        </td>
                        <td className={`${cellCls} bg-slate-50`}>
                          <div className="flex items-center justify-end gap-1 tabular-nums">
                            <span className="text-xs text-slate-500">Rp</span>
                            <span>{total > 0 ? fmtRp(total) : '-'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Padding rows to always show 8 rows like the printed form */}
                  {Array.from({ length: Math.max(0, 4 - itemLines.length) }).map((_, i) => (
                    <tr key={`pad-${i}`}>
                      <td className={cellCls}>&nbsp;</td>
                      <td className={cellCls}>&nbsp;</td>
                      <td className={cellCls}>&nbsp;</td>
                      <td className={`${cellCls} bg-slate-50 text-right text-slate-400`}>Rp -</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className={`${cellCls} bg-slate-100 font-bold text-right`}>TOTAL PEMBELIAN</td>
                    <td className={`${cellCls} bg-slate-100 font-bold text-right tabular-nums`}>
                      Rp {fmtRp(totalPembelian)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {!readOnly && (
                <div className="mb-3 flex justify-start">
                  <button onClick={addItemLine}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    Tambah Item
                  </button>
                </div>
              )}

              {/* Ekspedisi */}
              <table className="w-full border-collapse mb-3 text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-700 px-2 py-1.5 text-left">EKSPEDISI</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-20">KG</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-40">HARGA</th>
                    <th className="border border-slate-700 px-2 py-1.5 w-40">BIAYA</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={cellCls}>
                      <input type="text" value={ekspNama} onChange={e => setEkspNama(e.target.value)}
                        placeholder="Nama ekspedisi (contoh: JNE JTR 4-5 HARI)" className={inputCls} readOnly={readOnly} />
                    </td>
                    <td className={cellCls}>
                      <input type="text" value={ekspKg} onChange={e => setEkspKg(e.target.value)}
                        className={smInputCls} readOnly={readOnly} />
                    </td>
                    <td className={cellCls}>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">Rp</span>
                        <input type="text" value={ekspBiaya ? fmtRpPlain(ekspBiaya) : ''}
                          onChange={e => setEkspBiaya(parseRp(e.target.value))}
                          className={smInputCls} readOnly={readOnly} />
                      </div>
                    </td>
                    <td className={`${cellCls} bg-slate-50 text-right tabular-nums`}>
                      Rp {fmtRp(ekspBiaya)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className={`${cellCls} bg-slate-100 font-bold text-right`}>TOTAL</td>
                    <td className={`${cellCls} bg-slate-100 font-bold text-right tabular-nums`}>
                      Rp {fmtRp(grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* NB + Summary panel (Grand Total → Sisa Tagihan) */}
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <div className="text-sm font-bold mb-1">NB:</div>
                  <textarea value={nb} onChange={e => setNb(e.target.value)}
                    rows={6} readOnly={readOnly}
                    placeholder="Catatan bahan, promo, size dsb..."
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 resize-none" />
                </div>
                <table className="w-full border-collapse text-sm h-fit">
                  <tbody>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold w-32`}>GRAND TOTAL</td>
                      <td className={`${cellCls} text-right tabular-nums font-bold`}>Rp {fmtRp(grandTotal)}</td>
                    </tr>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold`}>
                        DISKON
                        <input type="number" min={0} max={100} value={diskonPct}
                          onChange={e => setDiskonPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                          readOnly={readOnly}
                          className="w-12 mx-1 border border-slate-300 rounded text-center text-xs" />%
                      </td>
                      <td className={`${cellCls} text-right tabular-nums`}>
                        {diskonAmount > 0 ? `− Rp ${fmtRp(diskonAmount)}` : 'Rp -'}
                      </td>
                    </tr>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold`}>DP DESIGN</td>
                      <td className={`${cellCls} text-right tabular-nums`}>
                        {dpDesainAmount > 0
                          ? <>− Rp {fmtRp(dpDesainAmount)} <span className="text-[10px] text-slate-500 ml-1">(CS Selling)</span></>
                          : <span className="text-slate-500 text-xs italic">tidak ada</span>}
                      </td>
                    </tr>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold`}>
                        DP PRODUKSI
                        <input type="number" min={0} max={100} value={dpProdPct}
                          onChange={e => setDpProdPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                          readOnly={readOnly}
                          className="w-12 mx-1 border border-slate-300 rounded text-center text-xs" />%
                      </td>
                      <td className={`${cellCls} text-right tabular-nums font-bold text-blue-700`}>
                        − Rp {fmtRp(dpProduksi)}
                      </td>
                    </tr>
                    <tr>
                      <td className={`${cellCls} bg-slate-100 font-bold`}>SISA TAGIHAN</td>
                      <td className={`${cellCls} text-right tabular-nums font-bold`}>Rp {fmtRp(sisaTagihan)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {readOnly && trackingLink && (
                <div className="mt-4 border border-blue-200 bg-blue-50 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Link Tracking Customer</div>
                    <a
                      href={trackingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 underline break-all"
                    >
                      {typeof window !== 'undefined' ? `${window.location.origin}${trackingLink}` : trackingLink}
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      const url = typeof window !== 'undefined' ? `${window.location.origin}${trackingLink}` : trackingLink;
                      navigator.clipboard?.writeText(url).then(() => toast.success('Tersalin', 'Link tracking sudah di-copy.'));
                    }}
                    className="text-xs font-medium text-blue-700 border border-blue-300 hover:bg-blue-100 px-3 py-1.5 rounded transition-colors shrink-0"
                  >
                    Copy Link
                  </button>
                </div>
              )}

              <div className="text-[10px] text-slate-400 text-center mt-6 pt-3 border-t border-slate-200">
                Diterbitkan oleh AYRES · {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
