'use client';
import { useState } from 'react';

type BoardKey = 'proofing' | 'perbanyak' | 'print-fedar' | 'print-grando';

type Board = {
  key: BoardKey;
  title: string;
  // Header color scheme — matches the reference Excel: orange for proofing,
  // magenta for perbanyak, purple for print fedar & grando.
  headerBg: string;
  headerText: string;
  // Description of what happens when a row is ACC-ed on this board.
  // Later this drives the "move to next board" behavior.
  nextBoardHint: string;
};

// Left-to-right flow: proofing → perbanyak → print-fedar → print-grando.
// ACC on the last board = finished.
const BOARDS: Board[] = [
  { key: 'proofing',      title: 'PROOFING',                headerBg: 'bg-orange-500',  headerText: 'text-white', nextBoardHint: 'ACC → pindah ke Monitoring Perbanyak' },
  { key: 'perbanyak',     title: 'MONITORING PERBANYAK',    headerBg: 'bg-pink-600',    headerText: 'text-white', nextBoardHint: 'ACC → pindah ke Monitoring Print Fedar' },
  { key: 'print-fedar',   title: 'MONITORING PRINT FEDAR',  headerBg: 'bg-purple-600',  headerText: 'text-white', nextBoardHint: 'ACC → pindah ke Monitoring Print Grando' },
  { key: 'print-grando',  title: 'MONITORING PRINT GRANDO', headerBg: 'bg-purple-800',  headerText: 'text-white', nextBoardHint: 'ACC → selesai (tahap terakhir)' },
];

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateLabel(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function MonitoringProduksiPage() {
  const [selectedDate, setSelectedDate] = useState(todayIso());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Monitoring Produksi</h1>
          <p className="text-sm text-slate-400 mt-1">
            Papan monitoring 4 tahap produksi. Flow: Proofing → Perbanyak → Print Fedar → Print Grando.
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

      {/* Info flow — remove after data wiring is done */}
      <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/20 p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-xs text-blue-300 leading-relaxed">
          Kolom <strong>Keterangan</strong> akan diganti menjadi tombol <strong>ACC</strong> saat data mulai masuk.
          Klik ACC di tabel manapun akan memindahkan baris tersebut ke tabel berikutnya secara berurutan.
          Board terakhir (Print Grando) = selesai.
        </p>
      </div>

      {/* Horizontal scroll container for the 4 boards */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {BOARDS.map(board => (
            <BoardCard key={board.key} board={board} dateLabel={formatDateLabel(selectedDate)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BoardCard({ board, dateLabel }: { board: Board; dateLabel: string }) {
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
              <Th className="w-[38%]">TIM / CUSTOMER</Th>
              <Th className="w-[10%] text-center">QTY</Th>
              <Th className="w-[16%] text-center">PAKET</Th>
              <Th className="w-[10%] text-center">CECKLIST</Th>
              <Th>KETERANGAN</Th>
            </tr>
          </thead>
          <tbody>
            {/* Empty rows — 12 placeholder rows so the table has visible
                structure before real data is wired in. When data comes in,
                the KETERANGAN cell will render an ACC button; clicking it
                triggers move-to-next-board. */}
            {Array.from({ length: 12 }).map((_, i) => (
              <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <Td className="text-slate-500">&nbsp;</Td>
                <Td className="text-center text-slate-500">&nbsp;</Td>
                <Td className="text-center text-slate-500">&nbsp;</Td>
                <Td className="text-center text-slate-500">&nbsp;</Td>
                <Td className="text-slate-500">&nbsp;</Td>
              </tr>
            ))}
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

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-2 border-r border-white/[0.04] last:border-r-0 text-slate-300 ${className}`}>
      {children}
    </td>
  );
}
