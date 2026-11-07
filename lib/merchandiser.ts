// Logika tracker Merchandiser — terjemahan persis rumus dari file
// Tracker-Merchandiser-AYRES.xlsx (sheet 1. Design & 2. Proofing).
// Semua kolom "abu-abu/otomatis" di Excel dihitung di sini supaya UI tidak
// perlu menyimpan nilai turunan (sumber kebenaran = kolom manual).

export interface MerchDesignRow {
  id?: number;
  no_order: string;
  tgl_dp_design: string;        // 'YYYY-MM-DD' | ''
  nama_customer: string;
  no_wa: string;
  pic_cs: string;
  desainer: string;
  design_awal_kirim: string;
  design_awal_feedback: string;
  rev1_kirim: string;
  rev1_feedback: string;
  rev2_kirim: string;
  rev2_feedback: string;
  rev3_kirim: string;
  rev3_feedback: string;
  design_fix: string;
  info_dp_produksi_kirim: string;
  dp_produksi_diterima: string;
  data_detail_lengkap: string;  // 'Ya' | 'Tidak' | ''
  catatan: string;
}

export interface MerchProofingRow {
  id?: number;
  no_order: string;
  proofing_kirim: string;
  proofing_feedback: string;
  rev1_kirim: string;
  rev1_feedback: string;
  rev2_kirim: string;
  rev2_feedback: string;
  rev3_kirim: string;
  rev3_feedback: string;
  proofing_fix: string;
  data_approve: string;         // 'Ya' | 'Tidak' | ''
  job_ticket_ppic: string;
  catatan: string;
}

