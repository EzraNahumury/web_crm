'use client';

export default function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
      </div>

      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] py-20 px-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-5">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Coming Soon</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Halaman {title.toLowerCase()} sedang dalam pengembangan dan akan segera tersedia.
        </p>
      </div>
    </div>
  );
}
