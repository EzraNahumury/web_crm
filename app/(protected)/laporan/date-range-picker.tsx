'use client';

const MONTHS_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

export function formatPeriod(from: string, to: string) {
  const f = parseDate(from);
  const t = parseDate(to);
  if (!f || !t) return '';
  return `${f.getDate()} ${MONTHS_ID[f.getMonth()]} ${f.getFullYear()} - ${t.getDate()} ${MONTHS_ID[t.getMonth()]} ${t.getFullYear()}`;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export function shiftDate(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function DateRangePicker({ from, to, onFromChange, onToChange }: {
  from: string; to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  function shiftBoth(days: number) {
    onFromChange(shiftDate(from, days));
    onToChange(shiftDate(to, days));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Prev */}
      <button onClick={() => shiftBoth(-1)}
        className="w-8 h-8 rounded-lg border border-white/10 grid place-items-center text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
      </button>

      {/* Dari */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">Dari:</span>
        <input type="date" value={from} onChange={e => onFromChange(e.target.value)}
          className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500/40 date-input" />
      </div>

      {/* Sampai */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">Sampai:</span>
        <input type="date" value={to} onChange={e => onToChange(e.target.value)}
          className="bg-[#0d1117] border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500/40 date-input" />
      </div>

      {/* Next */}
      <button onClick={() => shiftBoth(1)}
        className="w-8 h-8 rounded-lg border border-white/10 grid place-items-center text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
      </button>

      {/* Quick filters */}
      <div className="flex items-center gap-1 ml-2">
        {[
          { label: 'Hari Ini', fn: () => { onFromChange(today()); onToChange(today()); } },
          { label: '7 Hari', fn: () => { onFromChange(daysAgo(6)); onToChange(today()); } },
          { label: '30 Hari', fn: () => { onFromChange(daysAgo(29)); onToChange(today()); } },
        ].map(q => (
          <button key={q.label} onClick={q.fn}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors">
            {q.label}
          </button>
        ))}
      </div>

      {/* Export */}
      <button className="w-8 h-8 rounded-lg border border-white/10 grid place-items-center text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors ml-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
      </button>
    </div>
  );
}
