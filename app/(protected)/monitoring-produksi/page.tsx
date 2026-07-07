'use client';

type BoardKey = 'proofing' | 'perbanyak' | 'print-fedar' | 'print-grando';

type Board = {
  key: BoardKey;
  title: string;
  // Header color scheme — matches the reference Excel: orange for proofing,
  // magenta for perbanyak, purple for print fedar & grando.
  headerBg: string;
  headerText: string;
};

const BOARDS: Board[] = [
  { key: 'proofing',      title: 'PROOFING',                headerBg: 'bg-orange-500',  headerText: 'text-white' },
  { key: 'perbanyak',     title: 'MONITORING PERBANYAK',    headerBg: 'bg-pink-600',    headerText: 'text-white' },
  { key: 'print-fedar',   title: 'MONITORING PRINT FEDAR',  headerBg: 'bg-purple-600',  headerText: 'text-white' },
  { key: 'print-grando',  title: 'MONITORING PRINT GRANDO', headerBg: 'bg-purple-800',  headerText: 'text-white' },
];

function todayLabel() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function MonitoringProduksiPage() {
  const dateLabel = todayLabel();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Monitoring Produksi</h1>
        <p className="text-sm text-slate-400 mt-1">
          Papan monitoring 4 tahap produksi: Proofing, Perbanyak, Print Fedar, dan Print Grando.
        </p>
      </div>

      {/* Horizontal scroll container for the 4 boards */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {BOARDS.map(board => (
            <BoardCard key={board.key} board={board} dateLabel={dateLabel} />
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
      <div className="px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
        <p className="text-xs font-semibold text-white">{dateLabel}</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-white/[0.1] bg-white/[0.02]">
              <Th className="w-[40%]">TIM / CUSTOMER</Th>
              <Th className="w-[10%] text-center">QTY</Th>
              <Th className="w-[15%] text-center">PAKET</Th>
              <Th className="w-[10%] text-center">CECKLIST</Th>
              <Th>KETERANGAN</Th>
            </tr>
          </thead>
          <tbody>
            {/* Empty rows — 12 placeholder rows so the table has visible
                structure before real data is wired in. */}
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
