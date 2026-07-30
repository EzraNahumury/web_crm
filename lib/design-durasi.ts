// Estimasi durasi tiap tahap Antrian Design (dalam hari kerja).
//
// Baseline (day 0) = tanggal Finance approve DP Design
// (orders.design_awal_at).
//
// Flow:
//   Waiting List       (SLA 3 hari — order baru masuk setelah Finance
//                       approve. Kode enum tetap 'AWAL' supaya data
//                       existing tidak perlu di-migrate.)
//   Design Awal        (SLA 2 hari — designer mulai kerja. Kode enum
//                       'PROSES'. Transisi manual: designer klik
//                       'Mulai Proses' di kartu Waiting List.)
//   Design Revisi 1    (+1 hari kumulatif)
//   Design Revisi 2    (+1 hari kumulatif)
//   Design Revisi 3    (+1 hari kumulatif)
//   SELESAI            (terminal — order pindah ke CS Order)
//
// Total SLA maksimal = 3 + 2 + 1 + 1 + 1 = 8 hari kerja kalau semua
// stage dipakai.
//
// Kenapa kode 'AWAL' dipakai untuk Waiting List, bukan bikin kode baru:
//   • Approval Finance sudah lama nulis design_stage='AWAL' → tidak
//     perlu ubah + tidak perlu migration data existing.
//   • 'AWAL' konsisten sebagai "titik masuk queue" — cuma label yang
//     berubah dari 'Design Awal' → 'Waiting List'.
//   • Stage kedua ('Design Awal' sekarang) pakai kode baru 'PROSES'
//     supaya jelas ini stage "sedang diproses designer".

import { addBusinessDays } from './business-days';

// Semua key sesuai enum orders.design_stage.
export type DesignStage = 'AWAL' | 'PROSES' | 'REVISI_1' | 'REVISI_2' | 'REVISI_3' | 'SELESAI';

// Label yang tampil di UI.
export const DESIGN_STAGE_LABELS: Record<DesignStage, string> = {
  AWAL: 'Waiting List',
  PROSES: 'Design Awal',
  REVISI_1: 'Design Revisi 1',
  REVISI_2: 'Design Revisi 2',
  REVISI_3: 'Design Revisi 3',
  SELESAI: 'Selesai',
};

// Urutan stage untuk hitung target selesai + navigasi tab.
export const DESIGN_STAGE_ORDER: DesignStage[] = [
  'AWAL',
  'PROSES',
  'REVISI_1',
  'REVISI_2',
  'REVISI_3',
  'SELESAI',
];

// Durasi tiap stage dalam hari kerja. SELESAI durasi 0 karena terminal.
export const DESIGN_DURATIONS: Record<DesignStage, number> = {
  AWAL: 3,
  PROSES: 2,
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
 *                     dipakai untuk stage AWAL yang mulai dari finance
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
 * PROSES (Design Awal) → REVISI_1 → REVISI_2 → REVISI_3.
 * AWAL (Waiting List) tidak bisa langsung ke Revisi — harus lewat
 * 'Mulai Proses' dulu ke PROSES. Kalau sudah di Revisi 3, tidak bisa
 * Butuh Revisi lagi (null).
 */
export function nextRevisiStage(current: DesignStage): DesignStage | null {
  const flow: Record<DesignStage, DesignStage | null> = {
    AWAL: null,
    PROSES: 'REVISI_1',
    REVISI_1: 'REVISI_2',
    REVISI_2: 'REVISI_3',
    REVISI_3: null,
    SELESAI: null,
  };
  return flow[current];
}
