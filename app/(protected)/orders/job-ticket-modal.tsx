'use client';

// JOB TICKET — dokumen handover CS → Produksi (terpisah dari Rincian Order).
// Bagian A (Data Order) terisi OTOMATIS dari order (sebagian editable), Bagian B
// (Detail Design) & C (Rincian Size) diinput. Disimpan JSON di
// orders.job_ticket_json. Bisa Download PNG / PDF (pola sama Rincian Order).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { computeDeadlineLock } from '@/lib/business-days';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fmtTgl(d: unknown): string {
  if (!d) return '';
  const s = d instanceof Date ? d.toISOString() : String(d);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

interface DetailDesign {
  model: string; jenisBahan: string; kerah: string; lengan: string; warnaUtama: string;
  logoSponsor: string; fontNomor: string; linkDesignFix: string; linkProofingFix: string; catatanProofing: string;
}
interface SizeRow { size: string; pendek: string; panjang: string }

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
function seedDetailDesign(): DetailDesign {
  return { model: '', jenisBahan: '', kerah: '', lengan: '', warnaUtama: '', logoSponsor: '', fontNomor: '', linkDesignFix: '', linkProofingFix: '', catatanProofing: '' };
}
function seedSizes(): SizeRow[] {
  return DEFAULT_SIZES.map(size => ({ size, pendek: '', panjang: '' }));
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  seedOrderId?: number | null;
  readOnly?: boolean;
}

