// Estimasi durasi tiap tahap Antrian Design (dalam hari kerja).
//
// Baseline (day 0) = tanggal Finance approve DP Design
// (orders.design_awal_at).
//
// Flow:
//   Design Awal        (SLA 3 hari — baseline)
//   Design Revisi 1    (+1 hari kumulatif)
//   Design Revisi 2    (+1 hari kumulatif)
//   Design Revisi 3    (+1 hari kumulatif)
//   SELESAI            (terminal — order pindah ke CS Order)
//
// Total SLA maksimal = 6 hari kerja kalau semua stage revisi dipakai.
// Kalau CS klik 'Selesai' langsung dari Design Awal, order langsung
// SELESAI tanpa harus lewat revisi.

import { addBusinessDays } from './business-days';

// Semua key sesuai enum orders.design_stage.
export type DesignStage = 'AWAL' | 'REVISI_1' | 'REVISI_2' | 'REVISI_3' | 'SELESAI';

// Label yang tampil di UI.
export const DESIGN_STAGE_LABELS: Record<DesignStage, string> = {
  AWAL: 'Design Awal',
  REVISI_1: 'Design Revisi 1',
  REVISI_2: 'Design Revisi 2',
  REVISI_3: 'Design Revisi 3',
  SELESAI: 'Selesai',
};

// Urutan stage untuk hitung target selesai + navigasi tab.
export const DESIGN_STAGE_ORDER: DesignStage[] = [
  'AWAL',
  'REVISI_1',
  'REVISI_2',
  'REVISI_3',
  'SELESAI',
];

// Durasi tiap stage dalam hari kerja. SELESAI durasi 0 karena terminal.
export const DESIGN_DURATIONS: Record<DesignStage, number> = {
  AWAL: 3,
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
 * Total hari kerja maksimal dari Design Awal → Revisi 3.
 * SELESAI tidak dihitung karena durasi 0.
 */
export function totalDurasiDesign(): number {
  return DESIGN_STAGE_ORDER.reduce((s, k) => s + DESIGN_DURATIONS[k], 0);
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
 * Kalau sudah di Revisi 3, tidak bisa Butuh Revisi lagi (null).
 */
export function nextRevisiStage(current: DesignStage): DesignStage | null {
  const flow: Record<DesignStage, DesignStage | null> = {
    AWAL: 'REVISI_1',
    REVISI_1: 'REVISI_2',
    REVISI_2: 'REVISI_3',
    REVISI_3: null,
    SELESAI: null,
  };
  return flow[current];
}
