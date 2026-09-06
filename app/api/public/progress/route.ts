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
// Public (no-auth) aggregation feed for the TV progress board at /progress.
// Everything is computed server-side so the TV only polls one endpoint and
// paints. Read-only; no customer PII beyond names already shown internally.
//
// Reports bundled (see /progress page for the boards):
//   1. Poin harian per proses (Printing/Press/Cutting/Jahit/Shipment)
//   2. SLA Design (stage vs target hari kerja)
//   3. Reject customer, dipisah per proses
//   4. Deadline per tanggal (hasil closingan CS Order)
//   5. Lewat deadline + H-3 (customer belum terkirim)

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BASE_RATE_POIN = 5000;
export const TARGET_POIN_HARIAN = 340; // flat per proses, konsisten dgn Progress page

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

// Wall-clock date in Asia/Jakarta (WIB) regardless of server timezone.
function jakartaNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}
function jakartaISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
// Calendar days from a → b (b - a). Positive = b is later.
function daysBetween(aISO: string, bISO: string): number {
  if (!aISO || !bISO) return 0;
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
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

// Poin + pcs dari 1 baris data qty (map prefix_atasan / prefix_celana).
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

type ProgRow = { customer: string; tanggal: unknown; realisasi_json: unknown };

async function progressProcess(
  table: string,
  label: string,
  rates: PaketRate[],
  todayISO: string,
  monthStart: string,
  monthEnd: string,
) {
  const rows = await query<ProgRow>(
    `SELECT customer, tanggal, realisasi_json FROM \`${table}\`
      WHERE tanggal BETWEEN ? AND ?`,
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

    // ── Paket rates (poin) ───────────────────────────────────────────────
    const paketRows = await query<{ kolom_prefix: string; rate_atasan: number; rate_celana: number }>(
      'SELECT kolom_prefix, rate_atasan, rate_celana FROM line_jahit_paket ORDER BY urutan ASC',
    ).catch(() => []);
    const rates: PaketRate[] = paketRows.map(p => ({
      prefix: String(p.kolom_prefix),
      ra: Number(p.rate_atasan) || BASE_RATE_POIN,
      rc: Number(p.rate_celana) || BASE_RATE_POIN,
    }));
    // Fallback kalau config kosong.
    if (rates.length === 0) {
      rates.push({ prefix: 'standar', ra: 5000, rc: 5000 }, { prefix: 'klasik', ra: 7000, rc: 6000 }, { prefix: 'pro', ra: 8500, rc: 6000 });
    }

    // ── 1. Poin harian per proses ────────────────────────────────────────
    const [printing, press, cutting, shipment] = await Promise.all([
      progressProcess('progress_printing', 'Printing', rates, todayISO, monthStart, monthEnd),
      progressProcess('progress_press', 'Press', rates, todayISO, monthStart, monthEnd),
      progressProcess('progress_cutting', 'Cutting', rates, todayISO, monthStart, monthEnd),
      progressProcess('progress_shipment', 'Shipment', rates, todayISO, monthStart, monthEnd),
    ]);
    // Jahit — kolom fixed di line_jahit (bukan realisasi_json).
    const jahitRows = await query<Record<string, unknown>>(
      'SELECT * FROM line_jahit WHERE tanggal BETWEEN ? AND ?',
      [monthStart, monthEnd],
    ).catch(() => []);
    let jTodayPoin = 0, jTodayPcs = 0, jTodayOrders = 0, jMonthPoin = 0;
    for (const r of jahitRows) {
      const data: Record<string, number> = {};
      for (const rt of rates) {
        data[`${rt.prefix}_atasan`] = Number(r[`${rt.prefix}_atasan`]) || 0;
        data[`${rt.prefix}_celana`] = Number(r[`${rt.prefix}_celana`]) || 0;
      }
      const { poin, pcs } = poinOf(data, rates);
      jMonthPoin += poin;
      if (isoDate(r.tanggal) === todayISO) { jTodayPoin += poin; jTodayPcs += pcs; jTodayOrders += 1; }
    }
    const jahit = { key: 'jahit', label: 'Jahit', todayPoin: jTodayPoin, todayPcs: jTodayPcs, todayOrders: jTodayOrders, monthPoin: jMonthPoin };

    const processes = [printing, press, cutting, jahit, shipment].map(p => ({
      ...p,
      todayPoin: Math.round(p.todayPoin * 10) / 10,
      monthPoin: Math.round(p.monthPoin * 10) / 10,
      pct: Math.min(100, Math.round((p.todayPoin / TARGET_POIN_HARIAN) * 100)),
    }));
    const totalTodayPoin = Math.round(processes.reduce((s, p) => s + p.todayPoin, 0) * 10) / 10;

    // ── Holidays (untuk deadline + SLA) ──────────────────────────────────
    const holidayRows = await query<{ tanggal: unknown }>('SELECT `tanggal` FROM `libur_nasional`').catch(() => []);
    const holidays = new Set(holidayRows.map(h => isoDate(h.tanggal)));

    // ── Orders aktif (belum terkirim, sudah ACC proofing) ────────────────
    type OrderRow = {
      id: number; no_order: string; customer_nama: string;
      pilihan_paket: string | null; deadline_lock: string | Date | null; tanggal_acc_proofing: string | Date | null;
    };
    const activeOrders = await query<OrderRow>(
      `SELECT id, no_order, customer_nama, pilihan_paket, deadline_lock, tanggal_acc_proofing
         FROM orders
        WHERE tanggal_acc_proofing IS NOT NULL
          AND (status_terkirim IS NULL OR status_terkirim = 0)
          AND (design_stage IS NULL OR design_stage <> 'REJECTED')
          AND (tanggal_order IS NULL OR tanggal_order >= ?)`,
      [HIDE_ORDERS_BEFORE],
    ).catch(() => []);

    // qty + paket per order (untuk jaket detection + tampilan).
    const activeIds = activeOrders.map(o => o.id);
    const qtyByOrder = new Map<number, number>();
    const paketByOrder = new Map<number, string[]>();
    if (activeIds.length > 0) {
      const items = await query<{ order_id: number; paket_nama: string | null; qty: number | null }>(
        `SELECT order_id, paket_nama, qty FROM order_items WHERE order_id IN (${activeIds.map(() => '?').join(',')})`,
        activeIds,
      ).catch(() => []);
      for (const it of items) {
        qtyByOrder.set(it.order_id, (qtyByOrder.get(it.order_id) || 0) + Number(it.qty || 0));
        if (it.paket_nama) {
          const arr = paketByOrder.get(it.order_id) || [];
          arr.push(String(it.paket_nama));
          paketByOrder.set(it.order_id, arr);
        }
      }
    }

    type Computed = { o: OrderRow; deadline: string; qty: number; paket: string };
    const computed: Computed[] = [];
    for (const o of activeOrders) {
      const deadline = computeDeadlineLock({
        pilihanPaket: o.pilihan_paket,
        tanggalAccProofing: isoDate(o.tanggal_acc_proofing),
        deadlineLock: o.deadline_lock,
        holidays,
        isJaket: hasJaket(paketByOrder.get(o.id) || []),
      });
      if (!deadline) continue;
      computed.push({
        o, deadline,
        qty: qtyByOrder.get(o.id) || 0,
        paket: (paketByOrder.get(o.id) || []).join(', ') || '-',
      });
    }

    // ── 4. Deadline per tanggal (upcoming: hari ini → +21 hari) ──────────
    const upcomingMap = new Map<string, { date: string; count: number; qty: number; orders: { cust: string; qty: number; paket: string; noOrder: string }[] }>();
    // ── 5. Lewat deadline + H-3 ──────────────────────────────────────────
    const overdue: { cust: string; noOrder: string; deadline: string; qty: number; paket: string; daysLate: number }[] = [];
    const h3: { cust: string; noOrder: string; deadline: string; qty: number; paket: string; daysLeft: number }[] = [];

    for (const c of computed) {
      const diff = daysBetween(todayISO, c.deadline); // >0 future, <0 past
      const entry = {
        cust: c.o.customer_nama || '-', noOrder: c.o.no_order || '',
        deadline: c.deadline, qty: c.qty, paket: c.paket,
      };
      if (diff < 0) {
        overdue.push({ ...entry, daysLate: -diff });
      } else if (diff <= 3) {
        h3.push({ ...entry, daysLeft: diff });
      }
      // Upcoming board: hari ini sampai 21 hari ke depan.
      if (diff >= 0 && diff <= 21) {
        const b = upcomingMap.get(c.deadline) || { date: c.deadline, count: 0, qty: 0, orders: [] };
        b.count += 1; b.qty += c.qty;
        b.orders.push({ cust: entry.cust, qty: c.qty, paket: c.paket, noOrder: entry.noOrder });
        upcomingMap.set(c.deadline, b);
      }
    }
    overdue.sort((a, b) => b.daysLate - a.daysLate);
    h3.sort((a, b) => a.daysLeft - b.daysLeft || b.qty - a.qty);
    const upcoming = Array.from(upcomingMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // ── 3. Reject per proses ─────────────────────────────────────────────
    // Saat ini reject ter-model di tahap Design (orders.design_stage=REJECTED).
    const rejectRows = await query<{ customer_nama: string; design_reject_reason: string | null; design_rejected_at: unknown }>(
      `SELECT customer_nama, design_reject_reason, design_rejected_at
         FROM orders
        WHERE design_stage = 'REJECTED'
          AND (tanggal_order IS NULL OR tanggal_order >= ?)
        ORDER BY design_rejected_at DESC
        LIMIT 60`,
      [HIDE_ORDERS_BEFORE],
    ).catch(() => []);
    const rejectItems = rejectRows.map(r => ({
      cust: r.customer_nama || '-',
      proses: 'Design',
      reason: r.design_reject_reason || '',
      at: isoDate(r.design_rejected_at),
    }));
    const rejectByProcessMap = new Map<string, number>();
    for (const r of rejectItems) rejectByProcessMap.set(r.proses, (rejectByProcessMap.get(r.proses) || 0) + 1);
    const rejectByProcess = Array.from(rejectByProcessMap.entries()).map(([proses, count]) => ({ proses, count }));

    // ── 2. SLA Design (stage vs target hari kerja) ───────────────────────
    const activeStages: DesignStage[] = ['AWAL', 'PROSES', 'REVISI_1', 'REVISI_2', 'REVISI_3'];
    const designRows = await query<{ customer_nama: string; design_stage: string; design_awal_at: unknown; design_stage_started_at: unknown }>(
      `SELECT customer_nama, design_stage, design_awal_at, design_stage_started_at
         FROM orders
        WHERE design_stage IN ('AWAL','PROSES','REVISI_1','REVISI_2','REVISI_3')
          AND (tanggal_order IS NULL OR tanggal_order >= ?)`,
      [HIDE_ORDERS_BEFORE],
    ).catch(() => []);
    const slaCounts = { aman: 0, warning: 0, terlambat: 0 };
    const stageCountMap = new Map<DesignStage, number>();
    const designItems: { cust: string; stage: string; target: string; status: string }[] = [];
    for (const r of designRows) {
      const stage = String(r.design_stage) as DesignStage;
      if (!activeStages.includes(stage)) continue;
      const awal = isoDate(r.design_awal_at);
      const started = isoDate(r.design_stage_started_at) || awal;
      const target = computeCurrentStageDeadline(started, stage, holidays, awal);
      const status = classifyLateDesign(target, todayISO); // aman|warning|terlambat
      slaCounts[status] += 1;
      stageCountMap.set(stage, (stageCountMap.get(stage) || 0) + 1);
      designItems.push({ cust: r.customer_nama || '-', stage: DESIGN_STAGE_LABELS[stage] || stage, target, status });
    }
    // Telat dulu, lalu warning, lalu aman.
    const statusRank: Record<string, number> = { terlambat: 0, warning: 1, aman: 2 };
    designItems.sort((a, b) => (statusRank[a.status] - statusRank[b.status]) || a.target.localeCompare(b.target));
    const designStages = activeStages
      .filter(s => stageCountMap.get(s))
      .map(s => ({ stage: DESIGN_STAGE_LABELS[s], count: stageCountMap.get(s) || 0 }));

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      today: todayISO,
      poin: { target: TARGET_POIN_HARIAN, processes, totalTodayPoin },
      deadline: { upcoming },
      urgent: { overdue, h3 },
      reject: { total: rejectItems.length, byProcess: rejectByProcess, items: rejectItems.slice(0, 40) },
      sla: { design: { counts: slaCounts, stages: designStages, items: designItems.slice(0, 40) } },
    });
  } catch (err) {
    console.error('GET /api/public/progress error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
