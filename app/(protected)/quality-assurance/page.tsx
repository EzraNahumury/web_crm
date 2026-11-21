'use client';

// Quality Assurance — placeholder. Menu baru, isi menyusul.
export default function QualityAssurancePage() {
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-teal-500/[0.14] via-emerald-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Quality Assurance</h1>
          <p className="text-[13px] text-slate-300 mt-1">Kontrol kualitas produksi — modul menyusul.</p>
        </div>
      </div>
      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-10 text-center">
        <p className="text-sm text-slate-300 font-medium">Menu Quality Assurance masih kosong.</p>
        <p className="text-xs text-slate-500 mt-1">Fitur akan ditambahkan menyusul. Beri tahu tim dev isi yang diinginkan.</p>
      </div>
    </div>
  );
}
