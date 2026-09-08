'use client';

// ═══════════════════════════════════════════════════════════════════════
// Progress Report Kit — komponen bersama untuk 4 halaman report TV publik:
//   /progress/harian   (Hasil Kerja Harian + SLA)
//   /progress/reject    (Reject Produksi)
//   /progress/deadline  (Deadline per Tanggal — 7 hari ke depan)
//   /progress/telat     (Lewat Deadline & H-3)
// Tema terang (putih), tipografi besar untuk TV, angka CountUp, kartu
// spotlight, animated-list. Semua pure CSS/rAF. Data dari 1 endpoint
// /api/public/progress; tiap page render slice-nya sendiri.
// ═══════════════════════════════════════════════════════════════════════

import { ComponentType, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types (mirror /api/public/progress) ────────────────────────────────
export interface ProcPoin { key: string; label: string; todayPoin: number; todayPcs: number; todayOrders: number; monthPoin: number; pct: number; }
export interface UpcomingGroup { date: string; count: number; qty: number; orders: { cust: string; qty: number; paket: string; noOrder: string }[]; }
export interface OverdueItem { cust: string; noOrder: string; deadline: string; qty: number; daysLate: number; }
export interface H3Item { cust: string; noOrder: string; deadline: string; qty: number; daysLeft: number; }
export interface RejectItem { cust: string; proses: string; deadline: string; jumlah: number; at: string; status: string; }
export interface DesignItem { cust: string; stage: string; target: string; status: string; }
export interface PhaseItem { cust: string; deadline: string; jumlah: number; status: string; stage?: string; }
export interface SlaCounts { aman: number; warning: number; terlambat: number; }
export interface Feed {
  success: boolean; generatedAt: string; today: string;
  poin: { target: number; processes: ProcPoin[]; totalTodayPoin: number };
  deadline: { upcoming: UpcomingGroup[] };
  urgent: { overdue: OverdueItem[]; h3: H3Item[] };
  reject: { total: number; byProcess: { proses: string; count: number }[]; items: RejectItem[] };
  sla: {
    design: { counts: SlaCounts; items: DesignItem[] };
    proofing: { counts: SlaCounts; items: PhaseItem[] };
    perbanyak: { counts: SlaCounts; items: PhaseItem[] };
  };
}

const POLL_MS = 20_000;
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function fmtNum(n: number): string { return (Math.round(n || 0)).toLocaleString('id-ID'); }
function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}
function dowOf(iso: string): number { const p = parseISO(iso); if (!p) return 0; return new Date(p.y, p.m - 1, p.d).getDay(); }
export function fmtTanggalFull(iso: string): string { const p = parseISO(iso); if (!p) return '-'; return `${DAY_NAMES[dowOf(iso)]}, ${p.d} ${MON_SHORT[p.m - 1]}`; }
export function fmtTanggalShort(iso: string): string { const p = parseISO(iso); if (!p) return '-'; return `${DAY_SHORT[dowOf(iso)]} ${p.d} ${MON_SHORT[p.m - 1]}`; }

// ── CountUp (reactbits-style) ───────────────────────────────────────────
export function CountUp({ value, decimals = 0, className, style }: { value: number; decimals?: number; className?: string; style?: React.CSSProperties }) {
  const [disp, setDisp] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current, to = value || 0, dur = 950, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setDisp(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className} style={style}>{disp.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: decimals })}</span>;
}

// ── Report registry (nav + judul) ──────────────────────────────────────
export type ReportSlug = 'harian' | 'reject' | 'deadline' | 'telat';
export const REPORTS: { slug: ReportSlug; n: number; title: string; sub: string }[] = [
  { slug: 'harian', n: 2, title: 'Hasil Kerja Harian', sub: 'Poin per proses + SLA' },
  { slug: 'reject', n: 3, title: 'Reject Produksi', sub: 'Dipisah per proses' },
  { slug: 'deadline', n: 4, title: 'Deadline per Tanggal', sub: 'Closingan CS Order · 7 hari ke depan' },
  { slug: 'telat', n: 5, title: 'Lewat Deadline & H-3', sub: 'Perlu tindakan segera' },
];

