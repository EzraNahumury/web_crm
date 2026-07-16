'use client';
import { useEffect, useMemo, useState } from 'react';
import { dbGet, dbCreate, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';
import { classifyLayanan, type LayananKind } from '@/lib/business-days';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type BoardKey = 'proofing' | 'perbanyak' | 'print-fedar' | 'print-grando';

type Board = {
  key: BoardKey;
  title: string;
  // Header color scheme — matches the reference Excel: orange for proofing,
  // magenta for perbanyak, purple for print fedar & grando.
  headerBg: string;
  headerText: string;
  // Description of what happens when a row is checked off on this board.
  nextBoardHint: string;
};

// Left-to-right flow: proofing → perbanyak → print-fedar → print-grando.
// Checking a row on the last board = finished (moves to History Monitoring).
const BOARDS: Board[] = [
  { key: 'proofing',      title: 'PROOFING',                headerBg: 'bg-orange-500',  headerText: 'text-white', nextBoardHint: 'Checklist → pindah ke Monitoring Perbanyak' },
  { key: 'perbanyak',     title: 'MONITORING PERBANYAK',    headerBg: 'bg-pink-600',    headerText: 'text-white', nextBoardHint: 'Checklist → pindah ke Monitoring Print Fedar' },
  { key: 'print-fedar',   title: 'MONITORING PRINT FEDAR',  headerBg: 'bg-purple-600',  headerText: 'text-white', nextBoardHint: 'Checklist → pindah ke Monitoring Print Grando' },
  { key: 'print-grando',  title: 'MONITORING PRINT GRANDO', headerBg: 'bg-purple-800',  headerText: 'text-white', nextBoardHint: 'Checklist → selesai (masuk History)' },
];

// Board progression. Checking the last board sends the row to 'history'.
const BOARD_SEQ: BoardKey[] = ['proofing', 'perbanyak', 'print-fedar', 'print-grando'];
// Perbanyak fans out to Fedar and/or Grando via a picker modal (handled
// separately). For every other board the check goes to the next stage
// linearly, and Fedar/Grando both end in history.
function nextBoard(cur: string): string {
  if (cur === 'proofing') return 'perbanyak';
  if (cur === 'print-fedar' || cur === 'print-grando') return 'history';
  // Perbanyak is handled by the modal — this fallback should not be hit
  // in practice.
  return 'history';
}

const KETERANGAN_OPTIONS = ['Belum ACC', 'Revisi Proofing'];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatDateLabel(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
// Normalize a DB date/datetime value to a YYYY-MM-DD string for date matching.
function toIsoDate(v: string) {
  if (!v) return '';
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowSql() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function MonitoringProduksiPage() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const [orders, items] = await Promise.all([dbGet('orders'), dbGet('order_items')]);
      let mps = await dbGet('monitoring_produksi');

      // Lazy-sync: every order gets a monitoring row (starts on proofing).
      const existing = new Set(mps.map((m: Row) => String(m.order_id)));
      const missing = orders.filter((o: Row) => !existing.has(String(o.id)));
      if (missing.length > 0) {
        await Promise.all(
          missing.map((o: Row) =>
            dbCreate('monitoring_produksi', { order_id: o.id, board: 'proofing', keterangan: 'Belum ACC' }).catch(() => {})
          )
        );
        mps = await dbGet('monitoring_produksi');
      }

      // Index orders + aggregate qty/paket from order_items
      const orderMap: Record<string, Row> = {};
      for (const o of orders) orderMap[String(o.id)] = o;
      const qtyByOrder: Record<string, number> = {};
      const paketByOrder: Record<string, string[]> = {};
      for (const it of items) {
        const k = String(it.order_id);
        qtyByOrder[k] = (qtyByOrder[k] || 0) + (Number(it.qty) || 0);
        if (it.paket_nama) (paketByOrder[k] ||= []).push(String(it.paket_nama));
      }

      const enriched = mps
        .filter((m: Row) => m.board !== 'history' && orderMap[String(m.order_id)])
        .map((m: Row) => {
          const o = orderMap[String(m.order_id)];
          const pilihan = String(o.pilihan_paket || '');
          return {
            mpId: m.id,
            orderId: m.order_id,
            board: m.board as BoardKey,
            keterangan: m.keterangan || 'Belum ACC',
            tanggalOrder: toIsoDate(o.tanggal_order),
            tim: o.nama_tim || '',
            customer: o.customer_nama || '',
            qty: qtyByOrder[String(m.order_id)] || 0,
            paket: (paketByOrder[String(m.order_id)] || []).join(', ') || '-',
            pilihanPaket: pilihan,
            layananKind: classifyLayanan(pilihan) as LayananKind,
          };
        });
      setRows(enriched);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Priority: prioritas → express → reguler → unknown (so hot orders sit up top)
  const layananRank: Record<LayananKind, number> = { prioritas: 0, express: 1, reguler: 2, unknown: 3 };
  const byBoard = useMemo(() => {
    const map: Record<BoardKey, Row[]> = { proofing: [], perbanyak: [], 'print-fedar': [], 'print-grando': [] };
    // Filter by tanggal order unless "Semua" is active.
    const list = showAll ? rows : rows.filter(r => r.tanggalOrder === selectedDate);
    for (const r of list) if (map[r.board as BoardKey]) map[r.board as BoardKey].push(r);
    // Sort each board by service tier priority (stable): prioritas top, then express, then reguler
    for (const k of Object.keys(map) as BoardKey[]) {
      map[k].sort((a, b) => (layananRank[a.layananKind as LayananKind] ?? 3) - (layananRank[b.layananKind as LayananKind] ?? 3));
    }
    return map;
  }, [rows, showAll, selectedDate]);

  // Perbanyak → picker modal. Every other board still uses the linear
  // advance flow.
  const [perbanyakPickerRow, setPerbanyakPickerRow] = useState<Row | null>(null);

  async function advance(row: Row) {
    if (row.board === 'perbanyak') {
      setPerbanyakPickerRow(row);
      return;
    }
    setBusyId(row.mpId);
    const target = nextBoard(row.board);
    try {
      const patch: Record<string, unknown> = { board: target };
      if (target === 'history') patch.completed_at = nowSql();
      await dbUpdate('monitoring_produksi', row.mpId, patch);
      if (target === 'history') {
        toast.success('Selesai', `${row.tim || row.customer} masuk ke History Monitoring.`);
      }
      await load();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
    setBusyId(null);
  }

  // Called from the picker modal after CS confirms which board(s) the row
  // should land on. Updates the existing Perbanyak row to the first
  // destination and — if both destinations are picked — inserts an extra
  // row for the second board (composite (order_id, board) UNIQUE key
  // allows this).
  async function moveFromPerbanyak(row: Row, dests: BoardKey[]) {
    if (dests.length === 0) return;
    setBusyId(row.mpId);
    setPerbanyakPickerRow(null);
    try {
      const [first, ...rest] = dests;
      await dbUpdate('monitoring_produksi', row.mpId, { board: first });
      for (const b of rest) {
        await dbCreate('monitoring_produksi', {
          order_id: row.orderId,
          board: b,
          keterangan: row.keterangan || 'Belum ACC',
        });
      }
      const labelMap: Record<BoardKey, string> = {
        proofing: 'Proofing',
        perbanyak: 'Perbanyak',
        'print-fedar': 'Print Fedar',
        'print-grando': 'Print Grando',
      };
      toast.success('Dipindahkan', `${row.tim || row.customer} → ${dests.map(d => labelMap[d]).join(' + ')}`);
      await load();
    } catch (e) {
      toast.error('Gagal', String(e));
    }
    setBusyId(null);
  }

  async function changeKeterangan(row: Row, value: string) {
    // Optimistic update so the dropdown feels instant.
    setRows(prev => prev.map(r => (r.mpId === row.mpId ? { ...r, keterangan: value } : r)));
    try {
      await dbUpdate('monitoring_produksi', row.mpId, { keterangan: value });
    } catch (e) {
      toast.error('Gagal simpan keterangan', String(e));
      load();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Monitoring Produksi</h1>
          <p className="text-sm text-slate-400 mt-1">
            Papan monitoring 4 tahap, difilter berdasarkan tanggal order. Flow: Proofing → Perbanyak → Print Fedar → Print Grando.
          </p>
        </div>

        {/* Date filter — filters rows by tanggal order. "Semua" shows every date. */}
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-slate-500 uppercase tracking-wider">Tanggal Order</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); setShowAll(false); }}
            disabled={showAll}
            className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500/40 date-input disabled:opacity-40"
          />
          <button
            onClick={() => { setSelectedDate(todayIso()); setShowAll(false); }}
            className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-white/10 hover:bg-white/[0.04] transition-colors"
          >
            Hari Ini
          </button>
          <button
            onClick={() => setShowAll(v => !v)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${showAll ? 'bg-blue-600 border-blue-500 text-white' : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.04]'}`}
          >
            Semua
          </button>
        </div>
      </div>

      {/* Info flow */}
      <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/20 p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-xs text-blue-300 leading-relaxed">
          Semua order otomatis masuk ke <strong>Proofing</strong>. Centang <strong>Checklist</strong> untuk memindahkan baris
          ke tabel berikutnya. Setelah dicentang di <strong>Print Grando</strong>, baris tersimpan di <strong>History Monitoring</strong>.
        </p>
      </div>

      {/* Horizontal scroll container for the 4 boards */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {BOARDS.map(board => (
            <BoardCard
              key={board.key}
              board={board}
              dateLabel={showAll ? 'Semua Tanggal' : formatDateLabel(selectedDate)}
              rows={byBoard[board.key]}
              loading={loading}
              busyId={busyId}
              onAdvance={advance}
              onKeterangan={changeKeterangan}
            />
          ))}
        </div>
      </div>

      {perbanyakPickerRow && (
        <PerbanyakPicker
          row={perbanyakPickerRow}
          onCancel={() => setPerbanyakPickerRow(null)}
          onConfirm={dests => moveFromPerbanyak(perbanyakPickerRow, dests)}
        />
      )}
    </div>
  );
}

function PerbanyakPicker({
  row, onCancel, onConfirm,
}: {
  row: Row;
  onCancel: () => void;
  onConfirm: (dests: BoardKey[]) => void;
}) {
  const [fedar, setFedar] = useState(true);
  const [grando, setGrando] = useState(false);
  const disabled = !fedar && !grando;

  function confirm() {
    const dests: BoardKey[] = [];
    if (fedar) dests.push('print-fedar');
    if (grando) dests.push('print-grando');
    onConfirm(dests);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-[#141a2e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white">Pindahkan ke Tabel Print</h3>
            <p className="text-xs text-slate-400 mt-1">Pilih 1 atau kedua tujuan print untuk order ini.</p>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3 mb-5">
          <p className="text-sm font-semibold text-white">{row.customer || row.tim || '-'}</p>
          {row.tim && row.customer && row.tim !== row.customer && (
            <p className="text-xs text-slate-500">{row.tim}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">{row.paket} · {row.qty || 0} pcs</p>
        </div>

        <div className="space-y-2">
          <label className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${fedar ? 'bg-purple-500/[0.10] border-purple-500/40' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'}`}>
            <input
              type="checkbox"
              checked={fedar}
              onChange={e => setFedar(e.target.checked)}
              className="w-4 h-4 accent-purple-500 cursor-pointer"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Monitoring Print Fedar</p>
              <p className="text-[10px] text-slate-500">Kirim ke antrian Print Fedar</p>
            </div>
          </label>
          <label className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${grando ? 'bg-purple-800/[0.15] border-purple-700/50' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'}`}>
            <input
              type="checkbox"
              checked={grando}
              onChange={e => setGrando(e.target.checked)}
              className="w-4 h-4 accent-purple-700 cursor-pointer"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Monitoring Print Grando</p>
              <p className="text-[10px] text-slate-500">Kirim ke antrian Print Grando</p>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            Batal
          </button>
          <button
            onClick={confirm}
            disabled={disabled}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            Pindahkan
          </button>
        </div>
      </div>
    </div>
  );
}

// RGB colors matching the Tailwind header bg — reused when generating the PDF.
const BOARD_PDF_RGB: Record<BoardKey, [number, number, number]> = {
  proofing:      [249, 115, 22],   // orange-500
  perbanyak:     [219, 39, 119],   // pink-600
  'print-fedar': [147, 51, 234],   // purple-600
  'print-grando':[107, 33, 168],   // purple-800
};

function BoardCard({
  board, dateLabel, rows, loading, busyId, onAdvance, onKeterangan,
}: {
  board: Board;
  dateLabel: string;
  rows: Row[];
  loading: boolean;
  busyId: number | null;
  onAdvance: (row: Row) => void;
  onKeterangan: (row: Row, value: string) => void;
}) {
  const isProofing = board.key === 'proofing';
  const colCount = isProofing ? 5 : 4;
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  // Filter by search — case-insensitive match on tim, customer, or paket
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.tim || '').toLowerCase().includes(q)
      || String(r.customer || '').toLowerCase().includes(q)
      || String(r.paket || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalQty = filtered.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  // Keep the board a stable height when nearly empty.
  const padCount = Math.max(0, 8 - filtered.length);

  async function handleExportPdf() {
    setExporting(true);
    try {
      const jspdf = await import('jspdf');
      const autoTableMod = await import('jspdf-autotable');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autoTable = (autoTableMod as any).default || autoTableMod;
      const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const rgb = BOARD_PDF_RGB[board.key];
      const pageW = doc.internal.pageSize.getWidth();

      // Colored title band
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.rect(0, 0, pageW, 56, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(board.title, pageW / 2, 26, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(dateLabel, pageW / 2, 44, { align: 'center' });

      // Table body
      const bodyRows = filtered.map((r, i) => [
        String(i + 1),
        r.tim ? `${r.tim}\n${r.customer || ''}`.trim() : (r.customer || '-'),
        r.qty > 0 ? String(r.qty) : '-',
        r.paket || '-',
        r.pilihanPaket || '-',
        r.keterangan || '-',
      ]);

      autoTable(doc, {
        startY: 72,
        head: [['NO', 'TIM / CUSTOMER', 'QTY', 'PAKET', 'LAYANAN', 'KETERANGAN']],
        body: bodyRows,
        theme: 'grid',
        headStyles: { fillColor: rgb, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 9, cellPadding: 6, valign: 'middle' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 40 },
          1: { cellWidth: 220 },
          2: { halign: 'center', cellWidth: 50 },
          3: { cellWidth: 150 },
          4: { cellWidth: 110 },
          5: { cellWidth: 'auto' },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell(data: any) {
          if (data.section !== 'body') return;
          const row = filtered[data.row.index];
          if (!row) return;
          if (row.layananKind === 'prioritas') data.cell.styles.fillColor = [255, 237, 213];
          else if (row.layananKind === 'express') data.cell.styles.fillColor = [254, 226, 226];
        },
        foot: [[
          { content: 'TOTAL QTY', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: String(totalQty), styles: { halign: 'center', fontStyle: 'bold' } },
          { content: '', colSpan: 3 },
        ]],
        footStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255] },
        margin: { top: 72, right: 20, bottom: 40, left: 20 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didDrawPage(data: any) {
          const p = doc.internal.pageSize;
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.setFont('helvetica', 'normal');
          doc.text(`AYRES CRM · ${new Date().toLocaleString('id-ID')}`, 20, p.getHeight() - 15);
          doc.text(`Halaman ${data.pageNumber}`, p.getWidth() - 20, p.getHeight() - 15, { align: 'right' });
        },
      });

      const safeDate = dateLabel.replace(/[^\w-]/g, '_');
      doc.save(`monitoring-${board.key}-${safeDate}.pdf`);
    } catch (e) {
      console.error('PDF export failed', e);
      alert('Gagal export PDF: ' + String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="w-[520px] shrink-0 rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden flex flex-col">
      {/* Colored title bar with Export button */}
      <div className={`${board.headerBg} ${board.headerText} px-4 py-2.5 flex items-center justify-between gap-3`}>
        <h2 className="text-sm font-bold tracking-wide flex-1 text-center">{board.title}</h2>
        <button
          onClick={handleExportPdf}
          disabled={exporting || loading}
          title="Export tabel ke PDF"
          className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white/20 hover:bg-white/30 disabled:opacity-40 text-white px-2 py-1 rounded-md transition-colors shrink-0"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {exporting ? '...' : 'PDF'}
        </button>
      </div>

      {/* Date bar + search */}
      <div className="px-4 py-2 border-b border-white/[0.06] bg-white/[0.02] flex items-center gap-2">
        <p className="text-xs font-semibold text-white shrink-0">{dateLabel}</p>
        <div className="flex-1 relative">
          <svg className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari tim, customer, paket..."
            className="w-full bg-[#0d1117] border border-white/10 text-white text-[10px] placeholder-slate-500 rounded-md pl-6 pr-2 py-1 focus:outline-none focus:border-blue-500/40"
          />
        </div>
      </div>

      {/* Table — thead + tfoot sticky within the card's own scroll so the
          header stays visible when the row list gets long. Card body
          capped by max-h so 4 cards side-by-side don't force full page
          scroll to reach a footer. */}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#111827]">
              <Th className="w-[36%] border-b-2 border-white/[0.1] bg-white/[0.04]">TIM / CUSTOMER</Th>
              <Th className="w-[10%] text-center border-b-2 border-white/[0.1] bg-white/[0.04]">QTY</Th>
              <Th className="w-[18%] text-center border-b-2 border-white/[0.1] bg-white/[0.04]">PAKET</Th>
              <Th className="w-[12%] text-center border-b-2 border-white/[0.1] bg-white/[0.04]">CECKLIST</Th>
              {isProofing && <Th className="border-b-2 border-white/[0.1] bg-white/[0.04]">KETERANGAN</Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td className="text-center text-slate-500" colSpan={colCount}>Memuat…</Td></tr>
            ) : (
              <>
                {filtered.map(row => {
                  const rowBg =
                    row.layananKind === 'prioritas' ? 'bg-orange-500/[0.08] hover:bg-orange-500/[0.12]' :
                    row.layananKind === 'express'   ? 'bg-red-500/[0.08] hover:bg-red-500/[0.12]' :
                    'hover:bg-white/[0.02]';
                  return (
                  <tr key={row.mpId} className={`border-b border-white/[0.04] transition-colors ${rowBg}`}>
                    <Td className="text-slate-200">
                      {/* Customer name di atas (bold, main line), nama tim di
                          bawah sebagai subtitle. Kalau tidak ada nama tim,
                          fallback ke tim/customer apa adanya supaya baris
                          tidak kosong. */}
                      <span className="font-semibold">{row.customer || row.tim || '-'}</span>
                      {row.tim && row.customer && row.tim !== row.customer && (
                        <span className="block text-[10px] text-slate-500">{row.tim}</span>
                      )}
                    </Td>
                    <Td className="text-center tabular-nums text-slate-300">{row.qty > 0 ? row.qty : '-'}</Td>
                    <Td className="text-center text-slate-400">{row.paket}</Td>
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={busyId === row.mpId}
                        onChange={() => onAdvance(row)}
                        title="Centang untuk pindah ke tabel berikutnya"
                        className="w-4 h-4 rounded border-white/20 bg-transparent accent-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                      />
                    </Td>
                    {isProofing && (
                      <Td>
                        <select
                          value={row.keterangan}
                          onChange={e => onKeterangan(row, e.target.value)}
                          className="w-full bg-[#0d1117] border border-white/10 text-slate-200 text-[11px] rounded-md px-2 py-1 focus:outline-none focus:border-blue-500/40 cursor-pointer"
                        >
                          {KETERANGAN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </Td>
                    )}
                  </tr>
                  );
                })}
                {Array.from({ length: padCount }).map((_, i) => (
                  <tr key={`pad-${i}`} className="border-b border-white/[0.04]">
                    {Array.from({ length: colCount }).map((__, j) => (
                      <Td key={j} className="text-slate-500">&nbsp;</Td>
                    ))}
                  </tr>
                ))}
              </>
            )}
          </tbody>
          {/* Total footer — sticky so it stays visible while scrolling */}
          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#1c2437]">
              <td className="px-3 py-2 text-right text-[11px] font-bold text-slate-300 uppercase tracking-wider border-t-2 border-white/[0.15]" colSpan={1}>
                Total QTY
              </td>
              <td className="px-3 py-2 text-center text-sm font-bold text-white tabular-nums border-t-2 border-white/[0.15]">
                {totalQty}
              </td>
              <td className="px-3 py-2 border-t-2 border-white/[0.15]" colSpan={colCount - 2}>&nbsp;</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2.5 border-r border-white/[0.06] last:border-r-0 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = '', colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 border-r border-white/[0.04] last:border-r-0 text-slate-300 ${className}`}>
      {children}
    </td>
  );
}
