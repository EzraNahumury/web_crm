'use client';

// ═══════════════════════════════════════════════════════════════════════
// Papan Progress AYRES — tampilan TV publik (tanpa login) di /progress.
// Auto-rotate 5 papan, polling data tiap 20 dtk dari /api/public/progress.
// Didesain untuk layar besar (16:9) dilihat dari jauh: font besar, kontras
// tinggi, satu aksen hangat (amber), status emerald/amber/rose.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types (mirror /api/public/progress) ────────────────────────────────
interface ProcPoin { key: string; label: string; todayPoin: number; todayPcs: number; todayOrders: number; monthPoin: number; pct: number; }
interface UpcomingGroup { date: string; count: number; qty: number; orders: { cust: string; qty: number; paket: string; noOrder: string }[]; }
interface OverdueItem { cust: string; noOrder: string; deadline: string; qty: number; paket: string; daysLate: number; }
interface H3Item { cust: string; noOrder: string; deadline: string; qty: number; paket: string; daysLeft: number; }
interface RejectItem { cust: string; proses: string; reason: string; at: string; }
interface DesignItem { cust: string; stage: string; target: string; status: string; }
interface Feed {
  success: boolean;
  generatedAt: string;
  today: string;
  poin: { target: number; processes: ProcPoin[]; totalTodayPoin: number };
  deadline: { upcoming: UpcomingGroup[] };
  urgent: { overdue: OverdueItem[]; h3: H3Item[] };
  reject: { total: number; byProcess: { proses: string; count: number }[]; items: RejectItem[] };
  sla: { design: { counts: { aman: number; warning: number; terlambat: number }; stages: { stage: string; count: number }[]; items: DesignItem[] } };
}

const POLL_MS = 20_000;
const ROTATE_MS = 15_000;

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function fmtPoin(n: number): string {
  const v = Math.round((n || 0) * 10) / 10;
  return v.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}
function fmtNum(n: number): string { return (Math.round(n || 0)).toLocaleString('id-ID'); }
function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}
function dowOf(iso: string): number {
  const p = parseISO(iso); if (!p) return 0;
  return new Date(p.y, p.m - 1, p.d).getDay();
}
function fmtTanggalFull(iso: string): string {
  const p = parseISO(iso); if (!p) return '-';
  return `${DAY_NAMES[dowOf(iso)]}, ${p.d} ${MON_SHORT[p.m - 1]}`;
}
function fmtTanggalShort(iso: string): string {
  const p = parseISO(iso); if (!p) return '-';
  return `${p.d} ${MON_SHORT[p.m - 1]}`;
}

const BOARDS = ['poin', 'deadline', 'urgent', 'reject', 'sla'] as const;
type Board = typeof BOARDS[number];
const BOARD_META: Record<Board, { title: string; sub: string }> = {
  poin: { title: 'HASIL KERJA HARIAN', sub: 'Poin per proses · hari ini' },
  deadline: { title: 'DEADLINE PER TANGGAL', sub: 'Hasil closingan CS Order' },
  urgent: { title: 'LEWAT DEADLINE & H-3', sub: 'Perlu tindakan segera' },
  reject: { title: 'REJECT CUSTOMER', sub: 'Dipisah per proses' },
  sla: { title: 'SLA DESIGN', sub: 'Target hari kerja per tahap' },
};