// ── Data hook ───────────────────────────────────────────────────────────
export function useProgressFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState(false);
  const [lastOk, setLastOk] = useState(0);
  const [now, setNow] = useState<Date>(new Date());
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/public/progress', { cache: 'no-store' });
      const j = await res.json();
      if (j && j.success) { setFeed(j as Feed); setLastOk(Date.now()); setErr(false); } else setErr(true);
    } catch { setErr(true); }
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    if (sp.has('demo')) { setFeed(buildSample()); setLastOk(Date.now()); setErr(false); return; }
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  const secsAgo = lastOk ? Math.max(0, Math.round((Date.now() - lastOk) / 1000)) : null;
  const live = !err && secsAgo !== null && secsAgo < POLL_MS / 1000 + 12;
  return { feed, now, secsAgo, live };
}

const KIT_STYLE = `
  @keyframes tvpulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .3; transform: scale(.7); } }
  @keyframes tvfade { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: translateY(0); } }
  @keyframes tvitem { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
  @keyframes tvgrad { to { background-position: 300% 0; } }
  @keyframes tvshine { to { background-position: -200% 0; } }
  @keyframes tvdrift { 0% { background-position: 0 0; } 100% { background-position: 26px 26px; } }
  .tv-fade { animation: tvfade .55s cubic-bezier(.22,.61,.36,1) both; }
  .tv-item { animation: tvitem .5s cubic-bezier(.22,.61,.36,1) both; }
  .tv-scroll::-webkit-scrollbar { display: none; }
  .tv-grad { background: linear-gradient(90deg,#6366f1,#8b5cf6,#f59e0b,#6366f1); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: tvgrad 7s linear infinite; }
  .tv-shine { background: linear-gradient(110deg,#059669 42%,#a7f3d0 50%,#059669 58%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: tvshine 3.2s linear infinite; }
  .tv-card { box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.12); }
`;

// ── Shell dipakai semua page ────────────────────────────────────────────
export function ReportFrame({ slug, now, live, secsAgo, children }: {
  slug: ReportSlug; now: Date; live: boolean; secsAgo: number | null; children: ReactNode;
}) {
  const meta = REPORTS.find(r => r.slug === slug)!;
  const clock = useMemo(() => ({
    hh: String(now.getHours()).padStart(2, '0'), mm: String(now.getMinutes()).padStart(2, '0'), ss: String(now.getSeconds()).padStart(2, '0'),
  }), [now]);
  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MON_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  return (
    <div className="fixed inset-0 overflow-hidden text-slate-800 select-none" style={{ background: '#ffffff' }}>
      <style>{KIT_STYLE}</style>
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(15,23,42,0.055) 1px, transparent 1px)', backgroundSize: '26px 26px', animation: 'tvdrift 6s linear infinite' }} />
      <div aria-hidden className="absolute -top-[12vh] -left-[8vw] rounded-full pointer-events-none" style={{ width: '42vw', height: '42vw', background: 'radial-gradient(circle, rgba(99,102,241,0.10), transparent 70%)' }} />
      <div aria-hidden className="absolute -bottom-[16vh] -right-[6vw] rounded-full pointer-events-none" style={{ width: '38vw', height: '38vw', background: 'radial-gradient(circle, rgba(245,158,11,0.10), transparent 70%)' }} />

      {/* Top bar */}
      <header className="relative flex items-center justify-between px-[2.2vw] pt-[1.9vh] pb-[1.3vh]">
        <div className="flex items-center gap-[1.1vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/new%20logo.png" alt="AYRES" className="h-[4.4vh] w-auto object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div className="leading-none">
            <div className="tv-grad font-black tracking-[0.18em]" style={{ fontSize: 'clamp(20px,2.1vw,42px)' }}>AYRES</div>
            <div className="tracking-[0.42em] text-slate-400 font-semibold mt-[0.6vh]" style={{ fontSize: 'clamp(9px,0.8vw,15px)' }}>PRODUCTION LIVE</div>
          </div>
        </div>
        <div className="flex items-center gap-[1.8vw]">
          <div className="flex items-center gap-[0.55vw] rounded-full border border-slate-200 bg-white/80 tv-card px-[1vw] py-[0.7vh]">
            <span className="rounded-full" style={{ width: '0.7vw', height: '0.7vw', minWidth: 8, minHeight: 8, background: live ? '#10b981' : '#f43f5e', animation: 'tvpulse 1.6s ease-in-out infinite' }} />
            {live ? <span className="tv-shine font-black tracking-widest" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>LIVE</span> : <span className="text-rose-500 font-black tracking-widest" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>OFFLINE</span>}
            <span className="text-slate-400 tabular-nums font-semibold" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>{secsAgo === null ? '—' : `${secsAgo}s`}</span>
          </div>
          <div className="text-right leading-none">
            <div className="font-black text-slate-900 tabular-nums tracking-tight" style={{ fontSize: 'clamp(26px,2.9vw,58px)' }}>{clock.hh}<span className="text-indigo-500">:</span>{clock.mm}<span className="text-slate-400 align-top ml-[0.3vw]" style={{ fontSize: 'clamp(12px,1.2vw,22px)' }}>{clock.ss}</span></div>
            <div className="text-slate-500 font-semibold mt-[0.6vh]" style={{ fontSize: 'clamp(10px,0.9vw,17px)' }}>{dateLabel}</div>
          </div>
        </div>
      </header>

      {/* Title strip */}
      <div className="relative flex items-stretch mx-[2.2vw] rounded-t-2xl overflow-hidden border border-slate-200 border-b-0 bg-white tv-card">
        <div className="flex items-center px-[1.5vw] bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
          <span className="font-black tabular-nums" style={{ fontSize: 'clamp(16px,1.5vw,30px)' }}>{String(meta.n).padStart(2, '0')}</span>
        </div>
        <div className="flex-1 flex items-center justify-between px-[1.6vw] py-[1.25vh]">
          <div>
            <h1 className="font-black tracking-tight text-slate-900 leading-none" style={{ fontSize: 'clamp(20px,2vw,42px)' }}>{meta.title}</h1>
            <p className="text-slate-500 font-medium mt-[0.7vh]" style={{ fontSize: 'clamp(11px,0.92vw,18px)' }}>{meta.sub}</p>
          </div>
          {/* Nav antar report */}
          <nav className="flex items-center gap-[0.6vw]">
            {REPORTS.map(r => (
              <a key={r.slug} href={`/progress/${r.slug}`} className={`rounded-lg font-bold px-[0.9vw] py-[0.7vh] transition-colors ${r.slug === slug ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`} style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>{r.title.split(' ')[0]}</a>
            ))}
          </nav>
        </div>
      </div>

      {/* Body */}
      <main className="relative mx-[2.2vw] mb-[2vh] rounded-b-2xl border border-slate-200 border-t-0 bg-white/70 tv-card overflow-hidden" style={{ height: 'calc(100vh - 16.5vh)' }}>
        {children}
      </main>
    </div>
  );
}

