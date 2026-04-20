import { Order, Progress, RiskLevel } from './types';
import { STAGES } from './constants';

// ─── Capacity Allocation ─────────────────────────────────
export const NORMAL_CAP = 200;
export const EXTEND_CAP = 100;

export interface DayAllocation {
  dateKey: string;        // DD/MM/YYYY
  dateDisplay: string;    // "Sen, 2 Mar 2026"
  qty: number;
  pct: number;            // % of NORMAL_CAP (200) — kept for compat
  normalQty: number;      // min(qty, 200)
  extendQty: number;      // max(0, qty-200) capped at 100
  normalPct: number;      // 0–100 of 200
  extendPct: number;      // 0–100 of 100
  isNearFull: boolean;    // normalQty >= 150 && < 200
  isExtendFull: boolean;  // extendQty >= 100
  overExtendQty: number;  // qty beyond NORMAL_CAP + EXTEND_CAP (300)
  overExtendPct: number;  // 0–100+ relative to EXTEND_CAP
  customers: string[];
  isToday: boolean;
  isFull: boolean;        // normalQty >= 200
  isPast: boolean;        // before today
}

function parseDateStr(s: string): Date | null {
  if (!s) return null;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return new Date(+y, +m - 1, +d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function toDateKey(d: Date): string {
  const day = d.getDate(), mon = d.getMonth() + 1, yr = d.getFullYear();
  return `${day < 10 ? '0' : ''}${day}/${mon < 10 ? '0' : ''}${mon}/${yr}`;
}

/** Groups orders by their dpProduksi date (no overflow to next day). Used for leaderboard. */
export function computeScheduledAllocations(orders: Order[], days = 60): DayAllocation[] {
  const dailyMap: Record<string, { qty: number; customers: Set<string> }> = {};

  for (const order of orders) {
    const start = parseDateStr(order.dpProduksi) || new Date();
    start.setHours(0, 0, 0, 0);
    // If dpProduksi falls on Sunday, move to Monday
    while (start.getDay() === 0) start.setDate(start.getDate() + 1);
    const key = toDateKey(start);
    if (!dailyMap[key]) dailyMap[key] = { qty: 0, customers: new Set() };
    dailyMap[key].qty += order.qty;
    dailyMap[key].customers.add(order.customer);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);

  const allKeys = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    if (d.getDay() !== 0) allKeys.add(toDateKey(d)); // skip Sunday
  }
  Object.keys(dailyMap).forEach(k => allKeys.add(k));

  return Array.from(allKeys)
    .sort((a, b) => {
      const da = parseDateStr(a)!, db = parseDateStr(b)!;
      return da.getTime() - db.getTime();
    })
    .map(key => {
      const d = parseDateStr(key)!;
      const data = dailyMap[key] || { qty: 0, customers: new Set() };
      const normalQty = Math.min(data.qty, NORMAL_CAP);
      const extendQty = Math.min(Math.max(0, data.qty - NORMAL_CAP), EXTEND_CAP);
      const overExtendQty = Math.max(0, data.qty - NORMAL_CAP - EXTEND_CAP);
      const normalPct = Math.round((normalQty / NORMAL_CAP) * 100);
      return {
        dateKey: key,
        dateDisplay: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
        qty: data.qty,
        pct: normalPct,
        normalQty,
        extendQty,
        overExtendQty,
        normalPct,
        extendPct: extendQty > 0 ? Math.round((extendQty / EXTEND_CAP) * 100) : 0,
        overExtendPct: overExtendQty > 0 ? Math.min(Math.round((overExtendQty / EXTEND_CAP) * 100), 100) : 0,
        isNearFull: normalQty >= 150 && normalQty < NORMAL_CAP,
        isExtendFull: extendQty >= EXTEND_CAP,
        customers: Array.from(data.customers),
        isToday: key === todayKey,
        isFull: data.qty >= NORMAL_CAP,
        isPast: d < today,
      };
    });
}

/** Overflow-based allocation queue. Used for monthly calendar visualization. */
export function computeAllocations(orders: Order[], days = 45): DayAllocation[] {
  const TOTAL_CAP = NORMAL_CAP + EXTEND_CAP; // 300 pcs/day (200 normal + 100 extend)
  const dailyMap: Record<string, { qty: number; customers: Set<string> }> = {};

  const active = orders
    .slice()
    .sort((a, b) => {
      const da = parseDateStr(a.dpProduksi), db = parseDateStr(b.dpProduksi);
      if (!da && !db) return 0;
      if (!da) return 1; if (!db) return -1;
      return da.getTime() - db.getTime();
    });

  for (const order of active) {
    let remaining = order.qty;
    const start = parseDateStr(order.dpProduksi) || new Date();
    const cur = new Date(start); cur.setHours(0, 0, 0, 0);
    // Start on a working day
    while (cur.getDay() === 0) cur.setDate(cur.getDate() + 1);
    let safety = 0;
    while (remaining > 0 && safety++ < 500) {
      if (cur.getDay() === 0) { cur.setDate(cur.getDate() + 1); continue; } // skip Sunday
      const key = toDateKey(cur);
      if (!dailyMap[key]) dailyMap[key] = { qty: 0, customers: new Set() };
      const avail = TOTAL_CAP - dailyMap[key].qty;
      if (avail > 0) {
        const alloc = Math.min(remaining, avail);
        dailyMap[key].qty += alloc;
        dailyMap[key].customers.add(order.customer);
        remaining -= alloc;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);

  // Include today + next `days` working days AND all allocated days (past or future)
  const allKeys = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    if (d.getDay() !== 0) allKeys.add(toDateKey(d)); // skip Sunday
  }
  Object.keys(dailyMap).forEach(k => allKeys.add(k));

  return Array.from(allKeys)
    .sort((a, b) => {
      const da = parseDateStr(a)!, db = parseDateStr(b)!;
      return da.getTime() - db.getTime();
    })
    .map(key => {
      const d = parseDateStr(key)!;
      const data = dailyMap[key] || { qty: 0, customers: new Set() };
      const normalQty = Math.min(data.qty, NORMAL_CAP);
      const extendQty = Math.min(Math.max(0, data.qty - NORMAL_CAP), EXTEND_CAP);
      const normalPct = Math.round((normalQty / NORMAL_CAP) * 100);
      return {
        dateKey: key,
        dateDisplay: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
        qty: data.qty,
        pct: normalPct,
        normalQty,
        extendQty,
        normalPct,
        extendPct: extendQty > 0 ? Math.round((extendQty / EXTEND_CAP) * 100) : 0,
        overExtendQty: 0,
        overExtendPct: 0,
        isNearFull: normalQty >= 150 && normalQty < NORMAL_CAP,
        isExtendFull: extendQty >= EXTEND_CAP,
        customers: Array.from(data.customers),
        isToday: key === todayKey,
        isFull: data.qty >= NORMAL_CAP,
        isPast: d < today,
      };
    });
}

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function fmtDateParts(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, '0')} ${MONTHS_ID[month]} ${year}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === '-') return '-';
  try {
    // DD/MM/YYYY (spreadsheet format)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split('/');
      return fmtDateParts(+d, +m - 1, +y);
    }
    // YYYY-MM-DD (HTML date input)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-');
      return fmtDateParts(+d, +m - 1, +y);
    }
  } catch {}
  return dateStr;
}

