// Business-day utilities for the CRM Deadline Lock calculation.
//
// Rules (from the biz stakeholder):
//   - Sunday is NOT a working day.
//   - Saturday IS a working day.
//   - Any date in `libur_nasional` is not a working day.
//   - Reguler = ACC proofing date + 21 working days.
//   - Express - N hari = ACC proofing date + N working days.
//   - Prioritas = whatever CS typed into orders.deadline_lock (no computation).
//
// All dates are handled as YYYY-MM-DD strings so the caller can safely round
// trip through JSON / MySQL DATE columns without picking up timezone drift.

export function addBusinessDays(startISO: string, count: number, holidays: Set<string>): string {
  if (!startISO || count <= 0) return startISO;
  // Parse as local midnight so setDate math stays in a single timezone.
  const [y, m, d] = startISO.split('-').map(Number);
  const cursor = new Date(y, (m || 1) - 1, d || 1);
  let added = 0;
  while (added < count) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay(); // 0 = Sunday
    if (dow === 0) continue;
    const iso = toIsoDate(cursor);
    if (holidays.has(iso)) continue;
    added++;
  }
  return toIsoDate(cursor);
}

// Walk backwards N working days from startISO. Skip Sundays and any date
// in `holidays`. Used to compute CRM Finishing's "DL" (deadline lock
// minus 3 working days).
export function subtractBusinessDays(startISO: string, count: number, holidays: Set<string>): string {
  if (!startISO || count <= 0) return startISO;
  const [y, m, d] = startISO.split('-').map(Number);
  const cursor = new Date(y, (m || 1) - 1, d || 1);
  let subtracted = 0;
  while (subtracted < count) {
    cursor.setDate(cursor.getDate() - 1);
    const dow = cursor.getDay();
    if (dow === 0) continue;
    const iso = toIsoDate(cursor);
    if (holidays.has(iso)) continue;
    subtracted++;
  }
  return toIsoDate(cursor);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// pilihan_paket stored as e.g. "Reguler", "Prioritas", "Express - 3 hari",
// "Express - 10 - 12 hari". Return the WORST-case (largest) number of days
// out of the string so the lock date is a delivery commitment we can meet.
export function parseExpressDurasi(pilihanPaket: string): number {
  if (!pilihanPaket) return 0;
  const nums = pilihanPaket.match(/\d+/g);
  if (!nums || nums.length === 0) return 0;
  return Math.max(...nums.map(n => Number(n)));
}

export type LayananKind = 'reguler' | 'express' | 'prioritas' | 'unknown';

export function classifyLayanan(pilihanPaket: string | null | undefined): LayananKind {
  if (!pilihanPaket) return 'unknown';
  const p = pilihanPaket.toLowerCase();
  if (p.startsWith('reguler')) return 'reguler';
  if (p.startsWith('prioritas')) return 'prioritas';
  if (p.startsWith('express')) return 'express';
  return 'unknown';
}

// Compute the deadline lock for one order. Returns YYYY-MM-DD or '' when
// there's not enough info (e.g. Prioritas without a stored deadline).
export function computeDeadlineLock(args: {
  pilihanPaket: string | null | undefined;
  tanggalAccProofing: string | Date | null | undefined;
  deadlineLock: string | Date | null | undefined;
  holidays: Set<string>;
}): string {
  const kind = classifyLayanan(args.pilihanPaket);
  if (kind === 'prioritas') {
    return normalizeIso(args.deadlineLock);
  }
  const acc = normalizeIso(args.tanggalAccProofing);
  if (!acc) return '';
  if (kind === 'reguler') return addBusinessDays(acc, 21, args.holidays);
  if (kind === 'express') {
    const n = parseExpressDurasi(args.pilihanPaket || '');
    return n > 0 ? addBusinessDays(acc, n, args.holidays) : '';
  }
  return '';
}

// Normalize a MySQL DATE value (either a string or a Date object — mysql2
// defaults to Date at local midnight) to YYYY-MM-DD.
function normalizeIso(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    const mo = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
