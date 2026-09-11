'use client';
import { useEffect, useState } from 'react';
import { useProgressFeed, ReportFrame, LoadingBody, PoinSlaBody, ReportTableBody } from '@/components/progress/kit';

const SLIDE_MS = 30_000; // pindah slide tiap 30 detik

export default function ProgressHarianPage() {
  const { feed, now, secsAgo, live } = useProgressFeed();
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % 2), SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  const indicator = (
    <div className="flex items-center gap-[0.55vw] rounded-full bg-slate-100 border border-slate-200 px-[0.8vw] py-[0.5vh]">
      <span className="font-bold text-slate-500 uppercase tracking-wide" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>{slide === 0 ? 'Ringkasan' : 'Rekap 7 Hari'}</span>
      <span className="flex items-center gap-[0.3vw]">
        {[0, 1].map(i => (
          <span key={i} className="rounded-full transition-all duration-500" style={{ width: i === slide ? '1.5vw' : '0.6vw', height: '0.6vw', minHeight: 6, background: i === slide ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : '#cbd5e1' }} />
        ))}
      </span>
    </div>
  );

  return (
    <ReportFrame slug="harian" now={now} live={live} secsAgo={secsAgo} titleExtra={feed ? indicator : null}>
      {feed ? (
        <div key={slide} className="tv-fade h-full">
          {slide === 0 ? <PoinSlaBody feed={feed} /> : <ReportTableBody feed={feed} />}
        </div>
      ) : <LoadingBody />}
    </ReportFrame>
  );
}
