'use client';

// Merchandiser · Petunjuk — isi sheet "Petunjuk" dari tracker Excel.
const ALUR = 'DP Design → Design Awal → Revisi 1–3 → Design Fix → info DP Produksi & data detail customer → Proofing → Revisi Proofing 1–3 → Proofing Fix → Job Ticket diserahkan ke PPIC';

const SHEETS: { title: string; desc: string }[] = [
  { title: '1. Design', desc: 'Satu baris per customer yang sudah DP Design. Isi tanggal setiap kali design dikirim dan setiap kali customer membalas.' },
  { title: '2. Proofing', desc: 'Diisi setelah DP Produksi diterima. Ketik No. Order; nama customer dan tanggal DP Produksi terisi otomatis dari sheet Design.' },
  { title: '3. Job Ticket', desc: 'Ketik No. Order, lengkapi detail design, size, dan daftar nama-nomor, lalu cetak/ekspor dan serahkan ke PPIC.' },
  { title: '4. Ringkasan', desc: 'Angka KPI merchandiser terhitung otomatis dari Design dan Proofing.' },
];

const CATATAN: { t: string; d: string }[] = [
  { t: 'Menunggu balasan', d: 'Jumlah hari sejak kiriman terakhir belum dibalas customer. Oranye = 2 hari (follow-up kedua), merah = 3 hari atau lebih (telepon, kabari PPIC).' },
  { t: 'Revisi 3', d: 'Kolom Revisi 3 ditandai oranye sebagai pengingat: biaya dan dampak jadwal mengikuti kebijakan AYRES.' },
  { t: 'Kolom otomatis', d: 'Status, jumlah revisi, hari proses, dan hari menunggu dihitung otomatis — tidak perlu diisi manual.' },
];

export default function MerchPetunjukPage() {
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-fuchsia-500/[0.14] via-purple-500/[0.06] to-transparent p-5 sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-fuchsia-500/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Tracker Merchandiser AYRES</h1>
          <p className="text-[13px] text-slate-300 mt-1">Design, Proofing &amp; Job Ticket — pelacakan progres merchandiser.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
        <h2 className="text-sm font-bold text-white mb-2">Alur</h2>
        <p className="text-sm text-slate-300 leading-relaxed">{ALUR}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SHEETS.map(s => (
          <div key={s.title} className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5">
            <h3 className="text-sm font-bold text-fuchsia-200">Sheet {s.title}</h3>
            <p className="text-[13px] text-slate-400 mt-1 leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[#111827] border border-white/[0.06] p-5 space-y-3">
        <h2 className="text-sm font-bold text-white">Catatan Penting</h2>
        {CATATAN.map(c => (
          <div key={c.t} className="flex gap-3">
            <span className="w-2 h-2 rounded-full bg-fuchsia-400 mt-1.5 shrink-0" />
            <p className="text-[13px] text-slate-300"><strong className="text-white">{c.t}:</strong> {c.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