export function LoadingBody() {
  return <div className="h-full grid place-items-center text-slate-400" style={{ fontSize: 'clamp(14px,1.2vw,22px)' }}>Menyiapkan data…</div>;
}
export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return <div className="h-full grid place-items-center p-[3vw]"><div className="text-center"><div style={{ fontSize: 'clamp(40px,5vw,110px)' }}>{icon}</div><p className="text-slate-400 font-bold mt-[1.5vh]" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>{text}</p></div></div>;
}

const STATUS_PILL: Record<string, string> = {
  terlambat: 'bg-rose-100 text-rose-700', warning: 'bg-amber-100 text-amber-700', aman: 'bg-emerald-100 text-emerald-700',
};
const STATUS_LABEL: Record<string, string> = { terlambat: 'TERLAMBAT', warning: 'HARI-H', aman: 'AMAN' };

// ══════════════════════ REPORT 2 · HARIAN (Poin + SLA) ═════════════════
// Icon per proses (inline SVG, currentColor — dipakai kecil di chip + besar
// sebagai watermark di header band).
const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function IconPrinter({ className }: { className?: string }) {
  return (<svg className={className} {...svgProps}><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="7" rx="1" /><path d="M17 12h.01" /></svg>);
}
function IconLayers({ className }: { className?: string }) {
  return (<svg className={className} {...svgProps}><path d="M12 2l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 17l9 5 9-5" /></svg>);
}
function IconScissors({ className }: { className?: string }) {
  return (<svg className={className} {...svgProps}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.12 15.88" /><path d="M14.47 14.48L20 20" /><path d="M8.12 8.12L12 12" /></svg>);
}
function IconSewing({ className }: { className?: string }) {
  return (<svg className={className} {...svgProps}><path d="M3 19h16" /><path d="M5 19V8h9a3 3 0 013 3v1" /><path d="M17 12v4l-1.5 2.5" /><circle cx="9" cy="12" r="1.5" /><path d="M3 19v2M19 19v2" /></svg>);
}
function IconBox({ className }: { className?: string }) {
  return (<svg className={className} {...svgProps}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12l8.73-5.04" /><path d="M12 22.08V12" /></svg>);
}

function IconSteam({ className }: { className?: string }) {
  return (<svg className={className} {...svgProps}><path d="M7 4c0 1.5-1.5 1.8-1.5 3.5S7 9 7 10.5" /><path d="M12 3c0 1.5-1.5 1.8-1.5 3.5S12 8 12 9.5" /><path d="M17 4c0 1.5-1.5 1.8-1.5 3.5S17 9 17 10.5" /><rect x="3" y="14" width="18" height="6" rx="2" /></svg>);
}
function IconFinishing({ className }: { className?: string }) {
  return (<svg className={className} {...svgProps}><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z" /><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z" /></svg>);
}

const PROC_META: Record<string, { sub: string; grad: string; bar: string; Icon: ComponentType<{ className?: string }> }> = {
  printing: { sub: 'Proses Cetak', grad: 'from-emerald-500 to-green-600', bar: 'from-emerald-400 to-green-500', Icon: IconPrinter },
  press: { sub: 'Proses Press', grad: 'from-violet-500 to-purple-600', bar: 'from-violet-400 to-purple-500', Icon: IconLayers },
  cutting: { sub: 'Proses Pemotongan', grad: 'from-orange-500 to-amber-600', bar: 'from-orange-400 to-amber-500', Icon: IconScissors },
  jahit: { sub: 'Proses Jahit', grad: 'from-blue-500 to-sky-600', bar: 'from-blue-400 to-sky-500', Icon: IconSewing },
  steam: { sub: 'Proses Steam', grad: 'from-rose-500 to-red-600', bar: 'from-rose-400 to-red-500', Icon: IconSteam },
  finishing: { sub: 'Proses Finishing', grad: 'from-indigo-500 to-violet-600', bar: 'from-indigo-400 to-violet-500', Icon: IconFinishing },
  shipment: { sub: 'Proses Pengiriman', grad: 'from-teal-500 to-cyan-600', bar: 'from-teal-400 to-cyan-500', Icon: IconBox },
};
export function PoinSlaBody({ feed }: { feed: Feed }) {
  const { processes, target } = feed.poin;
  const sla = feed.sla;
  const slaCard = (title: string, counts: SlaCounts, accent: string) => {
    const total = counts.aman + counts.warning + counts.terlambat;
    return (
      <div className={`tv-item flex flex-col rounded-2xl border ${accent} bg-white tv-card p-[1vw]`}>
        <div className="flex items-center justify-between">
          <span className="font-black text-slate-800 uppercase tracking-wide" style={{ fontSize: 'clamp(12px,1vw,20px)' }}>{title}</span>
          <span className="text-slate-400 font-bold tabular-nums" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>{fmtNum(total)} order</span>
        </div>
        <div className="mt-[1vh] grid grid-cols-3 gap-[0.5vw] text-center">
          {(['aman', 'warning', 'terlambat'] as const).map(k => (
            <div key={k} className={`rounded-lg py-[0.8vh] ${STATUS_PILL[k]}`}>
              <CountUp value={counts[k]} className="block font-black tabular-nums leading-none" style={{ fontSize: 'clamp(20px,1.9vw,40px)' }} />
              <span className="font-bold uppercase tracking-wide" style={{ fontSize: 'clamp(8px,0.66vw,12px)' }}>{STATUS_LABEL[k]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="h-full flex flex-col p-[1.2vw] gap-[1vw]">
      {/* Poin harian */}
      <div className="grid grid-cols-7 gap-[0.7vw]" style={{ flex: '1 1 0' }}>
        {processes.map((p, idx) => {
          const m = PROC_META[p.key] || PROC_META.printing;
          const reached = p.todayPoin >= target;
          return (
            <div key={p.key} className="tv-item relative flex flex-col rounded-2xl border border-slate-200 bg-white tv-card overflow-hidden" style={{ animationDelay: `${idx * 60}ms` }}>
              {/* Header band — gradient + icon + watermark */}
              <div className={`relative px-[0.95vw] py-[1.05vh] bg-gradient-to-br ${m.grad} overflow-hidden`}>
                <m.Icon className="absolute -right-[0.4vw] -bottom-[2.4vh] w-[6.5vw] h-[6.5vw] text-white/20 pointer-events-none" />
                <div className="relative flex items-center gap-[0.6vw]">
                  <div className="grid place-items-center rounded-xl bg-white/20 text-white shrink-0" style={{ width: '2.6vw', height: '2.6vw', minWidth: 34, minHeight: 34 }}>
                    <m.Icon className="w-[58%] h-[58%]" />
                  </div>
                  <div className="leading-none min-w-0">
                    <div className="font-black text-white tracking-wide uppercase truncate" style={{ fontSize: 'clamp(13px,1.15vw,23px)' }}>{p.label}</div>
                    <div className="text-white/85 font-semibold mt-[0.5vh] truncate" style={{ fontSize: 'clamp(8px,0.7vw,13px)' }}>{m.sub}</div>
                  </div>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 flex flex-col p-[1vw]">
                <div className="mt-auto">
                  <div className="flex items-end justify-between">
                    <div className="flex items-end gap-[0.4vw] leading-none">
                      <CountUp value={p.todayPoin} decimals={1} className="font-black text-slate-900 tabular-nums" style={{ fontSize: 'clamp(28px,3vw,64px)' }} />
                      <span className="text-slate-400 font-bold mb-[0.6vh]" style={{ fontSize: 'clamp(10px,0.85vw,16px)' }}>poin</span>
                    </div>
                    {reached && <span className="rounded-md bg-emerald-100 text-emerald-700 font-black px-[0.5vw] py-[0.3vh] mb-[0.6vh]" style={{ fontSize: 'clamp(8px,0.62vw,11px)' }}>TARGET ✓</span>}
                  </div>
                  <div className="mt-[1vh] h-[0.9vh] min-h-[6px] rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${m.bar} transition-all duration-1000`} style={{ width: `${p.pct}%` }} /></div>
                  <div className="flex items-center justify-between mt-[0.8vh] text-slate-500" style={{ fontSize: 'clamp(9px,0.78vw,14px)' }}>
                    <span className="tabular-nums font-bold text-slate-700">{p.pct}% <span className="text-slate-400 font-medium">selesai</span></span>
                    <span className="tabular-nums">{fmtNum(p.todayPcs)} pcs · {fmtNum(p.todayOrders)} order</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* SLA */}
      <div className="grid grid-cols-3 gap-[1vw]" style={{ flex: '1 1 0' }}>
        {slaCard('SLA Design', sla.design.counts, 'border-indigo-200')}
        {slaCard('SLA Proofing', sla.proofing.counts, 'border-sky-200')}
        {slaCard('SLA Perbanyak', sla.perbanyak.counts, 'border-violet-200')}
      </div>
    </div>
  );
}

// ══════════════════════ REPORT 3 · REJECT PRODUKSI ═════════════════════
export function RejectBody({ feed }: { feed: Feed }) {
  const { total, byProcess, items } = feed.reject;
  if (total === 0) return <EmptyState icon="✓" text="Tidak ada reject di produksi. Kualitas terjaga." />;
  return (
    <div className="h-full flex flex-col p-[1.4vw] gap-[1.1vw]">
      <div className="flex items-stretch gap-[1.1vw]">
        <div className="tv-item flex flex-col justify-center rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white tv-card px-[1.6vw] py-[1.2vh]">
          <span className="text-rose-600 font-black tracking-wide uppercase" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>Total Reject</span>
          <CountUp value={total} className="font-black text-slate-900 tabular-nums leading-none mt-[0.5vh]" style={{ fontSize: 'clamp(30px,2.8vw,60px)' }} />
        </div>
        <div className="flex-1 grid gap-[0.8vw]" style={{ gridTemplateColumns: `repeat(${Math.max(byProcess.length, 1)}, minmax(0,1fr))` }}>
          {byProcess.map((bp, i) => (
            <div key={bp.proses} className="tv-item flex flex-col justify-center rounded-2xl border border-slate-200 bg-white tv-card px-[1vw] py-[1.2vh]" style={{ animationDelay: `${70 + i * 70}ms` }}>
              <span className="text-slate-500 font-bold uppercase tracking-wide truncate" style={{ fontSize: 'clamp(9px,0.78vw,14px)' }}>{bp.proses}</span>
              <CountUp value={bp.count} className="font-black text-slate-900 tabular-nums leading-none mt-[0.5vh]" style={{ fontSize: 'clamp(22px,2vw,44px)' }} />
            </div>
          ))}
        </div>
      </div>
      {/* Tabel: Nama Cust · Deadline · Jumlah */}
      <div className="flex-1 rounded-2xl border border-slate-200 bg-white tv-card overflow-hidden flex flex-col">
        <div className="grid items-center px-[1.4vw] py-[1vh] bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-wide" style={{ gridTemplateColumns: '1.6fr 1.4fr 1fr 0.8fr', fontSize: 'clamp(10px,0.82vw,15px)' }}>
          <span>Nama Customer</span><span>Deadline</span><span className="text-center">Jumlah</span><span className="text-right">Proses</span>
        </div>
        <div className="flex-1 tv-scroll overflow-hidden divide-y divide-slate-100">
          {items.slice(0, 10).map((r, i) => (
            <div key={i} className="tv-item grid items-center px-[1.4vw] py-[1.05vh]" style={{ gridTemplateColumns: '1.6fr 1.4fr 1fr 0.8fr', animationDelay: `${i * 45}ms` }}>
              <span className="truncate font-bold text-slate-800" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{r.cust}</span>
              <span className="tabular-nums text-slate-600 font-semibold" style={{ fontSize: 'clamp(11px,0.95vw,17px)' }}>{r.deadline ? fmtTanggalShort(r.deadline) : '—'}</span>
              <span className="text-center tabular-nums font-black text-slate-900" style={{ fontSize: 'clamp(13px,1.1vw,21px)' }}>{fmtNum(r.jumlah)}</span>
              <span className="text-right"><span className="inline-block rounded-md bg-rose-100 text-rose-700 font-bold px-[0.6vw] py-[0.3vh] truncate max-w-full" style={{ fontSize: 'clamp(9px,0.76vw,14px)' }}>{r.proses}</span></span>
            </div>
          ))}
          {items.length > 10 && <div className="px-[1.4vw] py-[0.9vh] text-slate-400 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{items.length - 10} reject lainnya…</div>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════ REPORT 4 · DEADLINE PER TANGGAL ════════════════
export function DeadlineBody({ feed }: { feed: Feed }) {
  const groups = feed.deadline.upcoming.slice(0, 8);
  if (groups.length === 0) return <EmptyState icon="📅" text="Belum ada deadline dalam 7 hari ke depan." />;
  const cols = groups.length <= 4 ? groups.length : 4;
  return (
    <div className="h-full grid gap-[1vw] p-[1.2vw]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: '1fr' }}>
      {groups.map((g, gi) => {
        const isToday = g.date === feed.today;
        return (
          <div key={g.date} className="tv-item flex flex-col rounded-2xl border border-slate-200 bg-white tv-card overflow-hidden" style={{ animationDelay: `${gi * 70}ms` }}>
            <div className="px-[0.9vw] py-[1vh] text-white" style={{ background: isToday ? 'linear-gradient(90deg,#e11d48,#f43f5e)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}>
              <div className="font-black leading-none" style={{ fontSize: 'clamp(14px,1.3vw,26px)' }}>{fmtTanggalFull(g.date)}</div>
              <div className="font-semibold mt-[0.5vh] opacity-90" style={{ fontSize: 'clamp(9px,0.78vw,14px)' }}>{isToday ? 'HARI INI · ' : ''}{fmtNum(g.count)} order · {fmtNum(g.qty)} pcs</div>
            </div>
            <div className="flex-1 tv-scroll overflow-hidden divide-y divide-slate-100">
              {g.orders.slice(0, 7).map((o, i) => (
                <div key={i} className="flex items-center justify-between px-[0.9vw] py-[0.9vh]">
                  <div className="min-w-0 flex items-center gap-[0.5vw]">
                    <span className="text-slate-300 tabular-nums font-black shrink-0" style={{ fontSize: 'clamp(9px,0.76vw,14px)' }}>{i + 1}</span>
                    <span className="truncate font-semibold text-slate-800" style={{ fontSize: 'clamp(11px,0.98vw,19px)' }}>{o.cust}</span>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-100 text-slate-700 font-bold tabular-nums px-[0.5vw] py-[0.25vh] ml-[0.4vw]" style={{ fontSize: 'clamp(9px,0.78vw,14px)' }}>{fmtNum(o.qty)}</span>
                </div>
              ))}
              {g.orders.length > 7 && <div className="px-[0.9vw] py-[0.8vh] text-slate-400 font-semibold" style={{ fontSize: 'clamp(9px,0.76vw,13px)' }}>+{g.orders.length - 7} lainnya…</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════ REPORT 5 · LEWAT DEADLINE & H-3 ════════════════
export function TelatBody({ feed }: { feed: Feed }) {
  const { overdue, h3 } = feed.urgent;
  const table = (rows: { cust: string; deadline: string; qty: number; tag: string }[], tone: 'rose' | 'amber', empty: string) => {
    const head = tone === 'rose' ? 'bg-rose-600' : 'bg-amber-500 text-[#1a1204]';
    const divide = tone === 'rose' ? 'divide-rose-100' : 'divide-amber-100';
    const tagCls = tone === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';
    return (
      <div className={`tv-item flex flex-col rounded-2xl border ${tone === 'rose' ? 'border-rose-200' : 'border-amber-200'} bg-white tv-card overflow-hidden`}>
        <div className={`flex items-center justify-between px-[1.2vw] py-[1.2vh] text-white ${head}`}>
          <span className="font-black tracking-wide" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>{tone === 'rose' ? 'LEWAT DEADLINE' : 'H-3 SEBELUM DEADLINE'}</span>
          <span className="font-black tabular-nums rounded-lg bg-black/10 px-[0.8vw] py-[0.3vh]" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}><CountUp value={rows.length} /></span>
        </div>
        {rows.length === 0 ? (
          <div className="flex-1 grid place-items-center text-emerald-600 font-bold" style={{ fontSize: 'clamp(13px,1.1vw,20px)' }}>✓ {empty}</div>
        ) : (
          <>
            <div className="grid items-center px-[1.2vw] py-[0.8vh] bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-wide" style={{ gridTemplateColumns: '1.7fr 1.2fr 0.8fr 0.9fr', fontSize: 'clamp(9px,0.76vw,14px)' }}>
              <span>Nama Customer</span><span>Deadline</span><span className="text-center">Jumlah</span><span className="text-right">{tone === 'rose' ? 'Telat' : 'Sisa'}</span>
            </div>
            <div className={`flex-1 tv-scroll overflow-hidden divide-y ${divide}`}>
              {rows.slice(0, 9).map((r, i) => (
                <div key={i} className="tv-item grid items-center px-[1.2vw] py-[1.02vh]" style={{ gridTemplateColumns: '1.7fr 1.2fr 0.8fr 0.9fr', animationDelay: `${i * 45}ms` }}>
                  <span className="truncate font-bold text-slate-800" style={{ fontSize: 'clamp(12px,1.05vw,20px)' }}>{r.cust}</span>
                  <span className="tabular-nums text-slate-600 font-semibold" style={{ fontSize: 'clamp(10px,0.9vw,16px)' }}>{fmtTanggalShort(r.deadline)}</span>
                  <span className="text-center tabular-nums font-black text-slate-900" style={{ fontSize: 'clamp(12px,1.05vw,20px)' }}>{fmtNum(r.qty)}</span>
                  <span className="text-right"><span className={`inline-block rounded-md font-black px-[0.6vw] py-[0.3vh] ${tagCls}`} style={{ fontSize: 'clamp(9px,0.78vw,14px)' }}>{r.tag}</span></span>
                </div>
              ))}
              {rows.length > 9 && <div className="px-[1.2vw] py-[0.8vh] text-slate-400 font-semibold" style={{ fontSize: 'clamp(9px,0.76vw,14px)' }}>+{rows.length - 9} lainnya…</div>}
            </div>
          </>
        )}
      </div>
    );
  };
  return (
    <div className="h-full grid grid-cols-2 gap-[1.1vw] p-[1.4vw]">
      {table(overdue.map(o => ({ cust: o.cust, deadline: o.deadline, qty: o.qty, tag: `+${o.daysLate}h` })), 'rose', 'Tidak ada yang lewat deadline')}
      {table(h3.map(h => ({ cust: h.cust, deadline: h.deadline, qty: h.qty, tag: h.daysLeft === 0 ? 'HARI INI' : `H-${h.daysLeft}` })), 'amber', 'Tidak ada yang mendekati deadline')}
    </div>
  );
}

// ── Demo data (?demo=1) ─────────────────────────────────────────────────
function isoPlus(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function buildSample(): Feed {
  const target = 340;
  const mkProc = (key: string, label: string, poin: number, pcs: number, orders: number, month: number): ProcPoin =>
    ({ key, label, todayPoin: poin, todayPcs: pcs, todayOrders: orders, monthPoin: month, pct: Math.min(100, Math.round((poin / target) * 100)) });
  const processes = [
    mkProc('printing', 'Printing', 372, 388, 9, 6420), mkProc('press', 'Press', 268, 279, 7, 5180),
    mkProc('cutting', 'Cutting', 415, 431, 11, 7040), mkProc('jahit', 'Jahit', 306, 318, 8, 5960),
    mkProc('steam', 'Steam', 224, 233, 6, 4180), mkProc('finishing', 'Finishing', 341, 352, 9, 6010),
    mkProc('shipment', 'Shipment', 188, 195, 5, 3120),
  ];
  const mkUpcoming = (d: number, orders: UpcomingGroup['orders']): UpcomingGroup => ({ date: isoPlus(d), count: orders.length, qty: orders.reduce((s, o) => s + o.qty, 0), orders });
  return {
    success: true, generatedAt: new Date().toISOString(), today: isoPlus(0),
    poin: { target, processes, totalTodayPoin: processes.reduce((s, p) => s + p.todayPoin, 0) },
    deadline: {
      upcoming: [
        mkUpcoming(0, [{ cust: 'RO 1 Sovya Royza Putra', qty: 72, paket: 'PRO', noOrder: 'AY0831-002' }, { cust: 'SMANSA Cup 2026', qty: 88, paket: 'KLASIK', noOrder: 'AY0829-014' }, { cust: 'Persib Junior Bandung', qty: 54, paket: 'STANDAR', noOrder: 'AY0830-006' }]),
        mkUpcoming(1, [{ cust: 'FC Garuda Muda', qty: 48, paket: 'PRO', noOrder: 'AY0828-021' }, { cust: 'Komunitas Lari Senja', qty: 40, paket: 'STANDAR', noOrder: 'AY0827-009' }]),
        mkUpcoming(2, [{ cust: 'PS Bintang Timur', qty: 96, paket: 'PRO', noOrder: 'AY0826-033' }, { cust: 'Futsal Kelurahan Jaya', qty: 40, paket: 'KLASIK', noOrder: 'AY0825-002' }]),
        mkUpcoming(3, [{ cust: 'Tim Voli Merdeka', qty: 60, paket: 'KLASIK', noOrder: 'AY0824-018' }]),
        mkUpcoming(4, [{ cust: 'CV Sinar Abadi', qty: 60, paket: 'PRO', noOrder: 'AY0823-041' }, { cust: 'Basket Putri Elang', qty: 40, paket: 'KLASIK', noOrder: 'AY0820-027' }]),
        mkUpcoming(6, [{ cust: 'Akademi Sepakbola Nusantara', qty: 120, paket: 'PRO', noOrder: 'AY0822-005' }]),
        mkUpcoming(7, [{ cust: 'Panitia Porseni SMP 3', qty: 44, paket: 'STANDAR', noOrder: 'AY0821-012' }, { cust: 'Klub Renang Tirta', qty: 30, paket: 'STANDAR', noOrder: 'AY0819-050' }]),
      ],
    },
    urgent: {
      overdue: [
        { cust: 'PT Maju Bersama Sport', noOrder: 'AY0812-004', deadline: isoPlus(-3), qty: 84, daysLate: 3 },
        { cust: 'Turnamen RW 07', noOrder: 'AY0815-019', deadline: isoPlus(-1), qty: 36, daysLate: 1 },
      ],
      h3: [
        { cust: 'RO 1 Sovya Royza Putra', noOrder: 'AY0831-002', deadline: isoPlus(0), qty: 72, daysLeft: 0 },
        { cust: 'FC Garuda Muda', noOrder: 'AY0828-021', deadline: isoPlus(1), qty: 48, daysLeft: 1 },
        { cust: 'PS Bintang Timur', noOrder: 'AY0826-033', deadline: isoPlus(2), qty: 96, daysLeft: 2 },
      ],
    },
    reject: {
      total: 4,
      byProcess: [{ proses: 'QC Panel Process', count: 2 }, { proses: 'Sewing', count: 1 }, { proses: 'QC Final dan Packing', count: 1 }],
      items: [
        { cust: 'PS Bintang Timur', proses: 'QC Panel Process', deadline: isoPlus(2), jumlah: 96, at: isoPlus(-1), status: 'PENDING' },
        { cust: 'FC Garuda Muda', proses: 'Sewing', deadline: isoPlus(1), jumlah: 48, at: isoPlus(-1), status: 'PENDING' },
        { cust: 'CV Sinar Abadi', proses: 'QC Panel Process', deadline: isoPlus(4), jumlah: 60, at: isoPlus(-2), status: 'PENDING' },
        { cust: 'Tim Voli Merdeka', proses: 'QC Final dan Packing', deadline: isoPlus(3), jumlah: 60, at: isoPlus(-2), status: 'PENDING' },
      ],
    },
    sla: {
      design: { counts: { aman: 6, warning: 2, terlambat: 1 }, items: [] },
      proofing: { counts: { aman: 4, warning: 1, terlambat: 0 }, items: [] },
      perbanyak: { counts: { aman: 9, warning: 3, terlambat: 2 }, items: [] },
    },
  };
}
