'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/lib/toast';
import type { LayananKind } from '@/lib/business-days';

type Row = {
  order_id: number;
  no_order: string;
  cust: string;
  tim: string;
  qty: number;
  paket: string;
  bonus: string;
  keterangan: string;
  finishing_id: number | null;
  pilihan_paket: string;
  layanan_kind: LayananKind;
  dl: string;
  deadline_real: string;
  is_overdue: boolean;
  stts: string;
};
type ApiData = { weekStart: string; weekEnd: string; rows: Row[] };

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateShort(iso: string) {
  if (!iso) return '-';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][Number(m[2]) - 1];
  return `${Number(m[3])} ${monthShort}`;
}

function fmtDayLong(iso: string) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function CrmFinishingPage() {
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [keteranganDrafts, setKeteranganDrafts] = useState<Record<number, string>>({});
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/finishing?date=${encodeURIComponent(date)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat data');
      setData(json.data);
      setError('');
    } catch (e) {
      setError(String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const rows = data?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.cust.toLowerCase().includes(q)
      || r.tim.toLowerCase().includes(q)
      || r.paket.toLowerCase().includes(q)
      || r.no_order.toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalQty = filtered.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  async function saveKeterangan(orderId: number, value: string) {
    try {
      const res = await fetch('/api/crm/finishing/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, keterangan: value || null }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      // Optimistic update — no need to re-fetch the whole board
      setData(prev => prev ? {
        ...prev,
        rows: prev.rows.map(r => r.order_id === orderId ? { ...r, keterangan: value } : r),
      } : prev);
    } catch (e) {
      toast.error('Gagal simpan keterangan', String(e));
    }
  }

  async function checkoff(orderId: number, cust: string) {
    setBusyOrderId(orderId);
    try {
      const res = await fetch('/api/crm/finishing/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, completed: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Selesai finishing', `${cust} masuk ke History Finishing.`);
      await fetchData();
    } catch (e) {
      toast.error('Gagal checklist', String(e));
    } finally {
      setBusyOrderId(null);
    }
  }

  const weekLabel = data ? `${fmtDayLong(data.weekStart)} — ${fmtDayLong(data.weekEnd)}` : '';

  async function handleExportPdf() {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const jspdf = await import('jspdf');
      const autoTableMod = await import('jspdf-autotable');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autoTable = (autoTableMod as any).default || autoTableMod;
      const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pink: [number, number, number] = [219, 39, 119];
      const cyan: [number, number, number] = [6, 182, 212];

      // Pink title band matching the on-screen banner
      doc.setFillColor(...pink);
      doc.rect(0, 0, pageW, 56, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('FINISHING', pageW / 2, 26, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(weekLabel, pageW / 2, 44, { align: 'center' });

      // Body: NO, CUST, QTY, PAKET, BONUS, KET, DL, STTS (no Deadline Real)
      const body = filtered.map((r, i) => [
        String(i + 1),
        r.tim ? `${r.tim}\n${r.cust || ''}`.trim() : (r.cust || '-'),
        r.qty > 0 ? String(r.qty) : '-',
        r.paket || '-',
        r.bonus || '-',
        r.keterangan || '-',
        r.dl ? fmtDateShort(r.dl) : '-',
        r.stts || '-',
      ]);

      autoTable(doc, {
        startY: 72,
        head: [['NO', 'CUST', 'QTY', 'PAKET', 'BONUS', 'KET', 'DL', 'STTS']],
        body,
        theme: 'grid',
        headStyles: {
          fillColor: cyan,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
        },
        styles: { fontSize: 9, cellPadding: 6, valign: 'middle' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 32 },
          1: { cellWidth: 180 },
          2: { halign: 'center', cellWidth: 42 },
          3: { cellWidth: 130 },
          4: { cellWidth: 130 },
          5: { cellWidth: 130 },
          6: { halign: 'center', cellWidth: 65 },
          7: { halign: 'center', cellWidth: 'auto' },
        },
        // Tint rows by service tier so the PDF matches the on-screen palette.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell(cellData: any) {
          if (cellData.section !== 'body') return;
          const row = filtered[cellData.row.index];
          if (!row) return;
          if (row.layanan_kind === 'prioritas') cellData.cell.styles.fillColor = [255, 237, 213];
          else if (row.layanan_kind === 'express') cellData.cell.styles.fillColor = [254, 226, 226];
          // Overdue DL cell → red text
          if (cellData.column.index === 6 && row.is_overdue) {
            cellData.cell.styles.textColor = [220, 38, 38];
            cellData.cell.styles.fontStyle = 'bold';
          }
        },
        foot: [[
          { content: 'TOTAL QTY', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: String(totalQty), styles: { halign: 'center', fontStyle: 'bold' } },
          { content: '', colSpan: 5 },
        ]],
        footStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255] },
        margin: { top: 72, right: 20, bottom: 40, left: 20 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didDrawPage(pageData: any) {
          const p = doc.internal.pageSize;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(`AYRES CRM · ${new Date().toLocaleString('id-ID')}`, 20, p.getHeight() - 15);
          doc.text(`Halaman ${pageData.pageNumber}`, p.getWidth() - 20, p.getHeight() - 15, { align: 'right' });
        },
      });

      const safeWeek = weekLabel.replace(/[^\w-]/g, '_');
      doc.save(`papan-finishing-${safeWeek}.pdf`);
    } catch (e) {
      console.error('PDF export failed', e);
      toast.error('Gagal export PDF', String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Papan Finishing</h1>
          <p className="text-sm text-slate-400 mt-1">
            Order minggu ini (dan yang sudah overdue). Checklist untuk memindahkan ke History Finishing.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <label className="text-xs text-slate-500 uppercase tracking-wider">Tanggal</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500/40 date-input"
          />
          <button
            onClick={() => setDate(todayIso())}
            className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-white/10 hover:bg-white/[0.04] transition-colors"
          >
            Hari Ini
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exporting || loading || filtered.length === 0}
            title="Export Papan Finishing ke PDF"
            className="inline-flex items-center gap-1.5 text-xs text-white bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {exporting ? 'Menyiapkan...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {/* Pink banner header */}
      <div className="rounded-lg bg-pink-600 text-white text-center py-2 font-bold tracking-wide">
        FINISHING {weekLabel || (data ? '' : '...')}
      </div>

      {/* Search + total */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari customer, tim, paket, no order..."
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm placeholder-slate-500 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-blue-500/40"
          />
        </div>
        <div className="text-xs text-slate-400 shrink-0">
          {filtered.length} order · Total <strong className="text-white">{totalQty}</strong> qty
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] py-16 text-center">
          <p className="text-sm text-slate-500">Memuat...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] py-16 text-center">
          <p className="text-sm text-slate-500">
            {search ? 'Tidak ada order yang cocok dengan pencarian.' : 'Belum ada order dalam periode ini.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-cyan-500/90 text-white">
                  <Th className="w-[4%] text-center">NO</Th>
                  <Th className="w-[20%]">CUST</Th>
                  <Th className="w-[6%] text-center">QTY</Th>
                  <Th className="w-[14%]">PAKET</Th>
                  <Th className="w-[14%]">BONUS</Th>
                  <Th className="w-[14%]">KET</Th>
                  <Th className="w-[8%] text-center">DL</Th>
                  <Th className="w-[8%] text-center">DEADLINE REAL</Th>
                  <Th className="w-[6%] text-center">STTS</Th>
                  <Th className="w-[6%] text-center">✓</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const rowBg =
                    r.layanan_kind === 'prioritas' ? 'bg-orange-500/[0.12]' :
                    r.layanan_kind === 'express'   ? 'bg-red-500/[0.12]' :
                    '';
                  const overdueMark = r.is_overdue ? 'text-red-400' : 'text-amber-300';
                  return (
                    <tr key={r.order_id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${rowBg}`}>
                      <Td className="text-center text-slate-400">{i + 1}</Td>
                      <Td>
                        <div className="text-white font-medium truncate max-w-[220px]" title={r.cust}>{r.cust || '-'}</div>
                        {r.tim && r.tim !== r.cust && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[220px]" title={r.tim}>{r.tim}</div>
                        )}
                        {r.is_overdue && (
                          <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded font-bold">OVERDUE</span>
                        )}
                      </Td>
                      <Td className="text-center text-white font-semibold tabular-nums">{r.qty || '-'}</Td>
                      <Td className="text-slate-300 truncate max-w-[160px]" title={r.paket}>{r.paket}</Td>
                      <Td className="text-slate-400 truncate max-w-[160px]" title={r.bonus}>{r.bonus || '-'}</Td>
                      <Td>
                        <input
                          type="text"
                          value={keteranganDrafts[r.order_id] ?? r.keterangan}
                          onChange={e => setKeteranganDrafts(prev => ({ ...prev, [r.order_id]: e.target.value }))}
                          onBlur={e => {
                            const val = e.target.value;
                            if (val !== r.keterangan) saveKeterangan(r.order_id, val);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          placeholder="—"
                          className="w-full bg-[#0d1117] border border-white/10 text-slate-200 text-[11px] rounded px-2 py-1 focus:outline-none focus:border-blue-500/40"
                        />
                      </Td>
                      <Td className={`text-center font-semibold whitespace-nowrap ${overdueMark}`} title={r.pilihan_paket}>
                        {fmtDateShort(r.dl)}
                      </Td>
                      <Td className="text-center text-white font-semibold whitespace-nowrap">
                        {fmtDateShort(r.deadline_real)}
                      </Td>
                      <Td className="text-center">
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                          {r.stts}
                        </span>
                      </Td>
                      <Td className="text-center">
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={busyOrderId === r.order_id}
                          onChange={() => checkoff(r.order_id, r.cust || r.tim || `Order ${r.no_order}`)}
                          title="Centang untuk pindah ke History Finishing"
                          className="w-4 h-4 rounded border-white/20 bg-transparent accent-emerald-500 cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-white/[0.15] bg-white/[0.04]">
                  <td className="px-3 py-2 text-right text-[11px] font-bold text-slate-300 uppercase tracking-wider" colSpan={2}>
                    Total QTY
                  </td>
                  <td className="px-3 py-2 text-center text-sm font-bold text-white tabular-nums">{totalQty}</td>
                  <td colSpan={7}>&nbsp;</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-[10px] font-bold uppercase tracking-wider px-2 py-2 ${className}`}>{children}</th>
  );
}
function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-2 py-2 ${className}`} title={title}>{children}</td>;
}
