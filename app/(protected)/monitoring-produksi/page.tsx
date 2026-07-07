'use client';
import { useEffect, useMemo, useState } from 'react';
import { dbGet, dbCreate, dbUpdate } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

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
function nextBoard(cur: string): string {
  const i = BOARD_SEQ.indexOf(cur as BoardKey);
  if (i < 0 || i >= BOARD_SEQ.length - 1) return 'history';
  return BOARD_SEQ[i + 1];
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
function nowSql() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function MonitoringProduksiPage() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
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
          return {
            mpId: m.id,
            orderId: m.order_id,
            board: m.board as BoardKey,
            keterangan: m.keterangan || 'Belum ACC',
            tim: o.nama_tim || '',
            customer: o.customer_nama || '',
            qty: qtyByOrder[String(m.order_id)] || 0,
            paket: (paketByOrder[String(m.order_id)] || []).join(', ') || '-',
          };
        });
      setRows(enriched);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const byBoard = useMemo(() => {
    const map: Record<BoardKey, Row[]> = { proofing: [], perbanyak: [], 'print-fedar': [], 'print-grando': [] };
    for (const r of rows) if (map[r.board as BoardKey]) map[r.board as BoardKey].push(r);
    return map;
  }, [rows]);

  async function advance(row: Row) {
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
            Papan monitoring 4 tahap. Flow: Proofing → Perbanyak → Print Fedar → Print Grando.
          </p>
        </div>

        {/* Shared date picker */}
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-slate-500 uppercase tracking-wider">Tanggal</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500/40 date-input"
          />
          <button
            onClick={() => setSelectedDate(todayIso())}
            className="text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg border border-white/10 hover:bg-white/[0.04] transition-colors"
          >
            Hari Ini
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
              dateLabel={formatDateLabel(selectedDate)}
              rows={byBoard[board.key]}
              loading={loading}
              busyId={busyId}
              onAdvance={advance}
              onKeterangan={changeKeterangan}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

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
  // Pad with empty rows so the board keeps its grid structure when near-empty.
  const padCount = Math.max(0, 8 - rows.length);

  return (
    <div className="w-[520px] shrink-0 rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden flex flex-col">
      {/* Colored title bar */}
      <div className={`${board.headerBg} ${board.headerText} px-4 py-2.5 text-center`}>
        <h2 className="text-sm font-bold tracking-wide">{board.title}</h2>
      </div>

      {/* Date bar */}
      <div className="px-4 py-2 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
        <p className="text-xs font-semibold text-white">{dateLabel}</p>
        <p className="text-[10px] text-slate-500 italic">{board.nextBoardHint}</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-white/[0.1] bg-white/[0.02]">
              <Th className="w-[36%]">TIM / CUSTOMER</Th>
              <Th className="w-[10%] text-center">QTY</Th>
              <Th className="w-[18%] text-center">PAKET</Th>
              <Th className="w-[12%] text-center">CECKLIST</Th>
              {isProofing && <Th>KETERANGAN</Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td className="text-center text-slate-500" colSpan={colCount}>Memuat…</Td></tr>
            ) : (
              <>
                {rows.map(row => (
                  <tr key={row.mpId} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <Td className="text-slate-200">
                      <span className="font-medium">{row.tim || row.customer || '-'}</span>
                      {row.tim && row.customer && (
                        <span className="block text-[10px] text-slate-500">{row.customer}</span>
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
                ))}
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
