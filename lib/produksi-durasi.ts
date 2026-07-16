// Estimasi durasi tiap tahap produksi (dalam hari kerja) untuk hitung
// "target selesai" per WO. Hari kerja mengikuti aturan business-days.ts:
// Minggu skip, Sabtu tetap kerja, plus libur nasional.
//
// Baseline (day 0) = tanggal Approval Design mulai (wo_progress row
// 'Approval Design' status TERSEDIA).
//
// Tiga stage same-day (QC Jersey, Steam Jersey, QC Final dan Packing)
// pakai durasi 0 — dilakukan di hari yang sama dengan stage sebelumnya.
//
// Stage pre-produksi (Waiting List, Approval WO) dan pasca (Shipment)
// tidak menambah hari; mereka bukan bagian dari SLA produksi.

import { addBusinessDays } from './business-days';

export const STAGE_DURATIONS: Record<string, number> = {
  'Approval Design': 0,        // baseline — hari H
  'Approval Pattern': 1,
  'Proofing': 1,
  'Approval WO': 0,            // gate admin, tidak masuk hitungan produksi
  'Printing Layout': 2,
  'Approval Layout': 1,
  'Printing Process': 1,
  'Sublim Press': 1,
  'Fabric Cutting': 1,
  'QC Panel Process': 1,
  'Sewing': 3,
  'QC Jersey': 0,              // same-day dengan Sewing
  'Steam Jersey': 0,           // same-day dengan Sewing
  'Finishing': 2,
  'QC Final dan Packing': 0,   // same-day dengan Finishing
};

// Urutan resmi produksi yang dihitung untuk target selesai. Waiting
// List + Shipment sengaja tidak masuk.
export const STAGE_ORDER: string[] = [
  'Approval Design',
  'Approval Pattern',
  'Proofing',
  'Approval WO',
  'Printing Layout',
  'Approval Layout',
  'Printing Process',
  'Sublim Press',
  'Fabric Cutting',
  'QC Panel Process',
  'Sewing',
  'QC Jersey',
  'Steam Jersey',
  'Finishing',
  'QC Final dan Packing',
];

/**
 * Hitung target tanggal selesai (per stage) berdasarkan tanggal mulai
 * Approval Design. Return map stageName → ISO date target.
 *
 * @param startISO tanggal Approval Design mulai (YYYY-MM-DD)
 * @param holidays set libur nasional
 */
export function computeStageTargets(
  startISO: string,
  holidays: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!startISO) return out;
  let cursor = startISO;
  for (const stage of STAGE_ORDER) {
    const d = STAGE_DURATIONS[stage] ?? 0;
    cursor = d > 0 ? addBusinessDays(cursor, d, holidays) : cursor;
    out[stage] = cursor;
  }
  return out;
}

/**
 * Target selesai keseluruhan WO (QC Final dan Packing) berdasarkan
 * tanggal Approval Design mulai.
 */
export function computeTargetSelesai(
  approvalDesignStartISO: string,
  holidays: Set<string>,
): string {
  const targets = computeStageTargets(approvalDesignStartISO, holidays);
  return targets['QC Final dan Packing'] || '';
}

/**
 * Total hari kerja yang dibutuhkan dari Approval Design sampai QC Final.
 * Dihitung dari STAGE_DURATIONS supaya konsisten kalau angkanya berubah.
 */
export function totalDurasiHariKerja(): number {
  return STAGE_ORDER.reduce((sum, s) => sum + (STAGE_DURATIONS[s] ?? 0), 0);
}

/**
 * Klasifikasi status vs target per stage.
 *   'aman'  → belum lewat target
 *   'warning' → sudah dekat/di hari-H target
 *   'terlambat' → sudah lewat target
 */
export type LateStatus = 'aman' | 'warning' | 'terlambat';

export function classifyLate(
  targetISO: string,
  todayISO: string,
): LateStatus {
  if (!targetISO || !todayISO) return 'aman';
  if (todayISO > targetISO) return 'terlambat';
  if (todayISO === targetISO) return 'warning';
  return 'aman';
}
