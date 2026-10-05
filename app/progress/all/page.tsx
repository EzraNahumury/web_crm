'use client';

// Papan gabungan /progress/all — SATU slideshow berisi SEMUA slide:
//   Papan  : Ringkasan (poin+SLA) · Rekap 7 Hari · Reject · Deadline · Lewat
//   Proses : Design · Proofing · Layouting · Printing · Press · Cutting ·
//            Sewing · Steam · Materi Finishing · Finishing · Shipment
// Bisa dipindah manual (tab / ‹ ›) atau otomatis tiap 20 detik. Slide "Papan"
// memakai body dari kit (data /api/public/progress); slide "Proses" memakai
// ProcessSection (data /api/public/pic?pic=all). Publik, tema terang.

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  useProgressFeed, KIT_STYLE, LoadingBody,
  PoinSlaBody, ReportTableBody, RejectBody, DeadlineBody, TelatBody,
  type Feed as BoardFeed,
} from '@/components/progress/kit';
import { ProcessSection, type Feed as PicFeed } from '@/components/progress/PicVisual';

const SLIDE_MS = 20_000; // auto-ganti slide tiap 20 detik
const PIC_POLL_MS = 30_000;
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Slide "Papan" (urut sesuai board /progress/harian).
const BOARD: { label: string; Body: ComponentType<{ feed: BoardFeed }> }[] = [
  { label: 'Ringkasan', Body: PoinSlaBody },
  { label: 'Rekap 7 Hari', Body: ReportTableBody },
  { label: 'Reject', Body: RejectBody },
  { label: 'Deadline', Body: DeadlineBody },
  { label: 'Lewat', Body: TelatBody },
];

function pill(active: boolean): string {
  return `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${active
    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
    : 'bg-white text-slate-500 border-slate-300 hover:text-slate-800 hover:border-slate-400'}`;
}

export default function ProgressAllPage() {
  const { feed: board, now, live, secsAgo } = useProgressFeed();
  const [pic, setPic] = useState<PicFeed | null>(null);
  const [idx, setIdx] = useState(0);

  const loadPic = useCallback(async () => {
    try {
      const res = await fetch('/api/public/pic?pic=all', { cache: 'no-store' });
      const j = await res.json();
      if (j && j.success) setPic(j as PicFeed);
    } catch { /* biarkan slide proses menampilkan "memuat" */ }
  }, []);
  useEffect(() => { loadPic(); const t = setInterval(loadPic, PIC_POLL_MS); return () => clearInterval(t); }, [loadPic]);

  const procs = pic?.processes || [];
  const total = BOARD.length + procs.length;

  // Jaga indeks valid + auto-advance (reset tiap kali idx berubah).
  useEffect(() => { if (idx >= total && total > 0) setIdx(0); }, [total, idx]);
  useEffect(() => {
    if (total <= 1) return;
    const t = setTimeout(() => setIdx(i => (i + 1) % total), SLIDE_MS);
    return () => clearTimeout(t);
  }, [total, idx]);
  const go = useCallback((n: number) => { if (total > 0) setIdx(((n % total) + total) % total); }, [total]);

  const isBoard = idx < BOARD.length;
  const boardSlide = isBoard ? BOARD[idx] : null;
  const proc = !isBoard ? procs[idx - BOARD.length] : null;

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MON_SHORT[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="fixed inset-0 flex flex-col text-slate-800 select-none" style={{ background: isBoard ? '#ffffff' : '#f1f5f9' }}>
      <style>{KIT_STYLE}</style>

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 sm:px-10 pt-4 pb-2">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/new%20logo.png" alt="AYRES" className="h-9 w-auto object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div className="leading-none">
            <div className="font-black tracking-[0.18em] text-indigo-600 text-xl">AYRES</div>
            <div className="tracking-[0.32em] text-slate-400 font-semibold mt-1 text-[10px]">PRODUCTION LIVE</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
            <span className="rounded-full" style={{ width: 8, height: 8, background: live ? '#10b981' : '#f43f5e' }} />
            <span className={`font-black tracking-widest text-xs ${live ? 'text-emerald-600' : 'text-rose-500'}`}>{live ? 'LIVE' : 'OFFLINE'}</span>
            <span className="text-slate-400 tabular-nums font-semibold text-xs">{secsAgo === null ? '—' : `${secsAgo}s`}</span>
          </div>
          <div className="text-right leading-none">
            <div className="font-black text-slate-900 tabular-nums text-2xl sm:text-3xl">{clock}</div>
            <div className="text-slate-500 font-semibold mt-1 text-xs">{dateLabel}</div>
          </div>
        </div>
      </header>

      {/* Tab bar gabungan (Papan + Proses) */}
      <div className="shrink-0 px-6 sm:px-10 pb-2">
        <div className="flex items-center gap-2">
          <button onClick={() => go(idx - 1)} aria-label="Slide sebelumnya" className="shrink-0 w-9 h-9 grid place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-400 font-bold">‹</button>
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {BOARD.map((s, i) => (
              <button key={`b-${i}`} onClick={() => go(i)} className={pill(i === idx)}>{s.label}</button>
            ))}
            {procs.length > 0 && <span className="mx-1 w-px h-5 bg-slate-300 shrink-0" />}
            {procs.map((p, i) => {
              const gi = BOARD.length + i;
              return <button key={p.key} onClick={() => go(gi)} className={pill(gi === idx)}>{p.label}</button>;
            })}
          </div>
          <button onClick={() => go(idx + 1)} aria-label="Slide berikutnya" className="shrink-0 w-9 h-9 grid place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-400 font-bold">›</button>
          <span className="shrink-0 flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1.5">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Auto · 20s</span>
            <span className="text-xs font-bold text-slate-500 tabular-nums">{Math.min(idx + 1, total)}/{total}</span>
          </span>
        </div>
      </div>

      {/* Konten slide aktif */}
      <main className={`flex-1 min-h-0 mx-4 sm:mx-6 mb-4 ${isBoard ? 'overflow-hidden rounded-2xl border border-slate-200 bg-white/70 tv-card' : 'overflow-y-auto'}`}>
        {isBoard ? (
          board ? (
            <div key={idx} className="tv-fade h-full">{boardSlide && <boardSlide.Body feed={board} />}</div>
          ) : <LoadingBody />
        ) : (
          proc && pic ? (
            <div key={idx} className="tv-fade px-1 sm:px-2 py-1">
              <ProcessSection proc={proc} month={pic.month} monthLabel={pic.monthLabel} prevMonthLabel={pic.prevMonthLabel} />
            </div>
          ) : <div className="py-24 text-center text-slate-400 font-semibold">Memuat data…</div>
        )}
      </main>
    </div>
  );
}
