'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { dbGet, dbUpdate } from '@/lib/api-db';
import { isVisibleTanggalOrder } from '@/lib/data-cutoff';
import { computeDeadlineLock, hasJaket } from '@/lib/business-days';
import { buildAksesorisSet } from '@/lib/qty-aksesoris';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Poin per unit sesuai tier paket (patokan atasan):
//   Standar = 1, Klasik = 1.4, Pro = 1.7, Warrior = 2.0 (tier tertinggi).
function tierRate(tier: string): number {
  if (tier === 'WARRIOR') return 2.0;
  if (tier === 'PRO') return 1.7;
  if (tier === 'KLASIK') return 1.4;
  if (tier === 'STANDAR') return 1;
  return 0;
}

// Deteksi tier + variant dari nama paket order. tier '' = tidak terdeteksi
// (paket bukan Standar/Klasik/Pro → CS pilih manual lewat dropdown).
function detectPaket(names: string[]): { tier: string; display: string } {
  for (const raw of names) {
    const s = String(raw || '').toUpperCase();
    let tier = '';
    if (/WARRIOR|WARIOR/.test(s)) tier = 'WARRIOR';
    else if (/\bPRO\b/.test(s)) tier = 'PRO';
    else if (/KLASIK|CLASSIC/.test(s)) tier = 'KLASIK';
    else if (/STANDAR|STANDARD/.test(s)) tier = 'STANDAR';
    if (tier) {
      const mv = s.match(/PAKET\s+([A-E])/) || s.match(/\b([A-E])\s*$/);
      const variant = mv ? mv[1] : '';
      return { tier, display: variant ? `${tier} ${variant}` : tier };
    }
  }
  return { tier: '', display: '' };
}