export default function JobTicketModal({ open, onClose, onSaved, seedOrderId, readOnly = false }: Props) {
  const toast = useToast();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [orders, setOrders] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [pickedOrderId, setPickedOrderId] = useState<string>('');

  // Bagian A — auto (dari order) kecuali picCs & tglDesignFix (editable).
  const [noOrder, setNoOrder] = useState('');
  const [namaTim, setNamaTim] = useState('');
  const [noWa, setNoWa] = useState('');
  const [picCs, setPicCs] = useState('');
  const [tglDpDesign, setTglDpDesign] = useState('');
  const [tglDesignFix, setTglDesignFix] = useState('');
  const [tglDpProduksi, setTglDpProduksi] = useState('');
  const [tglProofingFix, setTglProofingFix] = useState('');
  const [tglKirim, setTglKirim] = useState('');
  // Bagian B & C
  const [detail, setDetail] = useState<DetailDesign>(seedDetailDesign());
  const [sizes, setSizes] = useState<SizeRow[]>(seedSizes());

  const fetchAll = useCallback(async () => {
    try {
      const [o, p, lib] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('order_payments').catch(() => []),
        dbGet('libur_nasional').catch(() => []),
      ]);
      setOrders(o); setPayments(p);
      setHolidays(new Set((lib as Row[]).map(h => {
        if (!h.tanggal) return '';
        const s = h.tanggal instanceof Date ? h.tanggal.toISOString() : String(h.tanggal);
        const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
      }).filter(Boolean)));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (open) fetchAll(); }, [open, fetchAll]);
  useEffect(() => { if (open) setPickedOrderId(seedOrderId ? String(seedOrderId) : ''); }, [open, seedOrderId]);

  // Prefill dari order terpilih.
  useEffect(() => {
    if (!pickedOrderId) {
      setNoOrder(''); setNamaTim(''); setNoWa(''); setPicCs('');
      setTglDpDesign(''); setTglDesignFix(''); setTglDpProduksi(''); setTglProofingFix(''); setTglKirim('');
      setDetail(seedDetailDesign()); setSizes(seedSizes());
      return;
    }
    const o = orders.find(x => String(x.id) === pickedOrderId);
    if (!o) return;
    setNoOrder(String(o.no_order || ''));
    setNamaTim(String(o.customer_nama || ''));
    setNoWa(String(o.customer_phone || ''));
    // Tgl DP Desain / DP Produksi dari order_payments.
    const dpDesainPay = payments.find(pp => Number(pp.order_id) === Number(o.id) && String(pp.tipe) === 'dp_desain');
    const dpProdPay = payments.find(pp => Number(pp.order_id) === Number(o.id) && String(pp.tipe) === 'dp_produksi');
    setTglDpDesign(dpDesainPay ? fmtTgl(dpDesainPay.tanggal || dpDesainPay.created_at) : '');
    setTglDpProduksi(dpProdPay ? fmtTgl(dpProdPay.tanggal || dpProdPay.created_at) : '');
    setTglProofingFix(o.tanggal_acc_proofing ? fmtTgl(o.tanggal_acc_proofing) : '');
    const dl = computeDeadlineLock({ pilihanPaket: o.pilihan_paket, tanggalAccProofing: o.tanggal_acc_proofing, deadlineLock: o.deadline_lock, holidays });
    setTglKirim(fmtTgl(dl || o.estimasi_deadline || o.deadline_lock || ''));
    // Bagian editable A + B + C dari job_ticket_json.
    let jt: Row = {};
    try { jt = JSON.parse(String(o.job_ticket_json || '{}')) || {}; } catch { jt = {}; }
    setPicCs(String(jt.picCs || ''));
    setTglDesignFix(String(jt.tglDesignFix || ''));
    setDetail({ ...seedDetailDesign(), ...(jt.detailDesign && typeof jt.detailDesign === 'object' ? jt.detailDesign : {}) });
    if (Array.isArray(jt.sizes) && jt.sizes.length > 0) {
      setSizes(jt.sizes.map((s: SizeRow) => ({ size: String(s.size || ''), pendek: String(s.pendek || ''), panjang: String(s.panjang || '') })));
    } else {
      setSizes(seedSizes());
    }
    // holidays sengaja tidak di deps: diset di batch yang sama dgn orders/payments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedOrderId, orders, payments]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const sizeTotals = useMemo(() => sizes.map(s => (Number(s.pendek) || 0) + (Number(s.panjang) || 0)), [sizes]);
  const grandSize = useMemo(() => sizeTotals.reduce((a, b) => a + b, 0), [sizeTotals]);

  async function handleSave() {
    if (!pickedOrderId) { toast.warning('Pilih Order', 'Pilih order dulu.'); return; }
    setSaving(true);
    try {
      const payload = {
        picCs, tglDesignFix,
        detailDesign: detail,
        sizes: sizes.map(s => ({ size: s.size, pendek: s.pendek, panjang: s.panjang })),
      };
      await dbUpdate('orders', Number(pickedOrderId), { job_ticket_json: JSON.stringify(payload) });
      toast.success('Tersimpan', 'Job Ticket berhasil disimpan.');
      onSaved?.();
    } catch (e) { toast.error('Gagal', String(e)); }
    setSaving(false);
  }

  async function rasterize() {
    if (!sheetRef.current) return null;
    const html2canvas = (await import('html2canvas-pro')).default;
    return html2canvas(sheetRef.current, {
      backgroundColor: '#ffffff', scale: 2, logging: false,
      onclone: (doc) => {
        const controls = doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
        controls.forEach(el => {
          let text = '';
          if (el.tagName === 'SELECT') { const s = el as HTMLSelectElement; text = s.options[s.selectedIndex]?.text || ''; }
          else if (el.tagName === 'TEXTAREA') text = (el as HTMLTextAreaElement).value;
          else text = (el as HTMLInputElement).value;
          const rep = doc.createElement(el.tagName === 'TEXTAREA' ? 'div' : 'span');
          rep.textContent = text;
          const cs = doc.defaultView?.getComputedStyle(el);
          rep.setAttribute('style', [
            `display:${el.tagName === 'TEXTAREA' ? 'block' : 'inline-block'}`,
            'padding:0 4px', 'min-height:1.1rem', 'width:' + (cs?.width || 'auto'),
            'text-align:' + (cs?.textAlign || 'left'), 'font-size:' + (cs?.fontSize || 'inherit'),
            'font-weight:' + (cs?.fontWeight || 'inherit'), 'color:' + (cs?.color || '#111'),
            'white-space:pre-wrap', 'vertical-align:middle', 'box-sizing:border-box',
          ].join(';'));
          el.replaceWith(rep);
        });
      },
    });
  }

  async function handleDownloadPng() {
    setDownloading(true);
    try {
      const canvas = await rasterize(); if (!canvas) return;
      const link = document.createElement('a');
      link.download = `job-ticket-${(noOrder || namaTim || 'ayres').replace(/\s+/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png'); link.click();
    } catch (e) { toast.error('Gagal Download', String(e)); }
    setDownloading(false);
  }
  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const canvas = await rasterize(); if (!canvas) return;
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
      const margin = 8, usableW = pageW - margin * 2;
      const imgH = (canvas.height * usableW) / canvas.width;
      if (imgH <= pageH - margin * 2) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, usableW, imgH);
      } else {
        const usableH = pageH - margin * 2;
        const sliceHpx = Math.floor((canvas.width * usableH) / usableW);
        let yOffset = 0, page = 0;
        while (yOffset < canvas.height) {
          const hpx = Math.min(sliceHpx, canvas.height - yOffset);
          const chunk = document.createElement('canvas');
          chunk.width = canvas.width; chunk.height = hpx;
          const ctx = chunk.getContext('2d'); if (!ctx) break;
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, chunk.width, chunk.height);
          ctx.drawImage(canvas, 0, yOffset, canvas.width, hpx, 0, 0, canvas.width, hpx);
          if (page > 0) pdf.addPage();
          pdf.addImage(chunk.toDataURL('image/png'), 'PNG', margin, margin, usableW, (hpx * usableW) / canvas.width);
          yOffset += hpx; page++;
        }
      }
      pdf.save(`job-ticket-${(noOrder || namaTim || 'ayres').replace(/\s+/g, '-')}.pdf`);
    } catch (e) { toast.error('Gagal Download PDF', String(e)); }
    setDownloadingPdf(false);
  }

  if (!open) return null;

  const dataRows: { label: string; value: string; onChange?: (v: string) => void; auto?: boolean }[] = [
    { label: 'No. Order', value: noOrder, auto: true },
    { label: 'Nama Customer / Tim', value: namaTim, auto: true },
    { label: 'No. WA', value: noWa, auto: true },
    { label: 'PIC CS / Sales', value: picCs, onChange: setPicCs },
    { label: 'Tgl DP Desain', value: tglDpDesign, auto: true },
    { label: 'Tgl Design Fix', value: tglDesignFix, onChange: setTglDesignFix },
    { label: 'Tgl DP Produksi', value: tglDpProduksi, auto: true },
    { label: 'Tgl Proofing Fix', value: tglProofingFix, auto: true },
    { label: 'Tgl Kirim Dijanjikan (PPIC)', value: tglKirim, auto: true },
  ];
  const detailRows: { label: string; key: keyof DetailDesign; type?: 'model' }[] = [
    { label: 'Model (raglan / biasa)', key: 'model', type: 'model' },
    { label: 'Jenis bahan', key: 'jenisBahan' },
    { label: 'Kerah', key: 'kerah' },
    { label: 'Lengan', key: 'lengan' },
    { label: 'Warna utama', key: 'warnaUtama' },
    { label: 'Logo & sponsor + posisi', key: 'logoSponsor' },
    { label: 'Font nama / nomor', key: 'fontNomor' },
    { label: 'Link file Design Fix', key: 'linkDesignFix' },
    { label: 'Link file / foto Proofing Fix', key: 'linkProofingFix' },
    { label: 'Catatan hasil proofing', key: 'catatanProofing' },
  ];

  const cell = 'border border-slate-400 px-2 py-1.5 text-[13px] text-slate-900';
  const inp = 'w-full bg-transparent focus:outline-none text-[13px] text-slate-900';
  const sectionHead = 'border border-slate-400 bg-slate-800 text-white font-bold px-2 py-1.5 text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">JOB TICKET</span>
            <select value={pickedOrderId} onChange={e => setPickedOrderId(e.target.value)} disabled={readOnly}
              className="bg-[#111827] border border-white/10 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none">
              <option value="">— Pilih order —</option>
              {orders.map(o => <option key={o.id} value={String(o.id)}>{String(o.no_order || '')} · {String(o.customer_nama || '')}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadPng} disabled={!pickedOrderId || downloading}
              className="text-xs font-medium text-slate-200 border border-white/10 bg-white/[0.04] px-3 py-1.5 rounded-lg hover:bg-white/[0.08] disabled:opacity-50">{downloading ? '...' : 'Download PNG'}</button>
            <button onClick={handleDownloadPdf} disabled={!pickedOrderId || downloadingPdf}
              className="text-xs font-medium text-slate-200 border border-white/10 bg-white/[0.04] px-3 py-1.5 rounded-lg hover:bg-white/[0.08] disabled:opacity-50">{downloadingPdf ? '...' : 'Download PDF'}</button>
            {!readOnly && (
              <button onClick={handleSave} disabled={!pickedOrderId || saving}
                className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-lg disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.05]" title="Tutup (Esc)">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Sheet (yang di-export) */}
        <div className="p-3 bg-slate-100 rounded-b-2xl">
          <div ref={sheetRef} className="bg-white text-slate-900 mx-auto p-6" style={{ fontFamily: '"Helvetica","Arial",sans-serif' }}>
            <div className="flex items-center justify-between mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/new logo.png" alt="AYRES" className="h-9 opacity-90" />
              <h1 className="text-xl font-bold tracking-wide">JOB TICKET — AYRES</h1>
              <div className="w-16 text-right text-[10px] text-slate-500">Produksi</div>
            </div>
            <p className="text-[11px] text-slate-500 italic mb-3">Diserahkan CS ke Produksi setelah Proofing Fix — acuan tahapan produksi (Layouting → Finishing).</p>

            {/* A. DATA ORDER */}
            <table className="w-full border-collapse mb-3">
              <tbody>
                <tr><td colSpan={2} className={sectionHead}>A. DATA ORDER</td></tr>
                {dataRows.map(r => (
                  <tr key={r.label}>
                    <td className={`${cell} bg-slate-100 font-semibold w-56`}>{r.label}</td>
                    <td className={cell}>
                      {r.auto
                        ? <span>{r.value || <span className="text-slate-400">—</span>}</span>
                        : <input value={r.value} onChange={e => r.onChange?.(e.target.value)} readOnly={readOnly} className={inp} placeholder="..." />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* B. DETAIL DESIGN */}
            <table className="w-full border-collapse mb-3">
              <tbody>
                <tr><td colSpan={2} className={sectionHead}>B. DETAIL DESIGN</td></tr>
                {detailRows.map(r => (
                  <tr key={r.key}>
                    <td className={`${cell} bg-slate-100 font-semibold w-56`}>{r.label}</td>
                    <td className={cell}>
                      {r.type === 'model' ? (
                        <select value={detail.model} onChange={e => setDetail(d => ({ ...d, model: e.target.value }))} disabled={readOnly} className={`${inp} bg-white`}>
                          <option value="">—</option>
                          <option value="Raglan">Raglan</option>
                          <option value="Biasa">Biasa</option>
                        </select>
                      ) : (
                        <input value={detail[r.key]} onChange={e => setDetail(d => ({ ...d, [r.key]: e.target.value }))} readOnly={readOnly} className={inp} placeholder="..." />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* C. RINCIAN SIZE */}
            <table className="w-full border-collapse">
              <tbody>
                <tr><td colSpan={4} className={sectionHead}>C. RINCIAN SIZE</td></tr>
                <tr className="text-slate-700">
                  <td className={`${cell} bg-slate-200 font-bold text-center`}>SIZE</td>
                  <td className={`${cell} bg-slate-200 font-bold text-center`}>LENGAN PENDEK</td>
                  <td className={`${cell} bg-slate-200 font-bold text-center`}>LENGAN PANJANG</td>
                  <td className={`${cell} bg-slate-200 font-bold text-center w-20`}>TOTAL</td>
                </tr>
                {sizes.map((s, i) => (
                  <tr key={s.size || i}>
                    <td className={`${cell} font-semibold text-center`}>{s.size}</td>
                    <td className={cell}>
                      <input value={s.pendek} inputMode="numeric" onChange={e => setSizes(prev => prev.map((p, idx) => idx === i ? { ...p, pendek: e.target.value.replace(/\D/g, '') } : p))} readOnly={readOnly} className={`${inp} text-center`} placeholder="0" />
                    </td>
                    <td className={cell}>
                      <input value={s.panjang} inputMode="numeric" onChange={e => setSizes(prev => prev.map((p, idx) => idx === i ? { ...p, panjang: e.target.value.replace(/\D/g, '') } : p))} readOnly={readOnly} className={`${inp} text-center`} placeholder="0" />
                    </td>
                    <td className={`${cell} text-center tabular-nums font-semibold`}>{sizeTotals[i] || 0}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className={`${cell} bg-slate-200 text-right`} colSpan={3}>TOTAL</td>
                  <td className={`${cell} bg-slate-200 text-center tabular-nums`}>{grandSize}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3 text-[10px] text-slate-400 text-center">Diterbitkan oleh AYRES · {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