export function toInputDate(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateStr;
}

export function fromInputDate(inputDate: string): string {
  if (!inputDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
    const [year, month, day] = inputDate.split('-');
    return `${day}/${month}/${year}`;
  }
  return inputDate;
}

export function calcDaysLeft(tglSelesai: string, dlCust?: string): number | null {
  const dateStr = tglSelesai || dlCust || '';
  if (!dateStr) return null;
  try {
    let d: Date;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      const [day, month, year] = dateStr.split('/');
      d = new Date(+year, +month - 1, +day);
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((d.getTime() - today.getTime()) / 86400000);
  } catch { return null; }
}

export function getStageIndex(progress: Progress): number {
  let last = -1;
  STAGES.forEach((s, i) => {
    if (progress[s.key as keyof Progress]) last = i;
  });
  return last;
}

export function calcRiskLevel(order: Order): RiskLevel {
  if (order.status === 'DONE') return 'SAFE';
  const daysLeft = order.daysLeft;
  if (daysLeft === null || daysLeft === undefined) return 'NORMAL';
  if (daysLeft < 0) return 'OVERDUE';
  if (daysLeft <= 3) {
    return getStageIndex(order.progress) <= 5 ? 'HIGH' : 'NEAR';
  }
  return 'NORMAL';
}

export function getProgressPercent(progress: Progress): number {
  const done = STAGES.filter(s => progress[s.key as keyof Progress]).length;
  return Math.round((done / STAGES.length) * 100);
}

export function getCurrentStage(progress: Progress): string {
  const idx = getStageIndex(progress);
  if (idx < 0) return 'Belum mulai';
  return STAGES[idx]?.label || '-';
}

export function normBagian(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim()
    .replace(/([A-Za-z])(body)\b/gi, '$1 $2')
    .toUpperCase();
}
