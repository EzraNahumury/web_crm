'use client';

export default function RealPengeluaranBahanPage() {
  return <ComingSoon title="Real Pengeluaran Bahan" desc="Laporan aktual bahan yang keluar dari gudang per WO / periode." />;
}

function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="min-h-[60vh] grid place-items-center px-6 py-10">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/25 grid place-items-center mx-auto mb-5">
          <svg className="w-8 h-8 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 17.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
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
