'use client';

// ═══════════════════════════════════════════════════════════════════════
// Papan Progress AYRES — tampilan TV publik (tanpa login) di /progress.
// Tema TERANG (putih). Auto-rotate 5 papan, polling tiap 20 dtk dari
// /api/public/progress. Didesain untuk layar besar 16:9 dilihat dari jauh:
// tipografi besar, kontras kuat, aksen indigo→violet + status hijau/amber/
// merah. Sentuhan visual terinspirasi reactbits.dev / 21st.dev (angka
// CountUp beranimasi, GradientText, ShinyText, dot-grid halus, kartu
// spotlight, animated list) — semua pure CSS / rAF, tanpa dependensi berat.
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
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

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

// ── CountUp (reactbits-style) — angka menggelinding easeOutCubic. Remount
// tiap papan tampil (key={board}) → animasi ulang tiap kali papan muncul.
function CountUp({ value, decimals = 0, className, style }: { value: number; decimals?: number; className?: string; style?: React.CSSProperties }) {
  const [disp, setDisp] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = value || 0;
    const dur = 950;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const shown = disp.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  return <span className={className} style={style}>{shown}</span>;
}

const BOARDS = ['poin', 'deadline', 'urgent', 'reject', 'sla'] as const;
type Board = typeof BOARDS[number];
const BOARD_META: Record<Board, { title: string; sub: string }> = {
  poin: { title: 'Hasil Kerja Harian', sub: 'Poin per proses · hari ini' },
  deadline: { title: 'Deadline per Tanggal', sub: 'Hasil closingan CS Order' },
  urgent: { title: 'Lewat Deadline & H-3', sub: 'Perlu tindakan segera' },
  reject: { title: 'Reject Customer', sub: 'Dipisah per proses' },
  sla: { title: 'SLA Design', sub: 'Target hari kerja per tahap' },
};

