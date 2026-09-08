import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { computeDeadlineLock, hasJaket } from '@/lib/business-days';
import {
  computeCurrentStageDeadline,
  classifyLateDesign,
  DESIGN_STAGE_LABELS,
  type DesignStage,
} from '@/lib/design-durasi';
import { HIDE_ORDERS_BEFORE } from '@/lib/data-cutoff';

// GET /api/public/progress
//
// Public (no-auth) aggregation feed untuk 4 halaman report TV di
// /progress/harian, /progress/reject, /progress/deadline, /progress/telat.
// Semua dihitung server-side; tiap page cukup poll & render slice-nya.
//
//   harian   → poin harian per proses + SLA (design/proofing/perbanyak)
//   reject   → reject produksi (QC Panel Process / Sewing / QC Final)
//   deadline → deadline per tanggal (hari ini + 7 hari)
//   telat    → lewat deadline + H-3 (dipisah)

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BASE_RATE_POIN = 5000;
export const TARGET_POIN_HARIAN = 340;

// Stage produksi tempat reject bisa terjadi (report 3).
const REJECT_STAGES = ['QC Panel Process', 'Sewing', 'QC Final dan Packing'];
// Fase "perbanyak" = tahap produksi setelah layout siap sampai packing.
const PERBANYAK_STAGES = new Set([
  'Printing Layout', 'Approval Layout', 'Printing Process', 'Sublim Press',
  'Fabric Cutting', 'QC Panel Process', 'Sewing', 'QC Jersey', 'Steam Jersey',
  'Finishing', 'QC Final dan Packing',
]);
const PROOFING_STAGES = new Set(['Proofing']);

type PaketRate = { prefix: string; ra: number; rc: number };

