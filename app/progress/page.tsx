'use client';

// Hub Papan Progress — landing publik di /progress. 4 kartu link ke tiap
// report (per permintaan atasan: dipisah jadi 4 halaman, bukan 1 board).

import { useEffect, useMemo, useState } from 'react';
import { REPORTS } from '@/components/progress/kit';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const CARD_ACCENT: Record<string, { grad: string; border: string; text: string; glow: string }> = {
  harian: { grad: 'from-sky-500 to-indigo-500', border: 'border-sky-200', text: 'text-sky-700', glow: 'rgba(56,189,248,0.16)' },
  reject: { grad: 'from-rose-500 to-red-500', border: 'border-rose-200', text: 'text-rose-700', glow: 'rgba(244,63,94,0.16)' },
  deadline: { grad: 'from-indigo-500 to-violet-500', border: 'border-indigo-200', text: 'text-indigo-700', glow: 'rgba(99,102,241,0.16)' },
  telat: { grad: 'from-amber-500 to-orange-500', border: 'border-amber-200', text: 'text-amber-700', glow: 'rgba(245,158,11,0.16)' },
};
const CARD_ICON: Record<string, string> = { harian: '📊', reject: '⚠️', deadline: '📅', telat: '⏰' };

export default function ProgressHubPage() {
  const [now, setNow] = useState<Date>(new Date());
  const [demo, setDemo] = useState('');
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has('demo')) setDemo('?demo=1');
  }, []);
  const clock = useMemo(() => `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, [now]);
  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${now.getDate()} ${MON_SHORT[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="fixed inset-0 overflow-hidden text-slate-800 select-none flex flex-col" style={{ background: '#ffffff' }}>
      <style>{`
        @keyframes hubgrad { to { background-position: 300% 0; } }
        @keyframes hubdrift { 0% { background-position: 0 0; } 100% { background-position: 26px 26px; } }
        @keyframes hubfade { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); } }
        .hub-grad { background: linear-gradient(90deg,#6366f1,#8b5cf6,#f59e0b,#6366f1); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: hubgrad 7s linear infinite; }
        .hub-card { animation: hubfade .55s cubic-bezier(.22,.61,.36,1) both; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 10px 30px -14px rgba(15,23,42,.18); }
      `}</style>
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(15,23,42,0.05) 1px, transparent 1px)', backgroundSize: '26px 26px', animation: 'hubdrift 6s linear infinite' }} />
      <div aria-hidden className="absolute -top-[14vh] -left-[8vw] rounded-full pointer-events-none" style={{ width: '44vw', height: '44vw', background: 'radial-gradient(circle, rgba(99,102,241,0.10), transparent 70%)' }} />
      <div aria-hidden className="absolute -bottom-[18vh] -right-[6vw] rounded-full pointer-events-none" style={{ width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(245,158,11,0.10), transparent 70%)' }} />

      {/* Header */}
      <header className="relative flex items-center justify-between px-[3vw] pt-[3vh]">
        <div className="flex items-center gap-[1.2vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/new%20logo.png" alt="AYRES" className="h-[5vh] w-auto object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div className="leading-none">
            <div className="hub-grad font-black tracking-[0.18em]" style={{ fontSize: 'clamp(24px,2.4vw,48px)' }}>AYRES</div>
            <div className="tracking-[0.42em] text-slate-400 font-semibold mt-[0.6vh]" style={{ fontSize: 'clamp(10px,0.85vw,16px)' }}>PRODUCTION LIVE</div>
          </div>
        </div>
        <div className="text-right leading-none">
          <div className="font-black text-slate-900 tabular-nums" style={{ fontSize: 'clamp(28px,3vw,60px)' }}>{clock}</div>
          <div className="text-slate-500 font-semibold mt-[0.6vh]" style={{ fontSize: 'clamp(11px,0.95vw,18px)' }}>{dateLabel}</div>
        </div>
      </header>

      {/* Title */}
      <div className="relative px-[3vw] mt-[2vh]">
        <h1 className="font-black tracking-tight text-slate-900" style={{ fontSize: 'clamp(26px,2.6vw,54px)' }}>Papan Progress Produksi</h1>
        <p className="text-slate-500 font-medium mt-[0.8vh]" style={{ fontSize: 'clamp(12px,1vw,20px)' }}>Pilih report untuk ditampilkan di layar. Semua update otomatis.</p>
      </div>

      {/* Cards */}
      <main className="relative flex-1 px-[3vw] py-[3vh]">
        <div className="grid grid-cols-2 gap-[2vw] h-full">
          {REPORTS.map((r, i) => {
            const a = CARD_ACCENT[r.slug];
            return (
              <a key={r.slug} href={`/progress/${r.slug}${demo}`} className={`hub-card group relative flex flex-col justify-between rounded-3xl border ${a.border} bg-white p-[2vw] overflow-hidden transition-transform hover:-translate-y-1`} style={{ animationDelay: `${i * 90}ms` }}>
                <div aria-hidden className="absolute -top-[8vh] -right-[3vw] rounded-full blur-2xl" style={{ width: '16vw', height: '16vw', background: a.glow }} />
                <div className="relative flex items-start justify-between">
                  <div className={`grid place-items-center rounded-2xl bg-gradient-to-br ${a.grad} text-white`} style={{ width: '4vw', height: '4vw', minWidth: 44, minHeight: 44, fontSize: 'clamp(18px,1.8vw,34px)' }}>{CARD_ICON[r.slug]}</div>
                  <span className={`font-black tabular-nums ${a.text}`} style={{ fontSize: 'clamp(30px,3.2vw,68px)' }}>{String(r.n).padStart(2, '0')}</span>
                </div>
                <div className="relative">
                  <h2 className="font-black text-slate-900 tracking-tight leading-none" style={{ fontSize: 'clamp(22px,2.2vw,46px)' }}>{r.title}</h2>
                  <p className="text-slate-500 font-medium mt-[1vh]" style={{ fontSize: 'clamp(12px,1vw,19px)' }}>{r.sub}</p>
                  <div className={`inline-flex items-center gap-[0.5vw] mt-[1.6vh] font-bold ${a.text}`} style={{ fontSize: 'clamp(12px,1vw,19px)' }}>
                    Buka report
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </main>

      <footer className="relative px-[3vw] pb-[2.5vh] text-slate-400 font-medium" style={{ fontSize: 'clamp(10px,0.85vw,15px)' }}>
        Tip: buka salah satu report lalu tekan <span className="font-bold text-slate-600">F11</span> untuk fullscreen di TV. Tambah <span className="font-bold text-slate-600">?demo=1</span> di URL untuk lihat contoh data.
      </footer>
    </div>
  );
}
