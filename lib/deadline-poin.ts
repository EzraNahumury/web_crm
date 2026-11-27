// Sumber TUNGGAL perhitungan POIN Deadline CS Order.
//
// Dipakai bersama oleh:
//   • app/(protected)/orders/laporan-deadline/page.tsx  (tampilan + export)
//   • app/api/public/pic/route.ts  (target harian tracker produksi = poin
//     order yang DEADLINE-nya jatuh di tanggal itu)
//
// Supaya angka di Laporan Deadline dan TARGET di tracker produksi SELALU
// identik, semua rate + deteksi tier + rumus poin hidup di sini. Jangan
// duplikasi di tempat lain — import dari file ini.
//
// Poin per paket = ATASAN (tierRate) [+ CELANA bila INCLUDE_CELANA=true].
// Mode saat ini: ATASAN SAJA → PRO 10 pcs = 10×1,7 = 17.

// ── Rate ATASAN per tier (patokan CS / spreadsheet manual). ──────────────
export function tierRate(tier: string): number {
  switch (tier) {
    case 'WARRIOR': return 1.9;
    case 'PRO': return 1.7;
    case 'KLASIK': return 1.4;
    case 'STANDAR': return 1;
    case 'JAKET': return 1.9;
    case 'CELANA PRINT': return 1;
    case 'CELANA NON PRINT': return 1;
    case 'BENDERA': return 1;
    default: return 0;
  }
}

// ── Rate CELANA per tier — diambil dari master Sewing (line_jahit_paket.
// rate_celana ÷ 5000), supaya SAMA dengan poin celana di menu Sewing. ─────
export const LJ_BASE_RATE = 5000; // = BASE_RATE_POIN di menu Sewing
// JAKET & BENDERA tidak punya celana; CELANA PRINT / NON PRINT tier-nya
// memang celana jadi tidak ditambah komponen celana lagi (hindari dobel).
export const CELANA_EXCLUDE = new Set(['JAKET', 'BENDERA', 'CELANA PRINT', 'CELANA NON PRINT']);

// PER 2026-11-27 (keputusan Ezra, ikut Arya): poin Laporan Deadline = ATASAN
// SAJA, TANPA komponen celana. Contoh PRO 57 pcs = 57×1,7 = 96,9 (bukan 165,3).
// Ini satu-satunya saklar: ubah ke `true` untuk mengaktifkan lagi atasan+celana
// — otomatis berlaku di Laporan Deadline DAN target tracker produksi.
export const INCLUDE_CELANA = false;

// celanaMap: nama/kolom_prefix paket (UPPERCASE) → poin celana (rate/5000).
export function celanaRate(tier: string, celanaMap: Record<string, number>): number {
  if (!INCLUDE_CELANA) return 0;          // atasan-only → celana tidak dihitung
  if (!tier || CELANA_EXCLUDE.has(tier)) return 0;
  return celanaMap[tier] || 0;
}

// Bangun celanaMap dari baris master line_jahit_paket.
export function buildCelanaMap(
  paketRates: { nama?: unknown; kolom_prefix?: unknown; rate_celana?: unknown }[],
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of paketRates) {
    const rate = (Number(p.rate_celana) || 0) / LJ_BASE_RATE;
    const nama = String(p.nama || '').trim().toUpperCase();
    const prefix = String(p.kolom_prefix || '').trim().toUpperCase();
    if (nama) m[nama] = rate;
    if (prefix) m[prefix] = rate;
  }
  return m;
}

// ── Deteksi tier + variant dari nama paket order. tier '' = tidak terdeteksi
// (bukan Standar/Klasik/Pro/Warrior → di Laporan Deadline dipilih manual). ──
export function detectPaket(names: string[]): { tier: string; display: string } {
  for (const raw of names) {
    const s = String(raw || '').toUpperCase();
    let tier = '';
    if (/WARRIOR|WARIOR/.test(s)) tier = 'WARRIOR';
    else if (/\bPRO\b/.test(s)) tier = 'PRO';
    else if (/KLASIK|CLASSIC/.test(s)) tier = 'KLASIK';
    else if (/STANDAR|STANDARD/.test(s)) tier = 'STANDAR';
    if (tier) {
      const mv = s.match(/PAKET\s+([A-E])/) || s.match(/\b([A-E])\s*$/);
      const variant = mv ? mv[1] : '';
      return { tier, display: variant ? `${tier} ${variant}` : tier };
    }
  }
  return { tier: '', display: '' };
}

export const TIER_OPTIONS = ['STANDAR', 'KLASIK', 'PRO', 'WARRIOR', 'JAKET', 'CELANA PRINT', 'CELANA NON PRINT', 'BENDERA'];

const round1 = (n: number) => Math.round(n * 10) / 10;

// Total POIN satu order (atasan + celana), MENGECUALIKAN aksesoris.
// Mereplikasi persis logika Laporan Deadline: item dikelompokkan per tier
// (variant A-E) → poin per baris dibulatkan 1 desimal → dijumlah → dibulatkan.
// Item yang tier-nya tidak terdeteksi memakai manualTier (orders.deadline_paket_tier).
export function computeOrderPoin(params: {
  items: { paket_nama?: unknown; qty?: unknown }[];
  manualTier: string;
  aksesorisSet: Set<string>;        // nama aksesoris (lowercase+trim)
  celanaMap: Record<string, number>;
}): number {
  const { items, aksesorisSet, celanaMap } = params;
  const mTier = TIER_OPTIONS.includes(String(params.manualTier || '').toUpperCase())
    ? String(params.manualTier).toUpperCase() : '';

  // Kelompokkan per display (tier+variant), persis seperti baris di halaman.
  const detByDisplay = new Map<string, { tier: string; qty: number }>();
  let undetQty = 0;
  for (const it of items) {
    const nm = String(it.paket_nama || '');
    if (aksesorisSet.has(nm.trim().toLowerCase())) continue; // aksesoris tidak dihitung
    const q = Number(it.qty) || 0;
    const det = detectPaket([nm]);
    if (det.tier) {
      const g = detByDisplay.get(det.display);
      if (g) g.qty += q;
      else detByDisplay.set(det.display, { tier: det.tier, qty: q });
    } else {
      undetQty += q;
    }
  }

  const lines: { tier: string; qty: number }[] = Array.from(detByDisplay.values());
  if (undetQty > 0 || lines.length === 0) lines.push({ tier: mTier, qty: undetQty });

  let sum = 0;
  for (const l of lines) {
    if (!l.tier) continue;
    sum += round1(l.qty * (tierRate(l.tier) + celanaRate(l.tier, celanaMap)));
  }
  return round1(sum);
}
