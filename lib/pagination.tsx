'use client';
import { useEffect, useRef, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100, 250];

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
  // Kalau di-set, tampilkan dropdown 'Rows' di pojok kanan. Callback ini
  // yang harus reset page ke 1 dan update state pageSize di caller.
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
};

export function Pagination({
  current, total, count, pageSize = DEFAULT_PAGE_SIZE, onChange,
  onPageSizeChange, pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  // Kalau tidak butuh pagination sama sekali (semua row muat di 1 halaman)
  // DAN tidak ada onPageSizeChange, skip render. Kalau ada selector, tetap
  // render supaya user bisa ubah page size.
  if (count <= pageSize && !onPageSizeChange) return null;

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
      <span className="text-xs text-slate-500">
        {count > 0 ? `Menampilkan ${startIdx}–${endIdx} dari ${count}` : 'Tidak ada data'}
      </span>
      <div className="flex items-center gap-3">
        {total > 1 && (
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
        )}
        {onPageSizeChange && (
          <PageSizeSelector value={pageSize} options={pageSizeOptions} onChange={onPageSizeChange} />
        )}
      </div>
    </div>
  );
}

function PageSizeSelector({ value, options, onChange }: {
  value: number; options: number[]; onChange: (size: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  return (
    <div ref={wrapRef} className="relative flex items-center gap-2">
      <span className="text-xs text-slate-500">Rows</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#0d1117] text-xs text-slate-300 hover:bg-white/[0.04] transition-colors tabular-nums"
      >
        <span>{value}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 bottom-full right-0 mb-1 w-24 bg-[#0d1117] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs tabular-nums flex items-center justify-between transition-colors ${opt === value ? 'bg-blue-600/20 text-blue-300' : 'text-slate-300 hover:bg-white/[0.04]'}`}
            >
              <span>{opt}</span>
              {opt === value && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