// ── Demo data (?demo=1) — preview layout tanpa DB / saat proses masih
// kosong. Tanggal dihitung relatif ke hari ini biar terlihat hidup.
function isoPlus(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function buildSample(): Feed {
  const target = 340;
  const mkProc = (key: string, label: string, poin: number, pcs: number, orders: number, month: number): ProcPoin =>
    ({ key, label, todayPoin: poin, todayPcs: pcs, todayOrders: orders, monthPoin: month, pct: Math.min(100, Math.round((poin / target) * 100)) });
  const processes = [
    mkProc('printing', 'Printing', 372, 388, 9, 6420),
    mkProc('press', 'Press', 268, 279, 7, 5180),
    mkProc('cutting', 'Cutting', 415, 431, 11, 7040),
    mkProc('jahit', 'Jahit', 306, 318, 8, 5960),
    mkProc('shipment', 'Shipment', 188, 195, 5, 3120),
  ];
  return {
    success: true, generatedAt: new Date().toISOString(), today: isoPlus(0),
    poin: { target, processes, totalTodayPoin: processes.reduce((s, p) => s + p.todayPoin, 0) },
    deadline: {
      upcoming: [
        { date: isoPlus(0), count: 4, qty: 262, orders: [
          { cust: 'RO 1 Sovya Royza Putra', qty: 72, paket: 'PRO', noOrder: 'AY0831-002' },
          { cust: 'SMANSA Cup 2026', qty: 88, paket: 'KLASIK', noOrder: 'AY0829-014' },
          { cust: 'Persib Junior Bandung', qty: 54, paket: 'STANDAR', noOrder: 'AY0830-006' },
          { cust: 'FC Garuda Muda', qty: 48, paket: 'PRO', noOrder: 'AY0828-021' },
        ] },
        { date: isoPlus(2), count: 3, qty: 176, orders: [
          { cust: 'Komunitas Lari Senja', qty: 40, paket: 'STANDAR', noOrder: 'AY0827-009' },
          { cust: 'PS Bintang Timur', qty: 96, paket: 'PRO', noOrder: 'AY0826-033' },
          { cust: 'Futsal Kelurahan Jaya', qty: 40, paket: 'KLASIK', noOrder: 'AY0825-002' },
        ] },
        { date: isoPlus(5), count: 2, qty: 120, orders: [
          { cust: 'Tim Voli Merdeka', qty: 60, paket: 'KLASIK', noOrder: 'AY0824-018' },
          { cust: 'CV Sinar Abadi', qty: 60, paket: 'PRO', noOrder: 'AY0823-041' },
        ] },
        { date: isoPlus(8), count: 3, qty: 204, orders: [
          { cust: 'Akademi Sepakbola Nusantara', qty: 120, paket: 'PRO', noOrder: 'AY0822-005' },
          { cust: 'Panitia Porseni SMP 3', qty: 44, paket: 'STANDAR', noOrder: 'AY0821-012' },
          { cust: 'Basket Putri Elang', qty: 40, paket: 'KLASIK', noOrder: 'AY0820-027' },
        ] },
      ],
    },
    urgent: {
      overdue: [
        { cust: 'PT Maju Bersama Sport', noOrder: 'AY0812-004', deadline: isoPlus(-3), qty: 84, paket: 'PRO', daysLate: 3 },
        { cust: 'Turnamen RW 07', noOrder: 'AY0815-019', deadline: isoPlus(-1), qty: 36, paket: 'STANDAR', daysLate: 1 },
      ],
      h3: [
        { cust: 'RO 1 Sovya Royza Putra', noOrder: 'AY0831-002', deadline: isoPlus(0), qty: 72, paket: 'PRO', daysLeft: 0 },
        { cust: 'Persib Junior Bandung', noOrder: 'AY0830-006', deadline: isoPlus(1), qty: 54, paket: 'STANDAR', daysLeft: 1 },
        { cust: 'PS Bintang Timur', noOrder: 'AY0826-033', deadline: isoPlus(2), qty: 96, paket: 'PRO', daysLeft: 2 },
      ],
    },
    reject: {
      total: 3,
      byProcess: [{ proses: 'Design', count: 3 }],
      items: [
        { cust: 'Klub Renang Tirta', proses: 'Design', reason: 'Customer batal, pindah vendor lain', at: isoPlus(-1) },
        { cust: 'EO Pesta Rakyat', proses: 'Design', reason: 'Budget tidak sesuai, tunda ke tahun depan', at: isoPlus(-2) },
        { cust: 'Toko Olahraga Jaya', proses: 'Design', reason: 'Salah brief, minta ulang total', at: isoPlus(-4) },
      ],
    },
    sla: {
      design: {
        counts: { aman: 6, warning: 2, terlambat: 1 },
        stages: [
          { stage: 'Waiting List', count: 4 }, { stage: 'Design Awal', count: 3 },
          { stage: 'Design Revisi 1', count: 2 },
        ],
        items: [
          { cust: 'CV Sinar Abadi', stage: 'Design Revisi 1', target: isoPlus(-1), status: 'terlambat' },
          { cust: 'Tim Voli Merdeka', stage: 'Design Awal', target: isoPlus(0), status: 'warning' },
          { cust: 'Panitia Porseni SMP 3', stage: 'Design Awal', target: isoPlus(0), status: 'warning' },
          { cust: 'Akademi Sepakbola Nusantara', stage: 'Waiting List', target: isoPlus(2), status: 'aman' },
          { cust: 'Basket Putri Elang', stage: 'Waiting List', target: isoPlus(3), status: 'aman' },
        ],
      },
    },
  };
}

export default function ProgressTVPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState(false);
  const [lastOk, setLastOk] = useState<number>(0);
  const [boardIdx, setBoardIdx] = useState(0);
  const [now, setNow] = useState<Date>(new Date());
  const [rotToken, setRotToken] = useState(0);
  const feedRef = useRef<Feed | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/public/progress', { cache: 'no-store' });
      const json = await res.json();
      if (json && json.success) {
        setFeed(json as Feed); feedRef.current = json as Feed; setLastOk(Date.now()); setErr(false);
      } else { setErr(true); }
    } catch { setErr(true); }
  }, []);

  // Clock tick.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Poll + rotate. ?demo=1 → data sample (tanpa DB). ?board=<id> → kunci
  // ke satu papan (buat preview / screenshot).
  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const demo = sp.has('demo');
    const b = sp.get('board');
    const lockIdx = b ? BOARDS.indexOf(b as Board) : -1;
    if (lockIdx >= 0) setBoardIdx(lockIdx);
    if (demo) {
      const s = buildSample(); setFeed(s); feedRef.current = s; setLastOk(Date.now()); setErr(false);
    } else { load(); }
    const pollT = demo ? null : setInterval(load, POLL_MS);
    const rotT = lockIdx >= 0 ? null : setInterval(() => { setBoardIdx(i => (i + 1) % BOARDS.length); setRotToken(x => x + 1); }, ROTATE_MS);
    return () => { if (pollT) clearInterval(pollT); if (rotT) clearInterval(rotT); };
  }, [load]);

  const board = BOARDS[boardIdx];
  const meta = BOARD_META[board];

  const clock = useMemo(() => ({
    hh: String(now.getHours()).padStart(2, '0'),
    mm: String(now.getMinutes()).padStart(2, '0'),
    ss: String(now.getSeconds()).padStart(2, '0'),
  }), [now]);
  const dateLabel = useMemo(() =>
    `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MON_SHORT[now.getMonth()]} ${now.getFullYear()}`, [now]);

  const secsAgo = lastOk ? Math.max(0, Math.round((Date.now() - lastOk) / 1000)) : null;
  const live = !err && secsAgo !== null && secsAgo < POLL_MS / 1000 + 12;

  const marquee = useMemo(() => {
    if (!feed) return 'Menyiapkan papan progress AYRES…';
    const parts: string[] = [];
    for (const o of feed.urgent.overdue.slice(0, 8)) parts.push(`⚠ LEWAT DEADLINE — ${o.cust} (+${o.daysLate} hari, ${fmtNum(o.qty)} pcs)`);
    for (const h of feed.urgent.h3.slice(0, 8)) parts.push(`⏰ ${h.daysLeft === 0 ? 'JATUH TEMPO HARI INI' : `H-${h.daysLeft}`} — ${h.cust} (${fmtTanggalShort(h.deadline)})`);
    if (parts.length === 0) parts.push('✓ Semua order dalam kendali — tidak ada yang lewat deadline. Kerja bagus, tim AYRES!');
    return parts.join('          •          ');
  }, [feed]);

  return (
    <div className="tvroot fixed inset-0 overflow-hidden text-slate-800 select-none" style={{ background: '#ffffff' }}>
      <style>{`
        @keyframes tvmarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes tvpulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .3; transform: scale(.7); } }
        @keyframes tvbar { 0% { width: 0%; } 100% { width: 100%; } }
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
      `}</style>

      {/* Background decoration — dot grid + soft color blobs (halus, tetap putih) */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, rgba(15,23,42,0.055) 1px, transparent 1px)',
        backgroundSize: '26px 26px', animation: 'tvdrift 6s linear infinite',
      }} />
      <div aria-hidden className="absolute -top-[12vh] -left-[8vw] rounded-full pointer-events-none" style={{ width: '42vw', height: '42vw', background: 'radial-gradient(circle, rgba(99,102,241,0.10), transparent 70%)' }} />
      <div aria-hidden className="absolute -bottom-[16vh] -right-[6vw] rounded-full pointer-events-none" style={{ width: '38vw', height: '38vw', background: 'radial-gradient(circle, rgba(245,158,11,0.10), transparent 70%)' }} />

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="relative flex items-center justify-between px-[2.2vw] pt-[1.9vh] pb-[1.3vh]">
        <div className="flex items-center gap-[1.1vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/new%20logo.png" alt="AYRES" className="h-[4.4vh] w-auto object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div className="leading-none">
            <div className="tv-grad font-black tracking-[0.18em]" style={{ fontSize: 'clamp(20px,2.1vw,42px)' }}>AYRES</div>
            <div className="tracking-[0.42em] text-slate-400 font-semibold mt-[0.6vh]" style={{ fontSize: 'clamp(9px,0.8vw,15px)' }}>PRODUCTION LIVE</div>
          </div>
        </div>

        <div className="flex items-center gap-[1.8vw]">
          <div className="flex items-center gap-[0.55vw] rounded-full border border-slate-200 bg-white/80 tv-card px-[1vw] py-[0.7vh]">
            <span className="rounded-full" style={{ width: '0.7vw', height: '0.7vw', minWidth: 8, minHeight: 8, background: live ? '#10b981' : '#f43f5e', animation: 'tvpulse 1.6s ease-in-out infinite' }} />
            {live ? <span className="tv-shine font-black tracking-widest" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>LIVE</span>
              : <span className="text-rose-500 font-black tracking-widest" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>OFFLINE</span>}
            <span className="text-slate-400 tabular-nums font-semibold" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>{secsAgo === null ? '—' : `${secsAgo}s`}</span>
          </div>
          <div className="text-right leading-none">
            <div className="font-black text-slate-900 tabular-nums tracking-tight" style={{ fontSize: 'clamp(26px,2.9vw,58px)' }}>
              {clock.hh}<span className="text-indigo-500">:</span>{clock.mm}
              <span className="text-slate-400 align-top ml-[0.3vw]" style={{ fontSize: 'clamp(12px,1.2vw,22px)' }}>{clock.ss}</span>
            </div>
            <div className="text-slate-500 font-semibold mt-[0.6vh]" style={{ fontSize: 'clamp(10px,0.9vw,17px)' }}>{dateLabel}</div>
          </div>
        </div>
      </header>

      {/* ── Board title strip ──────────────────────────────────────── */}
      <div className="relative flex items-stretch mx-[2.2vw] rounded-t-2xl overflow-hidden border border-slate-200 border-b-0 bg-white tv-card">
        <div className="flex items-center px-[1.5vw] bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
          <span className="font-black tabular-nums" style={{ fontSize: 'clamp(16px,1.5vw,30px)' }}>{String(boardIdx + 1).padStart(2, '0')}</span>
        </div>
        <div className="flex-1 flex items-center justify-between px-[1.6vw] py-[1.25vh]">
          <div>
            <h1 className="font-black tracking-tight text-slate-900 leading-none" style={{ fontSize: 'clamp(20px,2vw,42px)' }}>{meta.title}</h1>
            <p className="text-slate-500 font-medium mt-[0.7vh]" style={{ fontSize: 'clamp(11px,0.92vw,18px)' }}>{meta.sub}</p>
          </div>
          <div className="flex items-center gap-[0.6vw]">
            {BOARDS.map((b, i) => (
              <span key={b} className="rounded-full transition-all duration-500"
                style={{ width: i === boardIdx ? '2.2vw' : '0.7vw', height: '0.7vw', minHeight: 7, background: i === boardIdx ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : '#e2e8f0' }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Rotation progress bar ──────────────────────────────────── */}
      <div className="relative mx-[2.2vw] h-[0.4vh] min-h-[3px] bg-slate-100 border-x border-slate-200 overflow-hidden">
        <div key={rotToken} className="h-full" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', animation: `tvbar ${ROTATE_MS}ms linear both` }} />
      </div>

      {/* ── Board body ─────────────────────────────────────────────── */}
      <main className="relative mx-[2.2vw] rounded-b-2xl border border-slate-200 border-t-0 bg-white/70 tv-card overflow-hidden"
        style={{ height: 'calc(100vh - 22vh)' }}>
        {!feed ? (
          <div className="h-full grid place-items-center text-slate-400" style={{ fontSize: 'clamp(14px,1.2vw,22px)' }}>Menyiapkan papan progress…</div>
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
      <footer className="absolute bottom-0 inset-x-0 h-[6vh] min-h-[42px] flex items-center border-t border-slate-200 bg-white overflow-hidden">
        <div className="shrink-0 h-full flex items-center px-[1.6vw] text-white font-black tracking-widest" style={{ background: 'linear-gradient(90deg,#e11d48,#f43f5e)', fontSize: 'clamp(11px,0.95vw,18px)' }}>INFO</div>
        <div className="relative flex-1 overflow-hidden whitespace-nowrap">
          <div className="inline-block" style={{ animation: 'tvmarquee 42s linear infinite' }}>
            <span className="text-slate-700 font-semibold px-[2vw]" style={{ fontSize: 'clamp(13px,1.15vw,22px)' }}>{marquee}</span>
            <span className="text-slate-700 font-semibold px-[2vw]" style={{ fontSize: 'clamp(13px,1.15vw,22px)' }}>{marquee}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ══════════════════════════ BOARD 1 · POIN ════════════════════════════
const PROC_ACCENT: Record<string, { bar: string; tint: string; text: string; glow: string; border: string }> = {
  printing: { bar: 'from-sky-400 to-sky-600', tint: 'bg-sky-50', text: 'text-sky-700', glow: 'rgba(56,189,248,0.18)', border: 'border-sky-200' },
  press: { bar: 'from-violet-400 to-violet-600', tint: 'bg-violet-50', text: 'text-violet-700', glow: 'rgba(167,139,250,0.18)', border: 'border-violet-200' },
  cutting: { bar: 'from-orange-400 to-orange-600', tint: 'bg-orange-50', text: 'text-orange-700', glow: 'rgba(251,146,60,0.18)', border: 'border-orange-200' },
  jahit: { bar: 'from-emerald-400 to-emerald-600', tint: 'bg-emerald-50', text: 'text-emerald-700', glow: 'rgba(52,211,153,0.18)', border: 'border-emerald-200' },
  shipment: { bar: 'from-teal-400 to-teal-600', tint: 'bg-teal-50', text: 'text-teal-700', glow: 'rgba(45,212,191,0.18)', border: 'border-teal-200' },
};
function BoardPoin({ feed }: { feed: Feed }) {
  const { processes, target, totalTodayPoin } = feed.poin;
  return (
    <div className="h-full flex flex-col p-[1.5vw]">
      <div className="flex-1 grid grid-cols-5 gap-[1.1vw]">
        {processes.map((p, idx) => {
          const a = PROC_ACCENT[p.key] || PROC_ACCENT.printing;
          const reached = p.todayPoin >= target;
          return (
            <div key={p.key} className={`tv-item relative flex flex-col rounded-2xl border ${a.border} bg-white tv-card p-[1.15vw] overflow-hidden`} style={{ animationDelay: `${idx * 70}ms` }}>
              <div aria-hidden className="absolute -top-[7vh] -right-[3vw] rounded-full blur-2xl" style={{ width: '11vw', height: '11vw', background: a.glow }} />
              <div className="relative flex items-center justify-between">
                <span className={`font-black tracking-wide uppercase ${a.text}`} style={{ fontSize: 'clamp(13px,1.12vw,23px)' }}>{p.label}</span>
                {reached && <span className="rounded-md bg-emerald-100 text-emerald-700 font-black px-[0.5vw] py-[0.3vh]" style={{ fontSize: 'clamp(8px,0.66vw,12px)' }}>TARGET ✓</span>}
              </div>
              <div className="relative mt-auto">
                <div className="flex items-end gap-[0.4vw] leading-none">
                  <CountUp value={p.todayPoin} decimals={1} className="font-black text-slate-900 tabular-nums" style={{ fontSize: 'clamp(36px,3.7vw,80px)' }} />
                  <span className="text-slate-400 font-bold mb-[0.6vh]" style={{ fontSize: 'clamp(11px,0.9vw,17px)' }}>poin</span>
                </div>
                <div className="mt-[1vh] h-[1vh] min-h-[7px] rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${a.bar} transition-all duration-1000`} style={{ width: `${p.pct}%` }} />
                </div>
                <div className="flex items-center justify-between mt-[0.9vh] text-slate-500" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>
                  <span className="tabular-nums font-bold text-slate-700">{p.pct}%<span className="text-slate-400 font-medium"> / {target}</span></span>
                  <span className="tabular-nums">{fmtNum(p.todayPcs)} pcs · {fmtNum(p.todayOrders)} order</span>
                </div>
                <div className="mt-[0.5vh] text-slate-400 tabular-nums" style={{ fontSize: 'clamp(9px,0.75vw,13px)' }}>Bulan ini: {fmtNum(p.monthPoin)} poin</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-[1.1vw] flex items-center justify-between rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-[1.6vw] py-[1.3vh]">
        <span className="font-black tracking-wide text-indigo-700 uppercase" style={{ fontSize: 'clamp(12px,1vw,20px)' }}>Total Poin Hari Ini</span>
        <div className="flex items-baseline gap-[0.5vw]">
          <CountUp value={totalTodayPoin} decimals={1} className="font-black text-slate-900 tabular-nums" style={{ fontSize: 'clamp(28px,2.6vw,56px)' }} />
          <span className="text-slate-500 font-bold" style={{ fontSize: 'clamp(12px,1vw,20px)' }}>poin · target {fmtNum(target * processes.length)}</span>
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
      {groups.map((g, gi) => {
        const isToday = g.date === feed.today;
        return (
          <div key={g.date} className="tv-item flex flex-col rounded-2xl border border-slate-200 bg-white tv-card overflow-hidden" style={{ animationDelay: `${gi * 80}ms` }}>
            <div className="px-[1vw] py-[1.15vh] text-white" style={{ background: isToday ? 'linear-gradient(90deg,#e11d48,#f43f5e)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}>
              <div className="font-black leading-none" style={{ fontSize: 'clamp(16px,1.5vw,30px)' }}>{fmtTanggalFull(g.date)}</div>
              <div className="font-semibold mt-[0.6vh] opacity-90" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>
                {isToday ? 'HARI INI · ' : ''}{fmtNum(g.count)} order · {fmtNum(g.qty)} pcs
              </div>
            </div>
            <div className="flex-1 tv-scroll overflow-hidden divide-y divide-slate-100">
              {g.orders.slice(0, 9).map((o, i) => (
                <div key={i} className="tv-item flex items-center justify-between px-[1vw] py-[1.05vh]" style={{ animationDelay: `${gi * 80 + i * 45}ms` }}>
                  <div className="min-w-0 flex items-center gap-[0.6vw]">
                    <span className="text-slate-300 tabular-nums font-black shrink-0" style={{ fontSize: 'clamp(10px,0.8vw,15px)' }}>{i + 1}</span>
                    <span className="truncate font-semibold text-slate-800" style={{ fontSize: 'clamp(12px,1.02vw,20px)' }}>{o.cust}</span>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-100 text-slate-700 font-bold tabular-nums px-[0.6vw] py-[0.3vh] ml-[0.5vw]" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>{fmtNum(o.qty)}</span>
                </div>
              ))}
              {g.orders.length > 9 && <div className="px-[1vw] py-[0.9vh] text-slate-400 font-semibold" style={{ fontSize: 'clamp(10px,0.8vw,14px)' }}>+{g.orders.length - 9} order lainnya…</div>}
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
      <div className="tv-item flex flex-col rounded-2xl border border-rose-200 bg-white tv-card overflow-hidden">
        <div className="flex items-center justify-between px-[1.2vw] py-[1.2vh] text-white" style={{ background: 'linear-gradient(90deg,#e11d48,#f43f5e)' }}>
          <span className="font-black tracking-wide" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>LEWAT DEADLINE</span>
          <span className="font-black tabular-nums rounded-lg bg-white/20 px-[0.8vw] py-[0.3vh]" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}><CountUp value={overdue.length} /></span>
        </div>
        {overdue.length === 0 ? (
          <div className="flex-1 grid place-items-center text-emerald-600 font-bold" style={{ fontSize: 'clamp(13px,1.1vw,20px)' }}>✓ Tidak ada yang lewat deadline</div>
        ) : (
          <div className="flex-1 tv-scroll overflow-hidden divide-y divide-rose-100">
            {overdue.slice(0, 8).map((o, i) => (
              <div key={i} className="tv-item flex items-center gap-[0.8vw] px-[1.2vw] py-[1.12vh]" style={{ animationDelay: `${i * 55}ms` }}>
                <span className="shrink-0 rounded-lg bg-rose-100 text-rose-700 font-black tabular-nums px-[0.7vw] py-[0.4vh]" style={{ fontSize: 'clamp(12px,1vw,19px)' }}>+{o.daysLate}h</span>
                <span className="flex-1 truncate font-bold text-slate-800" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{o.cust}</span>
                <span className="shrink-0 text-slate-400 tabular-nums" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{fmtTanggalShort(o.deadline)}</span>
                <span className="shrink-0 rounded-md bg-slate-100 text-slate-700 font-bold tabular-nums px-[0.6vw] py-[0.3vh]" style={{ fontSize: 'clamp(11px,0.88vw,16px)' }}>{fmtNum(o.qty)} pcs</span>
              </div>
            ))}
            {overdue.length > 8 && <div className="px-[1.2vw] py-[0.9vh] text-rose-500 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{overdue.length - 8} lagi…</div>}
          </div>
        )}
      </div>

      {/* H-3 */}
      <div className="tv-item flex flex-col rounded-2xl border border-amber-200 bg-white tv-card overflow-hidden" style={{ animationDelay: '90ms' }}>
        <div className="flex items-center justify-between px-[1.2vw] py-[1.2vh] text-white" style={{ background: 'linear-gradient(90deg,#d97706,#f59e0b)' }}>
          <span className="font-black tracking-wide" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>H-3 SEBELUM DEADLINE</span>
          <span className="font-black tabular-nums rounded-lg bg-white/20 px-[0.8vw] py-[0.3vh]" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}><CountUp value={h3.length} /></span>
        </div>
        {h3.length === 0 ? (
          <div className="flex-1 grid place-items-center text-slate-400 font-bold" style={{ fontSize: 'clamp(13px,1.1vw,20px)' }}>Tidak ada yang mendekati deadline</div>
        ) : (
          <div className="flex-1 tv-scroll overflow-hidden divide-y divide-amber-100">
            {h3.slice(0, 8).map((h, i) => (
              <div key={i} className="tv-item flex items-center gap-[0.8vw] px-[1.2vw] py-[1.12vh]" style={{ animationDelay: `${90 + i * 55}ms` }}>
                <span className="shrink-0 rounded-lg bg-amber-100 text-amber-700 font-black px-[0.7vw] py-[0.4vh]" style={{ fontSize: 'clamp(10px,0.85vw,16px)' }}>{h.daysLeft === 0 ? 'HARI INI' : `${h.daysLeft} HARI`}</span>
                <span className="flex-1 truncate font-bold text-slate-800" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{h.cust}</span>
                <span className="shrink-0 text-slate-400 tabular-nums" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{fmtTanggalShort(h.deadline)}</span>
                <span className="shrink-0 rounded-md bg-slate-100 text-slate-700 font-bold tabular-nums px-[0.6vw] py-[0.3vh]" style={{ fontSize: 'clamp(11px,0.88vw,16px)' }}>{fmtNum(h.qty)} pcs</span>
              </div>
            ))}
            {h3.length > 8 && <div className="px-[1.2vw] py-[0.9vh] text-amber-600 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{h3.length - 8} lagi…</div>}
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
      <div className="flex items-stretch gap-[1.1vw]">
        <div className="tv-item flex flex-col justify-center rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white tv-card px-[1.6vw] py-[1.2vh]">
          <span className="text-rose-600 font-black tracking-wide uppercase" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>Total Reject</span>
          <CountUp value={total} className="font-black text-slate-900 tabular-nums leading-none mt-[0.5vh]" style={{ fontSize: 'clamp(30px,2.8vw,60px)' }} />
        </div>
        <div className="flex-1 grid gap-[0.8vw]" style={{ gridTemplateColumns: `repeat(${Math.max(byProcess.length, 1)}, minmax(0,1fr))` }}>
          {byProcess.map((bp, i) => (
            <div key={bp.proses} className="tv-item flex flex-col justify-center rounded-2xl border border-slate-200 bg-white tv-card px-[1.2vw] py-[1.2vh]" style={{ animationDelay: `${70 + i * 70}ms` }}>
              <span className="text-slate-500 font-bold uppercase tracking-wide" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>Proses {bp.proses}</span>
              <CountUp value={bp.count} className="font-black text-slate-900 tabular-nums leading-none mt-[0.5vh]" style={{ fontSize: 'clamp(24px,2.2vw,48px)' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 rounded-2xl border border-slate-200 bg-white tv-card overflow-hidden tv-scroll divide-y divide-slate-100">
        {items.slice(0, 8).map((r, i) => (
          <div key={i} className="tv-item flex items-center gap-[1vw] px-[1.4vw] py-[1.12vh]" style={{ animationDelay: `${i * 50}ms` }}>
            <span className="text-slate-300 tabular-nums font-black shrink-0 w-[1.6vw]" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{i + 1}</span>
            <span className="flex-1 truncate font-bold text-slate-800" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{r.cust}</span>
            <span className="shrink-0 rounded-md bg-rose-100 text-rose-700 font-bold px-[0.7vw] py-[0.3vh]" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>{r.proses}</span>
            <span className="hidden xl:block max-w-[26vw] truncate text-slate-400 italic" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{r.reason || '—'}</span>
            <span className="shrink-0 text-slate-400 tabular-nums" style={{ fontSize: 'clamp(10px,0.85vw,15px)' }}>{fmtTanggalShort(r.at)}</span>
          </div>
        ))}
        {items.length > 8 && <div className="px-[1.4vw] py-[0.9vh] text-slate-400 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{items.length - 8} lainnya…</div>}
      </div>
    </div>
  );
}

// ══════════════════════════ BOARD 5 · SLA ═════════════════════════════
const SLA_STYLE: Record<string, { pill: string; label: string }> = {
  terlambat: { pill: 'bg-rose-100 text-rose-700', label: 'TERLAMBAT' },
  warning: { pill: 'bg-amber-100 text-amber-700', label: 'HARI-H' },
  aman: { pill: 'bg-emerald-100 text-emerald-700', label: 'AMAN' },
};
function BoardSla({ feed }: { feed: Feed }) {
  const { counts, stages, items } = feed.sla.design;
  const totalActive = counts.aman + counts.warning + counts.terlambat;
  if (totalActive === 0) return <EmptyBoard icon="🎨" text="Tidak ada order di antrian design saat ini." />;
  return (
    <div className="h-full flex flex-col p-[1.4vw] gap-[1.1vw]">
      <div className="grid grid-cols-3 gap-[1.1vw]">
        <StatBig label="Aman" value={counts.aman} color="#059669" tint="from-emerald-50 to-white" border="border-emerald-200" delay={0} />
        <StatBig label="Hari-H" value={counts.warning} color="#d97706" tint="from-amber-50 to-white" border="border-amber-200" delay={80} />
        <StatBig label="Terlambat" value={counts.terlambat} color="#e11d48" tint="from-rose-50 to-white" border="border-rose-200" delay={160} />
      </div>
      {stages.length > 0 && (
        <div className="flex flex-wrap gap-[0.7vw]">
          {stages.map((s, i) => (
            <span key={s.stage} className="tv-item rounded-full border border-slate-200 bg-white tv-card text-slate-600 font-bold px-[1vw] py-[0.6vh]" style={{ fontSize: 'clamp(11px,0.9vw,17px)', animationDelay: `${240 + i * 60}ms` }}>
              {s.stage} <span className="text-slate-900 font-black tabular-nums ml-[0.3vw]">{fmtNum(s.count)}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex-1 rounded-2xl border border-slate-200 bg-white tv-card overflow-hidden tv-scroll divide-y divide-slate-100">
        {items.slice(0, 7).map((it, i) => {
          const s = SLA_STYLE[it.status] || SLA_STYLE.aman;
          return (
            <div key={i} className="tv-item flex items-center gap-[1vw] px-[1.4vw] py-[1.08vh]" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="text-slate-300 tabular-nums font-black shrink-0 w-[1.6vw]" style={{ fontSize: 'clamp(11px,0.9vw,16px)' }}>{i + 1}</span>
              <span className="flex-1 truncate font-bold text-slate-800" style={{ fontSize: 'clamp(13px,1.08vw,21px)' }}>{it.cust}</span>
              <span className="shrink-0 rounded-md bg-slate-100 text-slate-600 font-semibold px-[0.7vw] py-[0.3vh]" style={{ fontSize: 'clamp(10px,0.85vw,16px)' }}>{it.stage}</span>
              <span className="shrink-0 text-slate-400 tabular-nums hidden xl:inline" style={{ fontSize: 'clamp(10px,0.85vw,15px)' }}>target {fmtTanggalShort(it.target)}</span>
              <span className={`shrink-0 rounded-md font-black px-[0.7vw] py-[0.3vh] ${s.pill}`} style={{ fontSize: 'clamp(9px,0.78vw,14px)' }}>{s.label}</span>
            </div>
          );
        })}
        {items.length > 7 && <div className="px-[1.4vw] py-[0.9vh] text-slate-400 font-semibold" style={{ fontSize: 'clamp(10px,0.82vw,15px)' }}>+{items.length - 7} lainnya…</div>}
      </div>
    </div>
  );
}

function StatBig({ label, value, color, tint, border, delay }: { label: string; value: number; color: string; tint: string; border: string; delay: number }) {
  return (
    <div className={`tv-item flex flex-col items-center justify-center rounded-2xl border ${border} bg-gradient-to-br ${tint} tv-card py-[2vh]`} style={{ animationDelay: `${delay}ms` }}>
      <CountUp value={value} className="font-black tabular-nums leading-none" style={{ fontSize: 'clamp(38px,4vw,86px)', color }} />
      <span className="font-black tracking-widest uppercase text-slate-500 mt-[1vh]" style={{ fontSize: 'clamp(11px,1vw,20px)' }}>{label}</span>
    </div>
  );
}

function EmptyBoard({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="h-full grid place-items-center p-[3vw]">
      <div className="text-center">
        <div style={{ fontSize: 'clamp(40px,5vw,110px)' }}>{icon}</div>
        <p className="text-slate-400 font-bold mt-[1.5vh]" style={{ fontSize: 'clamp(15px,1.4vw,28px)' }}>{text}</p>
      </div>
    </div>
  );
}