function monthKeyOf(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '_no_dl_';
}
function monthLabel(key: string): string {
  if (key === '_no_dl_') return 'Belum Ada Deadline';
  const [y, mo] = key.split('-').map(Number);
  return `${MONTHS_ID[mo - 1]} ${y}`;
}
function fmtDL(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[3])} ${MONTHS_ID[Number(m[2]) - 1]} ${m[1]}` : (iso || '—');
}

// Keterangan disimpan sebagai HTML (NB Rincian Order pakai contentEditable +
// Ctrl+B). Di sini ditampilkan sebagai teks biasa yang rapi: <br>/<div>/<p>/
// <li> jadi baris baru, tag lain dibuang, entity umum di-decode.
function htmlToText(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/?\s*(div|p|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^\s+|\s+$/g, '');
}

const TIER_OPTIONS = ['STANDAR', 'KLASIK', 'PRO', 'WARRIOR'];

// Satu baris paket dalam sebuah order (1 order bisa >1 paket, mis. jersey
// Classic + Standar). detected=false → tier belum kebaca, pakai manualTier.
type PaketLine = { key: string; tier: string; display: string; qty: number; detected: boolean };
type DeadlineOrder = {
  id: number; customer: string;
  lines: PaketLine[];      // ≥1 baris paket
  manualTier: string;      // orders.deadline_paket_tier — utk baris undetected
  bonus: string; ket: string; dl: string; monthKey: string; totalQty: number;
};

// Tier efektif tiap baris: auto kalau terdeteksi, kalau tidak pakai manual.
const lineTier = (l: PaketLine, o: DeadlineOrder) => l.detected ? l.tier : o.manualTier;
const linePoint = (l: PaketLine, o: DeadlineOrder) => {
  const t = lineTier(l, o);
  return t ? Math.round(l.qty * tierRate(t) * 10) / 10 : 0;
};
const orderPoint = (o: DeadlineOrder) => Math.round(o.lines.reduce((s, l) => s + linePoint(l, o), 0) * 10) / 10;
// Baris yang masih butuh dipilih tier-nya (undetected + manual belum diisi).
const orderNeedsPick = (o: DeadlineOrder) => o.lines.some(l => !lineTier(l, o));

export default function LaporanDeadlineCsOrderPage() {
  const [rowsAll, setRowsAll] = useState<DeadlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Baris yang di-expand (klik) untuk menampilkan KET. null = tidak ada.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, items, promos, promoMaster, barangCs, libur] = await Promise.all([
        dbGet('orders').catch(() => []),
        dbGet('order_items').catch(() => []),
        dbGet('order_promos').catch(() => []),
        dbGet('promo').catch(() => []),
        dbGet('barang_cs').catch(() => []),
        dbGet('libur_nasional').catch(() => []),
      ]);
      const aksesorisSet = buildAksesorisSet(barangCs as Row[]);

      const holidays = new Set<string>();
      for (const h of libur as Row[]) {
        const t = h.tanggal;
        if (!t) continue;
        const m = String(t instanceof Date ? t.toISOString() : t).match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) holidays.add(`${m[1]}-${m[2]}-${m[3]}`);
      }

      const itemsByOrder: Record<string, Row[]> = {};
      for (const it of items as Row[]) (itemsByOrder[String(it.order_id)] ||= []).push(it);

      const promoNameById: Record<string, string> = {};
      for (const p of promoMaster as Row[]) promoNameById[String(p.id)] = String(p.nama || '');
      const bonusByOrder: Record<string, string[]> = {};
      for (const op of promos as Row[]) {
        const nama = promoNameById[String(op.promo_id)] || '';
        if (nama) (bonusByOrder[String(op.order_id)] ||= []).push(nama);
      }

      const isAks = (nm: string) => aksesorisSet.has(String(nm || '').trim().toLowerCase());

      const out: DeadlineOrder[] = [];
      for (const o of orders as Row[]) {
        if (!isVisibleTanggalOrder(o.tanggal_order)) continue;
        // Buang lead yang masih di CS Selling (status SELLING) — belum jadi
        // CS Order, belum punya deadline yang di-commit. Konsisten dengan
        // tabel CS Order yang juga menyembunyikan row SELLING. Tanpa ini,
        // lead pre-handoff (mis. Gunawan DS) bisa muncul di bucket auto
        // sekaligus dengan order aslinya yang sudah di-set manual.
        if (String(o.status || '').toUpperCase() === 'SELLING') continue;
        const its = itemsByOrder[String(o.id)] || [];
        const names = its.map(it => String(it.paket_nama || '')).filter(Boolean);
        const dl = computeDeadlineLock({
          pilihanPaket: o.pilihan_paket,
          tanggalAccProofing: o.tanggal_acc_proofing,
          deadlineLock: o.deadline_lock,
          holidays,
          isJaket: hasJaket(names),
        });
        if (!dl) continue; // hanya yang sudah punya Deadline Lock

        // Split per paket: kelompokkan item non-aksesoris per tier+variant.
        // 1 order bisa punya >1 paket (mis. Jersey Classic C + Standar A).
        const detGroups = new Map<string, PaketLine>();
        let undetQty = 0;
        for (const it of its) {
          const nm = String(it.paket_nama || '');
          if (isAks(nm)) continue;                 // aksesoris tidak dihitung
          const q = Number(it.qty) || 0;
          const det = detectPaket([nm]);
          if (det.tier) {
            const g = detGroups.get(det.display);
            if (g) g.qty += q;
            else detGroups.set(det.display, { key: det.display, tier: det.tier, display: det.display, qty: q, detected: true });
          } else {
            undetQty += q;
          }
        }
        const lines: PaketLine[] = Array.from(detGroups.values()).sort((a, b) => a.display.localeCompare(b.display));
        // Item tanpa tier terdeteksi → satu baris manual (pakai dropdown tier).
        // Kalau order sama sekali tak punya baris, tetap tampilkan 1 baris.
        if (undetQty > 0 || lines.length === 0) {
          lines.push({ key: '__manual__', tier: '', display: '', qty: undetQty, detected: false });
        }
        const manualTier = String(o.deadline_paket_tier || '').toUpperCase();
        out.push({
          id: Number(o.id),
          customer: String(o.customer_nama || ''),
          lines,
          manualTier: TIER_OPTIONS.includes(manualTier) ? manualTier : '',
          bonus: (bonusByOrder[String(o.id)] || []).join(', '),
          ket: String(o.keterangan || ''),
          dl,
          monthKey: monthKeyOf(dl),
          totalQty: lines.reduce((s, l) => s + l.qty, 0),
        });
      }
      setRowsAll(out);
    } catch {
      setRowsAll([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Simpan tier manual (optimistic + persist ke orders.deadline_paket_tier).
  async function pickTier(id: number, tier: string) {
    setRowsAll(prev => prev.map(r => (r.id === id ? { ...r, manualTier: tier } : r)));
    try {
      await dbUpdate('orders', id, { deadline_paket_tier: tier || null });
    } catch {
      load();
    }
  }

  const monthKeys = useMemo(() => {
    const set = new Set(rowsAll.map(r => r.monthKey).filter(k => k !== '_no_dl_'));
    return Array.from(set).sort();
  }, [rowsAll]);

  const monthRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = selectedMonth ? rowsAll.filter(r => r.monthKey === selectedMonth) : rowsAll;
    if (q) rows = rows.filter(r =>
      r.customer.toLowerCase().includes(q) ||
      r.lines.some(l => l.display.toLowerCase().includes(q)) ||
      r.bonus.toLowerCase().includes(q));
    return rows;
  }, [rowsAll, selectedMonth, search]);

  const dateGroups = useMemo(() => {
    const map = new Map<string, DeadlineOrder[]>();
    for (const r of monthRows) {
      if (!map.has(r.dl)) map.set(r.dl, []);
      map.get(r.dl)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dl, rows]) => ({
        dl,
        rows: rows.slice().sort((a, b) => a.customer.localeCompare(b.customer)),
        qty: rows.reduce((s, r) => s + r.totalQty, 0),
        point: Math.round(rows.reduce((s, r) => s + orderPoint(r), 0) * 10) / 10,
      }));
  }, [monthRows]);

  const totalQty = monthRows.reduce((s, r) => s + r.totalQty, 0);
  const totalPoint = Math.round(monthRows.reduce((s, r) => s + orderPoint(r), 0) * 10) / 10;
  const needPickCount = monthRows.filter(orderNeedsPick).length;
  const monthLabelSel = selectedMonth ? monthLabel(selectedMonth) : 'Semua Bulan';
  const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  const [pdfBusy, setPdfBusy] = useState(false);
  async function downloadPdf() {
    if (dateGroups.length === 0) return;
    setPdfBusy(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text(`LAPORAN DEADLINE CS ORDER — ${monthLabelSel}`, pageW / 2, 14, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`${monthRows.length} order · ${totalQty} pcs · ${totalPoint.toLocaleString('id-ID')} poin`, pageW / 2, 20, { align: 'center' });
      let y = 26;
      for (const g of dateGroups) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any[] = [];
        g.rows.forEach((o, oi) => {
          o.lines.forEach((l, li) => {
            const tier = lineTier(l, o);
            body.push([
              li === 0 ? String(oi + 1) : '',
              li === 0 ? (o.customer || '-') : '',
              String(l.qty),
              l.detected ? l.display : (o.manualTier || '-'),
              tier ? linePoint(l, o).toLocaleString('id-ID') : '-',
            ]);
          });
        });
        body.push([
          { content: 'TOTAL', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] } },
          { content: String(g.qty), styles: { halign: 'center', fontStyle: 'bold', fillColor: [187, 247, 208] } },
          { content: '', styles: { fillColor: [241, 245, 249] } },
          { content: g.point.toLocaleString('id-ID'), styles: { halign: 'right', fontStyle: 'bold', fillColor: [254, 202, 202] } },
        ]);
        if (y > pageH - 30) { doc.addPage(); y = 15; }
        autoTable(doc, {
          startY: y,
          margin: { left: 8, right: 8 },
          head: [
            [{ content: fmtDL(g.dl), colSpan: 5, styles: { halign: 'left', fillColor: [251, 191, 36], textColor: 20, fontStyle: 'bold', fontSize: 10 } }],
            [
              { content: 'No', styles: { halign: 'center' } }, 'Customer',
              { content: 'Qty', styles: { halign: 'center' } }, 'Paket',
              { content: 'Point', styles: { halign: 'right' } },
            ],
          ],
          body,
          styles: { fontSize: 8, cellPadding: 1.3, overflow: 'linebreak', valign: 'middle', lineColor: [203, 213, 225], lineWidth: 0.1 },
          headStyles: { fillColor: [186, 230, 253], textColor: 20, fontStyle: 'bold', fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 11, halign: 'center' }, 1: { cellWidth: 'auto' },
            2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 34 }, 4: { cellWidth: 24, halign: 'right' },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          didDrawPage: (d: any) => { y = d.cursor.y; },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 5;
      }
      doc.save(`Laporan-Deadline-${selectedMonth || 'semua'}.pdf`);
    } catch (e) { console.error('PDF gagal', e); }
    setPdfBusy(false);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-amber-500/[0.14] via-orange-500/[0.05] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-500/5 border border-amber-500/25 grid place-items-center shrink-0">
              <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Laporan Deadline CS Order</h1>
              <p className="text-[13px] text-slate-300 mt-0.5">
                Per tanggal Deadline Lock · <span className="text-white font-medium">{monthLabelSel} · {monthRows.length} order · {totalQty} pcs · {totalPoint} poin</span>
                {needPickCount > 0 && <span className="text-amber-300"> · {needPickCount} paket perlu dipilih tier-nya</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:max-w-[560px] lg:justify-end">
            <span className="text-xs text-slate-500 uppercase tracking-wider hidden sm:inline shrink-0">Bulan</span>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/40 date-input shrink-0" />
            <button onClick={() => setSelectedMonth(thisMonth)}
              className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-white/10 hover:bg-white/[0.04] transition-colors shrink-0">Bulan Ini</button>
            <button onClick={downloadPdf} disabled={pdfBusy || dateGroups.length === 0}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/15 disabled:opacity-40 px-3 py-2 rounded-lg transition-colors shrink-0"
              title="Download PDF laporan deadline bulan ini">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {pdfBusy ? 'Membuat...' : 'Download PDF'}
            </button>
            <div className="relative flex-1 basis-full sm:basis-[220px] min-w-[180px]">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari customer, paket, bonus..."
                className="w-full bg-white/[0.03] border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-amber-500/40" />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-40 grid place-items-center"><div className="w-8 h-8 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" /></div>
      ) : dateGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-slate-400">Tidak ada order untuk {monthLabelSel}.</p>
          {selectedMonth && monthKeys.length > 0 && (
            <p className="text-xs text-slate-500 mt-1.5">Bulan yang ada data: {monthKeys.map(monthLabel).join(' · ')}.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
          {dateGroups.map(g => (
          <div key={g.dl} className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.06] bg-amber-500/[0.06]">
              <h2 className="text-base font-bold text-amber-300 tracking-wide">{fmtDL(g.dl)}</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">Deadline Lock · {g.rows.length} order · {g.qty} pcs · {g.point.toLocaleString('id-ID')} poin</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs bg-white text-slate-800 border-collapse">
                <thead>
                  <tr className="text-[10px] text-slate-700 font-bold uppercase tracking-wide">
                    <th className="bg-sky-100 border border-slate-300 px-1 py-1.5 text-center w-7">No</th>
                    <th className="bg-sky-100 border border-slate-300 px-2 py-1.5 text-left">Cust</th>
                    <th className="bg-sky-100 border border-slate-300 px-1 py-1.5 text-center w-10">Qty</th>
                    <th className="bg-sky-100 border border-slate-300 px-2 py-1.5 text-left w-24">Paket</th>
                    <th className="bg-sky-100 border border-slate-300 px-1 py-1.5 text-center w-14">Point</th>
                    <th className="bg-sky-100 border border-slate-300 px-0.5 py-1.5 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => {
                    const isOpen = expandedId === r.id;
                    const L = r.lines.length;
                    const rowCls = isOpen ? 'bg-sky-50' : 'bg-white hover:bg-slate-50';
                    const ketText = htmlToText(r.ket);
                    return (
                      <Fragment key={r.id}>
                        {r.lines.map((l, li) => {
                          const eff = lineTier(l, r);
                          return (
                            <tr key={l.key}
                              onClick={() => setExpandedId(prev => (prev === r.id ? null : r.id))}
                              className={`cursor-pointer transition-colors ${rowCls}`}
                              title="Klik untuk lihat keterangan">
                              {li === 0 && (
                                <td rowSpan={L} className="border border-slate-300 px-1 py-1.5 text-center tabular-nums text-slate-500 align-middle">{i + 1}</td>
                              )}
                              {li === 0 && (
                                <td rowSpan={L} className="border border-slate-300 px-2 py-1.5 font-semibold text-slate-800 break-words align-middle">{r.customer || '-'}</td>
                              )}
                              <td className="border border-slate-300 px-1 py-1.5 text-center tabular-nums font-semibold">{l.qty}</td>
                              <td className="border border-slate-300 px-2 py-1.5">
                                {l.detected ? (
                                  <span className="uppercase text-[11px] font-semibold tracking-wide text-slate-700">{l.display}</span>
                                ) : (
                                  <select
                                    value={r.manualTier}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => { e.stopPropagation(); pickTier(r.id, e.target.value); }}
                                    className={`bg-white border rounded-md px-1 py-0.5 text-[11px] focus:outline-none cursor-pointer w-full ${r.manualTier ? 'border-slate-300 text-slate-800' : 'border-amber-400 text-amber-700 bg-amber-50'}`}
                                  >
                                    <option value="">Pilih…</option>
                                    {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                )}
                              </td>
                              <td className="border border-slate-300 px-1 py-1.5 text-center tabular-nums font-bold text-slate-900">
                                {eff ? linePoint(l, r).toLocaleString('id-ID') : <span className="text-slate-300">—</span>}
                              </td>
                              {li === 0 && (
                                <td rowSpan={L} className="border border-slate-300 px-0.5 py-1.5 text-center text-slate-400 align-middle">
                                  <svg className={`w-3 h-3 inline-block transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {isOpen && (
                          <tr className="bg-sky-50/60">
                            <td className="border border-slate-300 px-2 py-2 text-[11px] text-slate-600 whitespace-pre-wrap break-words" colSpan={6}>
                              <span className="font-bold text-slate-700 uppercase tracking-wide mr-1">Keterangan:</span>
                              {ketText ? ketText : <span className="text-slate-400 italic">— tidak ada keterangan —</span>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  <tr className="font-bold text-slate-900">
                    <td className="bg-slate-100 border border-slate-300 px-1 py-1.5" />
                    <td className="bg-slate-100 border border-slate-300 px-2 py-1.5 uppercase text-[11px] text-slate-600">Total</td>
                    <td className="bg-emerald-200 border border-slate-400 px-1 py-1.5 text-center tabular-nums text-emerald-900">{g.qty}</td>
                    <td className="bg-slate-100 border border-slate-300 px-2 py-1.5" />
                    <td className="bg-rose-200 border border-slate-400 px-1 py-1.5 text-center tabular-nums text-rose-900">{g.point.toLocaleString('id-ID')}</td>
                    <td className="bg-slate-100 border border-slate-300 px-0.5 py-1.5" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          ))}
        </div>
      )}
    </div>
  );
}
