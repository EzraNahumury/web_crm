// Estimasi durasi tiap tahap Antrian Design (dalam hari kerja).
//
// Baseline (day 0) = tanggal Finance approve DP Design
// (orders.design_awal_at).
//
// Flow:
//   Waiting List       (SLA 3 hari — order baru approve Finance,
//                       belum dipegang designer)
//   Design Awal        (SLA 2 hari — designer mulai kerja)
//   Design Revisi 1    (+1 hari kumulatif)
//   Design Revisi 2    (+1 hari kumulatif)
//   Design Revisi 3    (+1 hari kumulatif)
//   SELESAI            (terminal — order pindah ke CS Order)
//
// Total SLA maksimal = 3 + 2 + 1 + 1 + 1 = 8 hari kerja kalau semua
// stage dipakai. Kalau CS klik 'Selesai' langsung dari Design Awal
// (atau bahkan Waiting List), order langsung SELESAI tanpa lewat revisi.

import { addBusinessDays } from './business-days';

// Semua key sesuai enum orders.design_stage. WAITING = baru approve
// Finance, belum di-pegang designer. AWAL = designer mulai kerja.
export type DesignStage = 'WAITING' | 'AWAL' | 'REVISI_1' | 'REVISI_2' | 'REVISI_3' | 'SELESAI';

// Label yang tampil di UI.
export const DESIGN_STAGE_LABELS: Record<DesignStage, string> = {
  WAITING: 'Waiting List',
  AWAL: 'Design Awal',
  REVISI_1: 'Design Revisi 1',
  REVISI_2: 'Design Revisi 2',
  REVISI_3: 'Design Revisi 3',
  SELESAI: 'Selesai',
};

// Urutan stage untuk hitung target selesai + navigasi tab.
export const DESIGN_STAGE_ORDER: DesignStage[] = [
  'WAITING',
  'AWAL',
  'REVISI_1',
  'REVISI_2',
  'REVISI_3',
  'SELESAI',
];

// Durasi tiap stage dalam hari kerja. SELESAI durasi 0 karena terminal.
export const DESIGN_DURATIONS: Record<DesignStage, number> = {
  WAITING: 3,
  AWAL: 2,
  REVISI_1: 1,
  REVISI_2: 1,
  REVISI_3: 1,
  SELESAI: 0,
};

/**
 * Target tanggal untuk tiap stage berdasarkan tanggal baseline (Finance
 * approve DP Design). Return map stage → ISO date.
 */
export function computeDesignStageTargets(
  baselineISO: string,
  holidays: Set<string>,
): Record<DesignStage, string> {
  const out = {} as Record<DesignStage, string>;
  if (!baselineISO) return out;
  let cursor = baselineISO;
  for (const stage of DESIGN_STAGE_ORDER) {
    const d = DESIGN_DURATIONS[stage] ?? 0;
    cursor = d > 0 ? addBusinessDays(cursor, d, holidays) : cursor;
    out[stage] = cursor;
  }
  return out;
}

/**
 * Total hari kerja maksimal dari Waiting List → Revisi 3.
 * SELESAI tidak dihitung karena durasi 0.
 */
export function totalDurasiDesign(): number {
  return DESIGN_STAGE_ORDER.reduce((s, k) => s + DESIGN_DURATIONS[k], 0);
}

/**
 * Deadline stage SAAT INI, dihitung dari kapan order masuk stage
 * tersebut (bukan dari baseline design_awal_at).
 *
 * Kenapa: kalau order lama tertinggal di Awal lalu baru dipindah ke
 * Revisi 1 hari ini, seharusnya operator dapat 1 hari kerja fresh
 * untuk Revisi 1, bukan langsung terlambat karena target REVISI_1
 * dari baseline sudah lewat.
 *
 * Parameter:
 *   stageStartedISO — tanggal saat order masuk stage saat ini
 *                     (dari orders.design_stage_started_at). Kalau
 *                     null / kosong, fallback ke baselineISO.
 *   stage           — nama stage saat ini.
 *   baselineISO     — fallback kalau stageStartedISO kosong. Biasanya
 *                     dipakai untuk stage WAITING yang mulai dari finance
 *                     approve DP Design.
 */
export function computeCurrentStageDeadline(
  stageStartedISO: string,
  stage: DesignStage,
  holidays: Set<string>,
  baselineISO?: string,
): string {
  const start = stageStartedISO || baselineISO || '';
  if (!start) return '';
  const d = DESIGN_DURATIONS[stage] ?? 0;
  if (d <= 0) return start;
  return addBusinessDays(start, d, holidays);
}

export type LateStatus = 'aman' | 'warning' | 'terlambat';

export function classifyLateDesign(
  targetISO: string,
  todayISO: string,
): LateStatus {
  if (!targetISO || !todayISO) return 'aman';
  if (todayISO > targetISO) return 'terlambat';
  if (todayISO === targetISO) return 'warning';
  return 'aman';
}

/**
 * Cari stage berikutnya untuk aksi 'Butuh Revisi'.
 * Design Awal → Revisi 1 → Revisi 2 → Revisi 3.
 * Waiting List tidak bisa langsung ke Revisi (harus lewat Awal dulu).
 * Kalau sudah di Revisi 3, tidak bisa Butuh Revisi lagi (null).
 */
export function nextRevisiStage(current: DesignStage): DesignStage | null {
  const flow: Record<DesignStage, DesignStage | null> = {
    WAITING: null,
    AWAL: 'REVISI_1',
    REVISI_1: 'REVISI_2',
    REVISI_2: 'REVISI_3',
    REVISI_3: null,
    SELESAI: null,
  };
  return flow[current];
}
