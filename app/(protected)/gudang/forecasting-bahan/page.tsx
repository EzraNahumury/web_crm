'use client';

export default function ForecastingBahanPage() {
  return <ComingSoon title="Forecasting Bahan" desc="Prediksi kebutuhan bahan berdasarkan tren produksi & antrian order." />;
}

function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="min-h-[60vh] grid place-items-center px-6 py-10">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/25 grid place-items-center mx-auto mb-5">
          <svg className="w-8 h-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
        <p className="text-sm text-slate-400 mb-6">{desc}</p>
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-full px-4 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Coming Soon
        </span>
      </div>
    </div>
  );
}