// ── Helper tanggal ──────────────────────────────────────────────────────
// Serial hari (sejak epoch, UTC) dari 'YYYY-MM-DD'. null kalau kosong/invalid.
export function dSerial(iso: unknown): number | null {
  if (!iso) return null;
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const v = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(v) ? null : Math.floor(v / 86400000);
}
// Tanggal hari ini WIB sebagai 'YYYY-MM-DD'.
export function todayIsoWIB(): string {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
  catch {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }
}
// Normalisasi apa pun (Date/ISO string) ke 'YYYY-MM-DD' untuk <input type=date>.
export function toDateInput(v: unknown): string {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Tampilan tanggal ringkas 'dd/mm/yyyy'.
export function fmtTgl(v: unknown): string {
  const iso = toDateInput(v);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// MAX dari beberapa tanggal (serial); 0 kalau semua kosong — meniru MAX() Excel
// yang memperlakukan sel kosong sebagai 0.
function maxSerial(isos: string[]): number {
  let mx = 0;
  for (const s of isos) { const v = dSerial(s); if (v != null && v > mx) mx = v; }
  return mx;
}
function countFilled(isos: string[]): number {
  let n = 0;
  for (const s of isos) if (dSerial(s) != null) n++;
  return n;
}

// ── Sheet 1. Design — kolom otomatis ────────────────────────────────────
// Q: Jumlah Revisi = COUNT(J,L,N) = jumlah tanggal "Revisi N Kirim" yang terisi.
export function designJumlahRevisi(r: MerchDesignRow): number {
  return countFilled([r.rev1_kirim, r.rev2_kirim, r.rev3_kirim]);
}
// R: Hari DP Design → Design Fix = P - C (kalau keduanya terisi).
export function designHari(r: MerchDesignRow): number | '' {
  const c = dSerial(r.tgl_dp_design), p = dSerial(r.design_fix);
  return c != null && p != null ? p - c : '';
}
// S: Menunggu Balasan (hari). Kosong kalau sudah Design Fix / belum ada kiriman.
// Kalau kiriman terakhir > balasan terakhir → TODAY - kiriman terakhir.
export function designMenunggu(r: MerchDesignRow, todayIso = todayIsoWIB()): number | '' {
  if (!r.no_order || dSerial(r.design_fix) != null) return '';
  const lastKirim = maxSerial([r.design_awal_kirim, r.rev1_kirim, r.rev2_kirim, r.rev3_kirim]);
  if (lastKirim === 0) return '';
  const lastFeedback = maxSerial([r.design_awal_feedback, r.rev1_feedback, r.rev2_feedback, r.rev3_feedback]);
  if (lastKirim > lastFeedback) {
    const today = dSerial(todayIso)!;
    return today - lastKirim;
  }
  return '';
}
// W: Status.
export function designStatus(r: MerchDesignRow): string {
  if (!r.no_order) return '';
  if (dSerial(r.dp_produksi_diterima) != null) {
    return r.data_detail_lengkap === 'Ya' ? 'Lanjut ke Proofing' : 'DP Produksi masuk - data belum lengkap';
  }
  if (dSerial(r.design_fix) != null) return 'Design Fix - tunggu DP Produksi';
  if (dSerial(r.rev3_kirim) != null) return 'Revisi 3';
  if (dSerial(r.rev2_kirim) != null) return 'Revisi 2';
  if (dSerial(r.rev1_kirim) != null) return 'Revisi 1';
  if (dSerial(r.design_awal_kirim) != null) return 'Design Awal dikirim';
  return 'Antre Desain';
}

// ── Sheet 2. Proofing — kolom otomatis ──────────────────────────────────
// N: Jumlah Revisi Proofing = COUNT(G,I,K).
export function proofingJumlahRevisi(r: MerchProofingRow): number {
  return countFilled([r.rev1_kirim, r.rev2_kirim, r.rev3_kirim]);
}
// P: Menunggu Balasan (hari).
export function proofingMenunggu(r: MerchProofingRow, todayIso = todayIsoWIB()): number | '' {
  if (!r.no_order || dSerial(r.proofing_fix) != null) return '';
  const lastKirim = maxSerial([r.proofing_kirim, r.rev1_kirim, r.rev2_kirim, r.rev3_kirim]);
  if (lastKirim === 0) return '';
  const lastFeedback = maxSerial([r.proofing_feedback, r.rev1_feedback, r.rev2_feedback, r.rev3_feedback]);
  if (lastKirim > lastFeedback) {
    const today = dSerial(todayIso)!;
    return today - lastKirim;
  }
  return '';
}
// Q: Hari DP Produksi → Proofing Fix = M - D (D = tgl DP Produksi dari sheet Design).
export function proofingHari(r: MerchProofingRow, dpProduksiIso: string): number | '' {
  const d = dSerial(dpProduksiIso), m = dSerial(r.proofing_fix);
  return d != null && m != null ? m - d : '';
}
// S: Status.
export function proofingStatus(r: MerchProofingRow): string {
  if (!r.no_order) return '';
  if (dSerial(r.job_ticket_ppic) != null) return 'Diserahkan ke PPIC';
  if (dSerial(r.proofing_fix) != null && r.data_approve === 'Ya') return 'Siap Job Ticket';
  if (dSerial(r.proofing_fix) != null) return 'Proofing Fix - data belum approve';
  if (dSerial(r.rev3_kirim) != null) return 'Revisi Proofing 3';
  if (dSerial(r.rev2_kirim) != null) return 'Revisi Proofing 2';
  if (dSerial(r.rev1_kirim) != null) return 'Revisi Proofing 1';
  if (dSerial(r.proofing_kirim) != null) return 'Proofing dikirim';
  return 'Antre Proofing';
}

// Warna status untuk badge UI (kelas Tailwind).
export function statusColor(status: string): string {
  if (status.includes('Lanjut ke Proofing') || status.includes('Siap Job Ticket') || status.includes('Diserahkan ke PPIC'))
    return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25';
  if (status.includes('belum lengkap') || status.includes('belum approve')) return 'text-rose-300 bg-rose-500/15 border-rose-500/25';
  if (status.includes('Revisi 3') || status.includes('Revisi Proofing 3')) return 'text-orange-300 bg-orange-500/15 border-orange-500/25';
  if (status.includes('Revisi') || status.includes('tunggu DP Produksi')) return 'text-amber-300 bg-amber-500/15 border-amber-500/25';
  if (status.includes('Antre')) return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  return 'text-sky-300 bg-sky-500/15 border-sky-500/25';
}
