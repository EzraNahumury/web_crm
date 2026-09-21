'use client';

// Papan gabungan /progress/all — menampilkan keempat report bergantian
// otomatis tiap 30 detik (Hasil Kerja Harian → Reject → Deadline → Lewat).
// Hub /progress dan tiap halaman report tetap seperti apa adanya.

import { useEffect, useState, type ComponentType } from 'react';
import {
  useProgressFeed, ReportFrame, LoadingBody,
  PoinSlaBody, RejectBody, DeadlineBody, TelatBody,
  type Feed, type ReportSlug,
} from '@/components/progress/kit';

const SLIDE_MS = 30_000; // pindah report tiap 30 detik

const SLIDES: { slug: ReportSlug; Body: ComponentType<{ feed: Feed }> }[] = [
  { slug: 'harian', Body: PoinSlaBody },
  { slug: 'reject', Body: RejectBody },
  { slug: 'deadline', Body: DeadlineBody },
  { slug: 'telat', Body: TelatBody },
];

export default function ProgressAllPage() {
  const { feed, now, secsAgo, live } = useProgressFeed();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  const cur = SLIDES[idx];
  const Body = cur.Body;

  const indicator = (
    <div className="flex items-center gap-[0.55vw] rounded-full bg-slate-100 border border-slate-200 px-[0.8vw] py-[0.5vh]">
      <span className="font-bold text-slate-500 uppercase tracking-wide" style={{ fontSize: 'clamp(9px,0.72vw,13px)' }}>Auto · 30s</span>
      <span className="flex items-center gap-[0.3vw]">
        {SLIDES.map((s, i) => (
          <span key={s.slug} className="rounded-full transition-all duration-500" style={{ width: i === idx ? '1.4vw' : '0.6vw', height: '0.6vw', minHeight: 6, background: i === idx ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : '#cbd5e1' }} />
        ))}
      </span>
    </div>
  );

  return (
    <ReportFrame slug={cur.slug} now={now} live={live} secsAgo={secsAgo} titleExtra={feed ? indicator : null}>
      {feed ? (
        <div key={idx} className="tv-fade h-full">
          <Body feed={feed} />
        </div>
      ) : <LoadingBody />}
    </ReportFrame>
  );
}