function isoDate(v: unknown): string {
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
function jakartaNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}
function jakartaISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
function daysBetween(aISO: string, bISO: string): number {
  if (!aISO || !bISO) return 0;
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function parseData(raw: unknown): Record<string, number> {
  try {
    const o = JSON.parse(String(raw || '{}'));
    if (!o || typeof o !== 'object') return {};
    const out: Record<string, number> = {};
    for (const k of Object.keys(o)) out[k] = Number((o as Record<string, unknown>)[k]) || 0;
    return out;
  } catch { return {}; }
}
function poinOf(data: Record<string, number>, rates: PaketRate[]): { poin: number; pcs: number } {
  let poin = 0, pcs = 0;
  for (const r of rates) {
    const a = Number(data[`${r.prefix}_atasan`]) || 0;
    const c = Number(data[`${r.prefix}_celana`]) || 0;
    poin += a * (r.ra / BASE_RATE_POIN) + c * (r.rc / BASE_RATE_POIN);
    pcs += a + c;
  }
  return { poin, pcs };
}
// Klasifikasi vs deadline final: terlambat kalau sudah lewat, warning kalau
// ≤3 hari lagi, aman selebihnya (atau belum ada deadline).
function classifyDeadline(deadlineISO: string, todayISO: string): 'aman' | 'warning' | 'terlambat' {
  if (!deadlineISO) return 'aman';
  const d = daysBetween(todayISO, deadlineISO);
  if (d < 0) return 'terlambat';
  if (d <= 3) return 'warning';
  return 'aman';
}

type ProgRow = { customer: string; tanggal: unknown; realisasi_json: unknown };
async function progressProcess(table: string, label: string, rates: PaketRate[], todayISO: string, monthStart: string, monthEnd: string) {
  const rows = await query<ProgRow>(
    `SELECT customer, tanggal, realisasi_json FROM \`${table}\` WHERE tanggal BETWEEN ? AND ?`,
    [monthStart, monthEnd],
  ).catch(() => [] as ProgRow[]);
  let todayPoin = 0, todayPcs = 0, todayOrders = 0, monthPoin = 0;
  for (const r of rows) {
    const { poin, pcs } = poinOf(parseData(r.realisasi_json), rates);
    monthPoin += poin;
    if (isoDate(r.tanggal) === todayISO) { todayPoin += poin; todayPcs += pcs; todayOrders += 1; }
  }
  return { key: table.replace('progress_', ''), label, todayPoin, todayPcs, todayOrders, monthPoin };
}

export async function GET() {
  try {
    const now = jakartaNow();
    const todayISO = jakartaISO(now);
    const monthStart = `${todayISO.slice(0, 7)}-01`;
    const lastDayNum = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${todayISO.slice(0, 7)}-${String(lastDayNum).padStart(2, '0')}`;

    // ── Paket rates ──────────────────────────────────────────────────────
    const paketRows = await query<{ kolom_prefix: string; rate_atasan: number; rate_celana: number }>(
      'SELECT kolom_prefix, rate_atasan, rate_celana FROM line_jahit_paket ORDER BY urutan ASC',
    ).catch(() => []);
    const rates: PaketRate[] = paketRows.map(p => ({
      prefix: String(p.kolom_prefix), ra: Number(p.rate_atasan) || BASE_RATE_POIN, rc: Number(p.rate_celana) || BASE_RATE_POIN,
    }));
    if (rates.length === 0) rates.push({ prefix: 'standar', ra: 5000, rc: 5000 }, { prefix: 'klasik', ra: 7000, rc: 6000 }, { prefix: 'pro', ra: 8500, rc: 6000 });

    // ── Poin harian per proses ───────────────────────────────────────────
    const [printing, press, cutting, steam, finishing, shipment] = await Promise.all([
      progressProcess('progress_printing', 'Printing', rates, todayISO, monthStart, monthEnd),
      progressProcess('progress_press', 'Press', rates, todayISO, monthStart, monthEnd),
      progressProcess('progress_cutting', 'Cutting', rates, todayISO, monthStart, monthEnd),
      progressProcess('progress_steam', 'Steam', rates, todayISO, monthStart, monthEnd),
      progressProcess('progress_finishing', 'Finishing', rates, todayISO, monthStart, monthEnd),
      progressProcess('progress_shipment', 'Shipment', rates, todayISO, monthStart, monthEnd),
    ]);
    const jahitRows = await query<Record<string, unknown>>('SELECT * FROM line_jahit WHERE tanggal BETWEEN ? AND ?', [monthStart, monthEnd]).catch(() => []);
    let jTodayPoin = 0, jTodayPcs = 0, jTodayOrders = 0, jMonthPoin = 0;
    for (const r of jahitRows) {
      const data: Record<string, number> = {};
      for (const rt of rates) { data[`${rt.prefix}_atasan`] = Number(r[`${rt.prefix}_atasan`]) || 0; data[`${rt.prefix}_celana`] = Number(r[`${rt.prefix}_celana`]) || 0; }
      const { poin, pcs } = poinOf(data, rates);
      jMonthPoin += poin;
      if (isoDate(r.tanggal) === todayISO) { jTodayPoin += poin; jTodayPcs += pcs; jTodayOrders += 1; }
    }
    const jahit = { key: 'jahit', label: 'Jahit', todayPoin: jTodayPoin, todayPcs: jTodayPcs, todayOrders: jTodayOrders, monthPoin: jMonthPoin };
    const processes = [printing, press, cutting, jahit, steam, finishing, shipment].map(p => ({
      ...p, todayPoin: Math.round(p.todayPoin * 10) / 10, monthPoin: Math.round(p.monthPoin * 10) / 10,
      pct: Math.min(100, Math.round((p.todayPoin / TARGET_POIN_HARIAN) * 100)),
    }));
    const totalTodayPoin = Math.round(processes.reduce((s, p) => s + p.todayPoin, 0) * 10) / 10;

    // ── Master data untuk deadline / reject / SLA ────────────────────────
    const holidayRows = await query<{ tanggal: unknown }>('SELECT `tanggal` FROM `libur_nasional`').catch(() => []);
    const holidays = new Set(holidayRows.map(h => isoDate(h.tanggal)));

    type OrderRow = {
      id: number; no_order: string; customer_nama: string; pilihan_paket: string | null;
      deadline_lock: string | Date | null; tanggal_acc_proofing: string | Date | null;
      status_terkirim: number | null; design_stage: string | null;
      design_awal_at: unknown; design_stage_started_at: unknown;
    };
    const [orders, items, stages, workOrders] = await Promise.all([
      query<OrderRow>(
        `SELECT id, no_order, customer_nama, pilihan_paket, deadline_lock, tanggal_acc_proofing,
                status_terkirim, design_stage, design_awal_at, design_stage_started_at
           FROM orders WHERE (tanggal_order IS NULL OR tanggal_order >= ?)`, [HIDE_ORDERS_BEFORE]).catch(() => [] as OrderRow[]),
      query<{ order_id: number; paket_nama: string | null; qty: number | null }>(
        'SELECT order_id, paket_nama, qty FROM order_items').catch(() => []),
      query<{ id: number; nama: string; urutan: number }>('SELECT id, nama, urutan FROM production_stages').catch(() => []),
      query<{ id: number; order_id: number; customer_nama: string; current_stage_id: number | null }>(
        'SELECT id, order_id, customer_nama, current_stage_id FROM work_orders').catch(() => []),
    ]);

    const qtyByOrder = new Map<number, number>();
    const paketByOrder = new Map<number, string[]>();
    for (const it of items) {
      qtyByOrder.set(it.order_id, (qtyByOrder.get(it.order_id) || 0) + Number(it.qty || 0));
      if (it.paket_nama) { const arr = paketByOrder.get(it.order_id) || []; arr.push(String(it.paket_nama)); paketByOrder.set(it.order_id, arr); }
    }
    const orderById = new Map<number, OrderRow>();
    for (const o of orders) orderById.set(o.id, o);
    const stageById = new Map<number, { nama: string; urutan: number }>();
    for (const s of stages) stageById.set(s.id, { nama: String(s.nama), urutan: Number(s.urutan) });

    const deadlineOf = (o: OrderRow): string => computeDeadlineLock({
      pilihanPaket: o.pilihan_paket, tanggalAccProofing: isoDate(o.tanggal_acc_proofing),
      deadlineLock: o.deadline_lock, holidays, isJaket: hasJaket(paketByOrder.get(o.id) || []),
    });

    // ── 4. Deadline per tanggal (hari ini → +7 hari, total 8 hari) ───────
    // ── 5. Lewat deadline + H-3 (dipisah) ───────────────────────────────
    const upcomingMap = new Map<string, { date: string; count: number; qty: number; orders: { cust: string; qty: number; paket: string; noOrder: string }[] }>();
    const overdue: { cust: string; noOrder: string; deadline: string; qty: number; daysLate: number }[] = [];
    const h3: { cust: string; noOrder: string; deadline: string; qty: number; daysLeft: number }[] = [];
    for (const o of orders) {
      if (!o.tanggal_acc_proofing) continue;
      if (Number(o.status_terkirim) === 1) continue;
      if (String(o.design_stage || '') === 'REJECTED') continue;
      const deadline = deadlineOf(o);
      if (!deadline) continue;
      const qty = qtyByOrder.get(o.id) || 0;
      const diff = daysBetween(todayISO, deadline);
      const cust = o.customer_nama || '-';
      if (diff < 0) overdue.push({ cust, noOrder: o.no_order || '', deadline, qty, daysLate: -diff });
      else if (diff <= 3) h3.push({ cust, noOrder: o.no_order || '', deadline, qty, daysLeft: diff });
      if (diff >= 0 && diff <= 7) {
        const b = upcomingMap.get(deadline) || { date: deadline, count: 0, qty: 0, orders: [] };
        b.count += 1; b.qty += qty;
        b.orders.push({ cust, qty, paket: (paketByOrder.get(o.id) || []).join(', ') || '-', noOrder: o.no_order || '' });
        upcomingMap.set(deadline, b);
      }
    }
    overdue.sort((a, b) => b.daysLate - a.daysLate);
    h3.sort((a, b) => a.daysLeft - b.daysLeft || b.qty - a.qty);
    const upcoming = Array.from(upcomingMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // ── 3. Reject produksi (per stage) ───────────────────────────────────
    const rejectRows = await query<{ id: number; created_at: unknown; status: string; stage_nama: string; wo_cust: string; order_id: number }>(
      `SELECT sr.id, sr.created_at, sr.status, ps.nama AS stage_nama, w.customer_nama AS wo_cust, w.order_id
         FROM stage_rejects sr
         JOIN production_stages ps ON ps.id = sr.stage_id
         LEFT JOIN work_orders w ON w.id = sr.work_order_id
        WHERE ps.nama IN (?, ?, ?)
        ORDER BY sr.created_at DESC
        LIMIT 200`, REJECT_STAGES).catch(() => []);
    const rejectItems = rejectRows.map(r => {
      const o = r.order_id ? orderById.get(Number(r.order_id)) : undefined;
      return {
        cust: (o?.customer_nama || r.wo_cust || '-'),
        proses: String(r.stage_nama),
        deadline: o ? deadlineOf(o) : '',
        jumlah: o ? (qtyByOrder.get(o.id) || 0) : 0,
        at: isoDate(r.created_at),
        status: String(r.status || ''),
      };
    });
    const rejectByProcess = REJECT_STAGES.map(proses => ({ proses, count: rejectItems.filter(r => r.proses === proses).length }));

    // ── 2b. SLA — Design (design-durasi) ─────────────────────────────────
    const activeStages: DesignStage[] = ['AWAL', 'PROSES', 'REVISI_1', 'REVISI_2', 'REVISI_3'];
    const designCounts = { aman: 0, warning: 0, terlambat: 0 };
    const designItems: { cust: string; stage: string; target: string; status: string }[] = [];
    for (const o of orders) {
      const stage = String(o.design_stage || '') as DesignStage;
      if (!activeStages.includes(stage)) continue;
      const awal = isoDate(o.design_awal_at);
      const started = isoDate(o.design_stage_started_at) || awal;
      const target = computeCurrentStageDeadline(started, stage, holidays, awal);
      const status = classifyLateDesign(target, todayISO);
      designCounts[status] += 1;
      designItems.push({ cust: o.customer_nama || '-', stage: DESIGN_STAGE_LABELS[stage] || stage, target, status });
    }
    const statusRank: Record<string, number> = { terlambat: 0, warning: 1, aman: 2 };
    designItems.sort((a, b) => (statusRank[a.status] - statusRank[b.status]) || a.target.localeCompare(b.target));

    // ── 2c. SLA — Proofing & Perbanyak (WO current stage vs deadline) ────
    const proofingCounts = { aman: 0, warning: 0, terlambat: 0 };
    const perbanyakCounts = { aman: 0, warning: 0, terlambat: 0 };
    const proofingItems: { cust: string; deadline: string; jumlah: number; status: string }[] = [];
    const perbanyakItems: { cust: string; deadline: string; jumlah: number; status: string; stage: string }[] = [];
    for (const w of workOrders) {
      const st = w.current_stage_id ? stageById.get(Number(w.current_stage_id)) : undefined;
      if (!st) continue;
      const o = w.order_id ? orderById.get(Number(w.order_id)) : undefined;
      if (o && Number(o.status_terkirim) === 1) continue;
      const cust = o?.customer_nama || w.customer_nama || '-';
      const deadline = o ? deadlineOf(o) : '';
      const jumlah = o ? (qtyByOrder.get(o.id) || 0) : 0;
      const status = classifyDeadline(deadline, todayISO);
      if (PROOFING_STAGES.has(st.nama)) {
        proofingCounts[status as keyof typeof proofingCounts] += 1;
        proofingItems.push({ cust, deadline, jumlah, status });
      } else if (PERBANYAK_STAGES.has(st.nama)) {
        perbanyakCounts[status as keyof typeof perbanyakCounts] += 1;
        perbanyakItems.push({ cust, deadline, jumlah, status, stage: st.nama });
      }
    }
    const byStatus = <T extends { status: string }>(arr: T[]) => arr.sort((a, b) => statusRank[a.status] - statusRank[b.status]);
    byStatus(proofingItems); byStatus(perbanyakItems);

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      today: todayISO,
      poin: { target: TARGET_POIN_HARIAN, processes, totalTodayPoin },
      deadline: { upcoming },
      urgent: { overdue, h3 },
      reject: { total: rejectItems.length, byProcess: rejectByProcess, items: rejectItems.slice(0, 60) },
      sla: {
        design: { counts: designCounts, items: designItems.slice(0, 40) },
        proofing: { counts: proofingCounts, items: proofingItems.slice(0, 40) },
        perbanyak: { counts: perbanyakCounts, items: perbanyakItems.slice(0, 40) },
      },
    });
  } catch (err) {
    console.error('GET /api/public/progress error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
