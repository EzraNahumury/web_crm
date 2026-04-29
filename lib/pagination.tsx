'use client';

export const DEFAULT_PAGE_SIZE = 10;

/**
 * Slice array for current page. Always returns a safe page (clamped to total pages).
 * Returns the slice + meta { current, total, count, from, to }.
 */
export function paginate<T>(rows: T[], page: number, pageSize: number = DEFAULT_PAGE_SIZE) {
  const count = rows.length;
  const total = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(Math.max(1, page), total);
  const from = (current - 1) * pageSize + (count > 0 ? 1 : 0);
  const to = Math.min(current * pageSize, count);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);
  return { slice, current, total, count, from, to };
}

type PaginationProps = {
  current: number;
  total: number;
  count: number;
  pageSize?: number;
  onChange: (page: number) => void;
};

export function Pagination({ current, total, count, pageSize = DEFAULT_PAGE_SIZE, onChange }: PaginationProps) {
  if (count <= pageSize) return null;
  const startIdx = (current - 1) * pageSize + 1;
  const endIdx = Math.min(current * pageSize, count);
  const btn = 'inline-flex items-center justify-center w-8 h-8 text-xs font-medium rounded-lg transition-colors';

  // Compact page numbers if too many pages
  const pageNums: (number | 'ellipsis')[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pageNums.push(i);
  } else {
    pageNums.push(1);
    if (current > 3) pageNums.push('ellipsis');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pageNums.push(i);
    if (current < total - 2) pageNums.push('ellipsis');
    pageNums.push(total);
  }

  return (
    <div className="px-6 py-3 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
      <span className="text-xs text-slate-500">Menampilkan {startIdx}–{endIdx} dari {count}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, current - 1))}
          disabled={current === 1}
          className={`${btn} text-slate-400 border border-white/10 hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label="Halaman sebelumnya"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        {pageNums.map((p, i) => p === 'ellipsis' ? (
          <span key={`e-${i}`} className="px-1 text-xs text-slate-500">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`${btn} ${p === current ? 'bg-blue-600 text-white' : 'text-slate-400 border border-white/10 hover:bg-white/[0.04]'}`}
          >{p}</button>
        ))}
        <button
          onClick={() => onChange(Math.min(total, current + 1))}
          disabled={current === total}
          className={`${btn} text-slate-400 border border-white/10 hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label="Halaman berikutnya"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>
    </div>
  );
}
