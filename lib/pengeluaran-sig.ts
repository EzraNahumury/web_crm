import { createHash } from 'crypto';

// Signature deterministik dari isi Real Pengeluaran Bahan sebuah WO.
// Dipakai untuk mendeteksi "ada perubahan kuantitas/bahan" pada WO yang sudah
// difinalisasi finance → auto-unfinalize. Harus identik antara:
//   - /api/wo/save-pengeluaran  (dihitung dari rows yang baru disimpan)
//   - /api/finance/finalize     (dihitung dari rows di DB wo_pengeluaran_bahan)
// Normalisasi: bahan & warna lower+trim, kuantitas numerik. Baris tanpa bahan
// atau kuantitas <= 0 diabaikan (sama seperti filter di save-pengeluaran).
// Urut agar urutan baris tidak memengaruhi hasil.
export interface SigRow { bahan?: string | null; warna?: string | null; kuantitas?: number | string | null }

export function pengeluaranSig(rows: SigRow[]): string {
  const parts = rows
    .map(r => ({
      bahan: String(r.bahan ?? '').trim().toLowerCase(),
      warna: String(r.warna ?? '').trim().toLowerCase(),
      q: Number(r.kuantitas) || 0,
    }))
    .filter(r => r.bahan && r.q > 0)
    .map(r => `${r.bahan}|${r.warna}|${r.q}`)
    .sort();
  return createHash('sha256').update(parts.join(';')).digest('hex');
}