export default function ProgressTVPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState(false);
  const [lastOk, setLastOk] = useState<number>(0);
  const [boardIdx, setBoardIdx] = useState(0);
  const [now, setNow] = useState<Date>(new Date());
  const [rotToken, setRotToken] = useState(0); // reset progress bar animation
  const feedRef = useRef<Feed | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/public/progress', { cache: 'no-store' });
      const json = await res.json();
      if (json && json.success) {
        setFeed(json as Feed);
        feedRef.current = json as Feed;
        setLastOk(Date.now());
        setErr(false);
      } else { setErr(true); }
    } catch { setErr(true); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const t = setInterval(() => { setBoardIdx(i => (i + 1) % BOARDS.length); setRotToken(x => x + 1); }, ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  const board = BOARDS[boardIdx];
  const meta = BOARD_META[board];

  const clock = useMemo(() => {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return { hh, mm, ss };
  }, [now]);
  const dateLabel = useMemo(() => {
    return `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MON_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  }, [now]);

  const secsAgo = lastOk ? Math.max(0, Math.round((Date.now() - lastOk) / 1000)) : null;
  const live = !err && secsAgo !== null && secsAgo < POLL_MS / 1000 + 12;

  // Marquee: gabungan item paling urgent.
  const marquee = useMemo(() => {
    if (!feed) return 'Menyiapkan papan progress AYRES…';
    const parts: string[] = [];
    for (const o of feed.urgent.overdue.slice(0, 8)) parts.push(`⚠ LEWAT DEADLINE — ${o.cust} (+${o.daysLate} hari, ${fmtNum(o.qty)} pcs)`);
    for (const h of feed.urgent.h3.slice(0, 8)) parts.push(`⏰ ${h.daysLeft === 0 ? 'JATUH TEMPO HARI INI' : `H-${h.daysLeft}`} — ${h.cust} (${fmtTanggalShort(h.deadline)})`);
    if (parts.length === 0) parts.push('✓ Semua order dalam kendali — tidak ada yang lewat deadline. Kerja bagus, tim AYRES!');
    return parts.join('        •        ');
  }, [feed]);

  return (
    <div className="tvroot fixed inset-0 overflow-hidden text-slate-100 select-none"
      style={{ background: 'radial-gradient(1200px 700px at 15% -10%, #10192e 0%, #070a12 55%, #05070d 100%)' }}>
      <style>{`
        @keyframes tvmarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes tvpulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes tvbar { 0% { width: 0%; } 100% { width: 100%; } }
        @keyframes tvfade { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
        .tv-fade { animation: tvfade .5s cubic-bezier(.22,.61,.36,1) both; }
        .tv-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-[2.2vw] pt-[2vh] pb-[1.4vh]">
        <div className="flex items-center gap-[1.1vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/new%20logo.png" alt="AYRES" className="h-[4.6vh] w-auto object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div className="leading-none">
            <div className="font-black tracking-[0.2em] text-white" style={{ fontSize: 'clamp(20px,2.1vw,40px)' }}>AYRES</div>
            <div className="tracking-[0.42em] text-amber-400/90 font-semibold mt-[0.5vh]" style={{ fontSize: 'clamp(9px,0.8vw,15px)' }}>PRODUCTION LIVE</div>
          </div>
        </div>

        <div className="flex items-center gap-[2vw]">
          {/* Live indicator */}
          <div className="flex items-center gap-[0.5vw] rounded-full border border-white/10 bg-white/[0.03] px-[1vw] py-[0.7vh]">
            <span className="rounded-full" style={{ width: '0.7vw', height: '0.7vw', minWidth: 8, minHeight: 8, background: live ? '#34d399' : '#f43f5e', animation: 'tvpulse 1.6s ease-in-out infinite' }} />
            <span className="font-bold tracking-widest uppercase" style={{ fontSize: 'clamp(9px,0.72vw,13px)', color: live ? '#6ee7b7' : '#fca5a5' }}>
              {live ? 'LIVE' : 'OFFLINE'}
            </span>
            <span className="text-slate-500 tabular-nums" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>
              {secsAgo === null ? '—' : `${secsAgo}s`}
            </span>
          </div>
          {/* Clock */}
          <div className="text-right leading-none">
            <div className="font-bold text-white tabular-nums tracking-tight" style={{ fontSize: 'clamp(26px,2.9vw,58px)' }}>
              {clock.hh}<span className="text-amber-400">:</span>{clock.mm}
              <span className="text-slate-500 align-top ml-[0.3vw]" style={{ fontSize: 'clamp(12px,1.2vw,22px)' }}>{clock.ss}</span>
            </div>
            <div className="text-slate-400 font-medium mt-[0.6vh]" style={{ fontSize: 'clamp(10px,0.9vw,17px)' }}>{dateLabel}</div>
          </div>
        </div>
      </header>

      {/* ── Board title strip ──────────────────────────────────────── */}
      <div className="flex items-stretch mx-[2.2vw] rounded-t-2xl overflow-hidden border border-white/[0.07] border-b-0">
        <div className="flex items-center px-[1.6vw] bg-gradient-to-r from-amber-500 to-amber-600 text-[#1a1204]">
          <span className="font-black tabular-nums" style={{ fontSize: 'clamp(16px,1.5vw,30px)' }}>{String(boardIdx + 1).padStart(2, '0')}</span>
        </div>
        <div className="flex-1 flex items-center justify-between px-[1.6vw] py-[1.3vh] bg-white/[0.03] backdrop-blur">
          <div>
            <h1 className="font-black tracking-tight text-white leading-none" style={{ fontSize: 'clamp(20px,2vw,42px)' }}>{meta.title}</h1>
            <p className="text-slate-400 font-medium mt-[0.7vh]" style={{ fontSize: 'clamp(11px,0.92vw,18px)' }}>{meta.sub}</p>
          </div>
          {/* Board dots */}
          <div className="flex items-center gap-[0.6vw]">
            {BOARDS.map((b, i) => (
              <span key={b} className="rounded-full transition-all duration-500"
                style={{ width: i === boardIdx ? '2.2vw' : '0.7vw', height: '0.7vw', minHeight: 7, background: i === boardIdx ? '#f59e0b' : 'rgba(255,255,255,0.18)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Rotation progress bar ──────────────────────────────────── */}
      <div className="mx-[2.2vw] h-[0.4vh] min-h-[3px] bg-white/[0.05] border-x border-white/[0.07] overflow-hidden">
        <div key={rotToken} className="h-full bg-gradient-to-r from-amber-500/70 to-amber-400"
          style={{ animation: `tvbar ${ROTATE_MS}ms linear both` }} />
      </div>

      {/* ── Board body ─────────────────────────────────────────────── */}
      <main className="mx-[2.2vw] rounded-b-2xl border border-white/[0.07] border-t-0 bg-[#0a0e18]/70 overflow-hidden"
        style={{ height: 'calc(100vh - 22.5vh)' }}>
        {!feed ? (
          <div className="h-full grid place-items-center text-slate-500" style={{ fontSize: 'clamp(14px,1.2vw,22px)' }}>
            Menyiapkan papan progress…
          </div>
        ) : (
          <div key={board} className="tv-fade h-full">
            {board === 'poin' && <BoardPoin feed={feed} />}
            {board === 'deadline' && <BoardDeadline feed={feed} />}
            {board === 'urgent' && <BoardUrgent feed={feed} />}
            {board === 'reject' && <BoardReject feed={feed} />}
            {board === 'sla' && <BoardSla feed={feed} />}
          </div>
        )}
      </main>

      {/* ── Bottom marquee ticker ──────────────────────────────────── */}
      <footer className="absolute bottom-0 inset-x-0 h-[6vh] min-h-[42px] flex items-center border-t border-white/[0.07] bg-[#080b13] overflow-hidden">
        <div className="shrink-0 h-full flex items-center px-[1.6vw] bg-rose-600/90 text-white font-black tracking-widest"
          style={{ fontSize: 'clamp(11px,0.95vw,18px)' }}>
          INFO
        </div>
        <div className="relative flex-1 overflow-hidden whitespace-nowrap">
          <div className="inline-block" style={{ animation: 'tvmarquee 42s linear infinite' }}>
            <span className="text-slate-200 font-semibold px-[2vw]" style={{ fontSize: 'clamp(13px,1.15vw,22px)' }}>{marquee}</span>
            <span className="text-slate-200 font-semibold px-[2vw]" style={{ fontSize: 'clamp(13px,1.15vw,22px)' }}>{marquee}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ══════════════════════════ BOARD 1 · POIN ════════════════════════════
const PROC_ACCENT: Record<string, { bar: string; glow: string; text: string }> = {
  printing: { bar: 'from-sky-500 to-sky-400', glow: '#38bdf8', text: 'text-sky-300' },
  press: { bar: 'from-fuchsia-500 to-fuchsia-400', glow: '#e879f9', text: 'text-fuchsia-300' },
  cutting: { bar: 'from-orange-500 to-orange-400', glow: '#fb923c', text: 'text-orange-300' },
  jahit: { bar: 'from-emerald-500 to-emerald-400', glow: '#34d399', text: 'text-emerald-300' },
  shipment: { bar: 'from-teal-500 to-teal-400', glow: '#2dd4bf', text: 'text-teal-300' },
};
function BoardPoin({ feed }: { feed: Feed }) {
  const { processes, target, totalTodayPoin } = feed.poin;
  return (
    <div className="h-full flex flex-col p-[1.6vw]">
      <div className="flex-1 grid grid-cols-5 gap-[1.1vw]">
        {processes.map(p => {
          const a = PROC_ACCENT[p.key] || PROC_ACCENT.printing;
          const reached = p.todayPoin >= target;
          return (
            <div key={p.key} className="relative flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-[1.2vw] overflow-hidden">
              <div aria-hidden className="absolute -top-[6vh] -right-[3vw] rounded-full blur-3xl opacity-25"
                style={{ width: '10vw', height: '10vw', background: a.glow }} />
              <div className="flex items-center justify-between">
                <span className={`font-black tracking-wide uppercase ${a.text}`} style={{ fontSize: 'clamp(13px,1.1vw,22px)' }}>{p.label}</span>
                {reached && <span className="rounded-md bg-emerald-500/15 text-emerald-300 font-bold px-[0.5vw] py-[0.3vh]" style={{ fontSize: 'clamp(8px,0.65vw,12px)' }}>TARGET ✓</span>}
              </div>

              <div className="mt-auto">
                <div className="flex items-end gap-[0.4vw] leading-none">
                  <span className="font-black text-white tabular-nums" style={{ fontSize: 'clamp(34px,3.6vw,76px)' }}>{fmtPoin(p.todayPoin)}</span>
                  <span className="text-slate-500 font-bold mb-[0.6vh]" style={{ fontSize: 'clamp(11px,0.9vw,17px)' }}>poin</span>
                </div>
                {/* progress */}
                <div className="mt-[1vh] h-[1vh] min-h-[7px] rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${a.bar} transition-all duration-700`} style={{ width: `${p.pct}%` }} />
                </div>
                <div className="flex items-center justify-between mt-[0.9vh] text-slate-400" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>
                  <span className="tabular-nums font-semibold">{p.pct}% <span className="text-slate-600">/ {target}</span></span>
                  <span className="tabular-nums">{fmtNum(p.todayPcs)} pcs · {fmtNum(p.todayOrders)} order</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Total footer */}
      <div className="mt-[1.2vw] flex items-center justify-between rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-[1.6vw] py-[1.4vh]">
        <span className="font-bold tracking-wide text-amber-200 uppercase" style={{ fontSize: 'clamp(12px,1vw,20px)' }}>Total Poin Hari Ini</span>
        <div className="flex items-baseline gap-[0.5vw]">
          <span className="font-black text-white tabular-nums" style={{ fontSize: 'clamp(28px,2.6vw,56px)' }}>{fmtPoin(totalTodayPoin)}</span>
          <span className="text-slate-400 font-bold" style={{ fontSize: 'clamp(12px,1vw,20px)' }}>poin · target {fmtNum(target * processes.length)}</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════ BOARD 2 · DEADLINE ════════════════════════
function BoardDeadline({ feed }: { feed: Feed }) {
  const groups = feed.deadline.upcoming.slice(0, 4);
  if (groups.length === 0) return <EmptyBoard icon="📅" text="Belum ada deadline dalam 21 hari ke depan." />;
  return (
    <div className="h-full grid gap-[1.1vw] p-[1.4vw]" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0,1fr))` }}>
      {groups.map(g => {
        const isToday = g.date === feed.today;
        return (
          <div key={g.date} className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <div className={`px-[1vw] py-[1.2vh] ${isToday ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white' : 'bg-gradient-to-r from-amber-500 to-amber-600 text-[#1a1204]'}`}>
              <div className="font-black leading-none" style={{ fontSize: 'clamp(16px,1.5vw,30px)' }}>{fmtTanggalFull(g.date)}</div>
              <div className="font-semibold mt-[0.6vh] opacity-90" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>
                {isToday ? 'HARI INI · ' : ''}{fmtNum(g.count)} order · {fmtNum(g.qty)} pcs
              </div>
            </div>
            <div className="flex-1 tv-scroll overflow-hidden divide-y divide-white/[0.05]">
              {g.orders.slice(0, 9).map((o, i) => (
                <div key={i} className="flex items-center justify-between px-[1vw] py-[1.05vh]">
                  <div className="min-w-0 flex items-center gap-[0.6vw]">
                    <span className="text-slate-600 tabular-nums font-bold shrink-0" style={{ fontSize: 'clamp(10px,0.8vw,15px)' }}>{i + 1}</span>
                    <span className="truncate font-semibold text-slate-100" style={{ fontSize: 'clamp(12px,1.02vw,20px)' }}>{o.cust}</span>
                  </div>
                  <span className="shrink-0 rounded-md bg-white/[0.06] text-slate-200 font-bold tabular-nums px-[0.6vw] py-[0.3vh] ml-[0.5vw]" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>{fmtNum(o.qty)}</span>
                </div>
              ))}
              {g.orders.length > 9 && (
                <div className="px-[1vw] py-[0.9vh] text-slate-500 font-semibold" style={{ fontSize: 'clamp(10px,0.8vw,14px)' }}>+{g.orders.length - 9} order lainnya…</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════ BOARD 3 · URGENT ══════════════════════════
function BoardUrgent({ feed }: { feed: Feed }) {
  const { overdue, h3 } = feed.urgent;
  return (
    <div className="h-full grid grid-cols-2 gap-[1.1vw] p-[1.4vw]">
      {/* Overdue */}
      <div className="flex flex-col rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] overflow-hidden">
        <div className="flex items-center justify-between px-[1.2vw] py-[1.2vh] bg-rose-600/90 text-white">
          <span className="font-black tracking-wide" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>LEWAT DEADLINE</span>
          <span className="font-black tabular-nums rounded-lg bg-white/15 px-[0.8vw] py-[0.3vh]" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>{overdue.length}</span>
        </div>
        {overdue.length === 0 ? (
          <div className="flex-1 grid place-items-center text-emerald-300/80 font-semibold" style={{ fontSize: 'clamp(13px,1.1vw,20px)' }}>✓ Tidak ada yang lewat deadline</div>
        ) : (
          <div className="flex-1 tv-scroll overflow-hidden divide-y divide-white/[0.05]">
            {overdue.slice(0, 8).map((o, i) => (
              <div key={i} className="flex items-center gap-[0.8vw] px-[1.2vw] py-[1.15vh]">
                <span className="shrink-0 rounded-lg bg-rose-500/20 text-rose-200 font-black tabular-nums px-[0.7vw] py-[0.4vh]" style={{ fontSize: 'clamp(12px,1vw,19px)' }}>+{o.daysLate}h</span>
                <span className="flex-1 truncate font-semibold text-slate-100" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{o.cust}</span>
                <span className="shrink-0 text-slate-400 tabular-nums" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{fmtTanggalShort(o.deadline)}</span>
                <span className="shrink-0 rounded-md bg-white/[0.06] text-slate-200 font-bold tabular-nums px-[0.6vw] py-[0.3vh]" style={{ fontSize: 'clamp(11px,0.88vw,16px)' }}>{fmtNum(o.qty)} pcs</span>
              </div>
            ))}
            {overdue.length > 8 && <div className="px-[1.2vw] py-[0.9vh] text-rose-300/80 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{overdue.length - 8} lagi…</div>}
          </div>
        )}
      </div>

      {/* H-3 */}
      <div className="flex flex-col rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] overflow-hidden">
        <div className="flex items-center justify-between px-[1.2vw] py-[1.2vh] bg-amber-500/90 text-[#1a1204]">
          <span className="font-black tracking-wide" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>H-3 SEBELUM DEADLINE</span>
          <span className="font-black tabular-nums rounded-lg bg-black/15 px-[0.8vw] py-[0.3vh]" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>{h3.length}</span>
        </div>
        {h3.length === 0 ? (
          <div className="flex-1 grid place-items-center text-slate-500 font-semibold" style={{ fontSize: 'clamp(13px,1.1vw,20px)' }}>Tidak ada yang mendekati deadline</div>
        ) : (
          <div className="flex-1 tv-scroll overflow-hidden divide-y divide-white/[0.05]">
            {h3.slice(0, 8).map((h, i) => (
              <div key={i} className="flex items-center gap-[0.8vw] px-[1.2vw] py-[1.15vh]">
                <span className="shrink-0 rounded-lg bg-amber-500/20 text-amber-200 font-black px-[0.7vw] py-[0.4vh]" style={{ fontSize: 'clamp(10px,0.85vw,16px)' }}>
                  {h.daysLeft === 0 ? 'HARI INI' : `${h.daysLeft} HARI`}
                </span>
                <span className="flex-1 truncate font-semibold text-slate-100" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{h.cust}</span>
                <span className="shrink-0 text-slate-400 tabular-nums" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{fmtTanggalShort(h.deadline)}</span>
                <span className="shrink-0 rounded-md bg-white/[0.06] text-slate-200 font-bold tabular-nums px-[0.6vw] py-[0.3vh]" style={{ fontSize: 'clamp(11px,0.88vw,16px)' }}>{fmtNum(h.qty)} pcs</span>
              </div>
            ))}
            {h3.length > 8 && <div className="px-[1.2vw] py-[0.9vh] text-amber-300/80 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{h3.length - 8} lagi…</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════ BOARD 4 · REJECT ══════════════════════════
function BoardReject({ feed }: { feed: Feed }) {
  const { total, byProcess, items } = feed.reject;
  if (total === 0) return <EmptyBoard icon="✓" text="Tidak ada order yang di-reject. Kualitas closing terjaga." />;
  return (
    <div className="h-full flex flex-col p-[1.4vw] gap-[1.1vw]">
      {/* Summary row */}
      <div className="flex items-stretch gap-[1.1vw]">
        <div className="flex flex-col justify-center rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] px-[1.6vw] py-[1.2vh]">
          <span className="text-rose-300 font-bold tracking-wide uppercase" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>Total Reject</span>
          <span className="font-black text-white tabular-nums leading-none mt-[0.5vh]" style={{ fontSize: 'clamp(30px,2.8vw,60px)' }}>{fmtNum(total)}</span>
        </div>
        <div className="flex-1 grid gap-[0.8vw]" style={{ gridTemplateColumns: `repeat(${Math.max(byProcess.length, 1)}, minmax(0,1fr))` }}>
          {byProcess.map(bp => (
            <div key={bp.proses} className="flex flex-col justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02] px-[1.2vw] py-[1.2vh]">
              <span className="text-slate-400 font-semibold uppercase tracking-wide" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>Proses {bp.proses}</span>
              <span className="font-black text-white tabular-nums leading-none mt-[0.5vh]" style={{ fontSize: 'clamp(24px,2.2vw,48px)' }}>{fmtNum(bp.count)}</span>
            </div>
          ))}
        </div>
      </div>
      {/* List */}
      <div className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.015] tv-scroll overflow-hidden divide-y divide-white/[0.05]">
        {items.slice(0, 8).map((r, i) => (
          <div key={i} className="flex items-center gap-[1vw] px-[1.4vw] py-[1.15vh]">
            <span className="text-slate-600 tabular-nums font-bold shrink-0 w-[1.6vw]" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{i + 1}</span>
            <span className="flex-1 truncate font-semibold text-slate-100" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{r.cust}</span>
            <span className="shrink-0 rounded-md bg-rose-500/15 text-rose-200 font-bold px-[0.7vw] py-[0.3vh]" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>{r.proses}</span>
            <span className="hidden xl:block max-w-[26vw] truncate text-slate-400 italic" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{r.reason || '—'}</span>
            <span className="shrink-0 text-slate-500 tabular-nums" style={{ fontSize: 'clamp(10px,0.85vw,15px)' }}>{fmtTanggalShort(r.at)}</span>
          </div>
        ))}
        {items.length > 8 && <div className="px-[1.4vw] py-[0.9vh] text-slate-500 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{items.length - 8} lainnya…</div>}
      </div>
    </div>
  );
}

// ══════════════════════════ BOARD 5 · SLA ═════════════════════════════
const SLA_STYLE: Record<string, { pill: string; label: string }> = {
  terlambat: { pill: 'bg-rose-500/20 text-rose-200', label: 'TERLAMBAT' },
  warning: { pill: 'bg-amber-500/20 text-amber-200', label: 'HARI-H' },
  aman: { pill: 'bg-emerald-500/15 text-emerald-200', label: 'AMAN' },
};
function BoardSla({ feed }: { feed: Feed }) {
  const { counts, stages, items } = feed.sla.design;
  const totalActive = counts.aman + counts.warning + counts.terlambat;
  if (totalActive === 0) return <EmptyBoard icon="🎨" text="Tidak ada order di antrian design saat ini." />;
  return (
    <div className="h-full flex flex-col p-[1.4vw] gap-[1.1vw]">
      {/* Status counts */}
      <div className="grid grid-cols-3 gap-[1.1vw]">
        <StatBig label="Aman" value={counts.aman} color="#34d399" ring="border-emerald-500/25 bg-emerald-500/[0.06]" />
        <StatBig label="Hari-H" value={counts.warning} color="#fbbf24" ring="border-amber-500/25 bg-amber-500/[0.06]" />
        <StatBig label="Terlambat" value={counts.terlambat} color="#fb5f6d" ring="border-rose-500/25 bg-rose-500/[0.06]" />
      </div>
      {/* Stage chips */}
      {stages.length > 0 && (
        <div className="flex flex-wrap gap-[0.7vw]">
          {stages.map(s => (
            <span key={s.stage} className="rounded-full border border-white/[0.08] bg-white/[0.03] text-slate-300 font-semibold px-[1vw] py-[0.6vh]" style={{ fontSize: 'clamp(11px,0.9vw,17px)' }}>
              {s.stage} <span className="text-white font-black tabular-nums ml-[0.3vw]">{fmtNum(s.count)}</span>
            </span>
          ))}
        </div>
      )}
      {/* List (terlambat dulu) */}
      <div className="flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.015] tv-scroll overflow-hidden divide-y divide-white/[0.05]">
        {items.slice(0, 7).map((it, i) => {
          const s = SLA_STYLE[it.status] || SLA_STYLE.aman;
          return (
            <div key={i} className="flex items-center gap-[1vw] px-[1.4vw] py-[1.1vh]">
              <span className="text-slate-600 tabular-nums font-bold shrink-0 w-[1.6vw]" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{i + 1}</span>
              <span className="flex-1 truncate font-semibold text-slate-100" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{it.cust}</span>
              <span className="shrink-0 rounded-md bg-white/[0.06] text-slate-300 font-semibold px-[0.7vw] py-[0.3vh]" style={{ fontSize: 'clamp(10px,0.85vw,16px)' }}>{it.stage}</span>
              <span className="shrink-0 text-slate-500 tabular-nums hidden xl:inline" style={{ fontSize: 'clamp(10px,0.85vw,15px)' }}>target {fmtTanggalShort(it.target)}</span>
              <span className={`shrink-0 rounded-md font-black px-[0.7vw] py-[0.3vh] ${s.pill}`} style={{ fontSize: 'clamp(9px,0.78vw,14px)' }}>{s.label}</span>
            </div>
          );
        })}
        {items.length > 7 && <div className="px-[1.4vw] py-[0.9vh] text-slate-500 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{items.length - 7} lainnya…</div>}
      </div>
    </div>
  );
}

function StatBig({ label, value, color, ring }: { label: string; value: number; color: string; ring: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border ${ring} py-[2vh]`}>
      <span className="font-black tabular-nums leading-none" style={{ fontSize: 'clamp(38px,4vw,86px)', color }}>{fmtNum(value)}</span>
      <span className="font-bold tracking-widest uppercase text-slate-300 mt-[1vh]" style={{ fontSize: 'clamp(11px,1vw,20px)' }}>{label}</span>
    </div>
  );
}

function EmptyBoard({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="h-full grid place-items-center p-[3vw]">
      <div className="text-center">
        <div style={{ fontSize: 'clamp(40px,5vw,110px)' }}>{icon}</div>
        <p className="text-slate-400 font-semibold mt-[1.5vh]" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>{text}</p>
      </div>
    </div>
  );
}
