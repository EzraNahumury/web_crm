import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  classifyLayanan,
  computeDeadlineLock,
  hasJaket,
  subtractBusinessDays,
} from '@/lib/business-days';
import { HIDE_ORDERS_BEFORE } from '@/lib/data-cutoff';

// GET /api/crm/finishing?date=YYYY-MM-DD
// Returns every uncompleted order whose deadline_lock falls in the week
// containing `date` (Sunday..Saturday) OR earlier (overdue rows stick to
// the current week's board until they're checked off). Deadline_lock is
// computed on the fly for Reguler/Express via computeDeadlineLock, and
// read from orders.deadline_lock for Prioritas.

type OrderRow = {
  id: number;
  no_order: string | null;
  customer_nama: string | null;
  nama_tim: string | null;
  pilihan_paket: string | null;
  tanggal_acc_proofing: string | Date | null;
  deadline_lock: string | Date | null;
};
type ItemRow = { order_id: number; paket_nama: string | null; qty: number | null };
type PromoRow = { order_id: number; promo_nama: string | null };
type FinishingRow = {
  id: number;
  order_id: number;
  keterangan: string | null;
  completed_at: string | Date | null;
};

function isoDate(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function parseYmd(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Compute the Sunday..Saturday week that contains this date. Returns
// { start, end } as YYYY-MM-DD strings.
function weekBounds(iso: string): { start: string; end: string } {
  const d = parseYmd(iso);
  const dow = d.getDay(); // 0 = Sunday
  const start = new Date(d);
  start.setDate(d.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const toIso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: toIso(start), end: toIso(end) };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date') || '';
    const m = dateParam.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return NextResponse.json({ success: false, error: 'Query param date=YYYY-MM-DD required' }, { status: 400 });
    }

    const { start: weekStart, end: weekEnd } = weekBounds(dateParam);

    // Apply cutoff (lib/data-cutoff.ts) supaya konsisten dengan menu lain.
    const orders = await query<OrderRow>(
      `SELECT id, no_order, customer_nama, nama_tim, pilihan_paket,
              tanggal_acc_proofing, deadline_lock
         FROM orders
        WHERE (tanggal_acc_proofing IS NOT NULL OR deadline_lock IS NOT NULL)
          AND (tanggal_order IS NULL OR tanggal_order >= ?)`,
      [HIDE_ORDERS_BEFORE]
    );

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        data: { weekStart, weekEnd, rows: [] },
      });
    }

    const orderIds = orders.map(o => o.id);

    const [items, promos, finishing, holidayRows] = await Promise.all([
      query<ItemRow>(
        `SELECT order_id, paket_nama, qty FROM order_items
          WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
        orderIds
      ),
      query<PromoRow>(
        `SELECT op.order_id, p.nama AS promo_nama
           FROM order_promos op JOIN promo p ON p.id = op.promo_id
          WHERE op.order_id IN (${orderIds.map(() => '?').join(',')})`,
        orderIds
      ),
      query<FinishingRow>(
        `SELECT id, order_id, keterangan, completed_at FROM crm_finishing
          WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
        orderIds
      ),
      query<{ tanggal: string | Date }>('SELECT tanggal FROM libur_nasional'),
    ]);

    // Aggregate items + promos per order
    const qtyByOrder = new Map<number, number>();
    const paketByOrder = new Map<number, string[]>();
    for (const it of items) {
      qtyByOrder.set(it.order_id, (qtyByOrder.get(it.order_id) || 0) + Number(it.qty || 0));
      if (it.paket_nama) (paketByOrder.get(it.order_id) || paketByOrder.set(it.order_id, []).get(it.order_id))!.push(String(it.paket_nama));
    }
    const bonusByOrder = new Map<number, string[]>();
    for (const p of promos) {
      if (!p.promo_nama) continue;
      (bonusByOrder.get(p.order_id) || bonusByOrder.set(p.order_id, []).get(p.order_id))!.push(String(p.promo_nama));
    }
    const finByOrder = new Map<number, FinishingRow>();
    for (const f of finishing) finByOrder.set(f.order_id, f);

    const holidays = new Set(holidayRows.map(h => isoDate(h.tanggal)));

    // Build rows: compute deadline_lock, DL (deadline - 3 business days),
    // and filter to (deadline_lock <= weekEnd) AND (not completed).
    const rows = orders
      .map(o => {
        const finRow = finByOrder.get(o.id);
        if (finRow?.completed_at) return null; // already checked → moved to history
        const deadline = computeDeadlineLock({
          pilihanPaket: o.pilihan_paket,
          tanggalAccProofing: o.tanggal_acc_proofing,
          deadlineLock: o.deadline_lock,
          holidays,
          isJaket: hasJaket(paketByOrder.get(o.id) || []),
        });
        if (!deadline) return null; // no deadline info yet
        if (deadline > weekEnd) return null; // future week — skip
        const dl = subtractBusinessDays(deadline, 3, holidays);
        return {
          order_id: o.id,
          no_order: o.no_order || '',
          cust: o.customer_nama || '',
          tim: o.nama_tim || '',
          qty: qtyByOrder.get(o.id) || 0,
          paket: (paketByOrder.get(o.id) || []).join(', ') || '-',
          bonus: (bonusByOrder.get(o.id) || []).join(', ') || '',
          keterangan: finRow?.keterangan || '',
          finishing_id: finRow?.id || null,
          pilihan_paket: o.pilihan_paket || '',
          layanan_kind: classifyLayanan(o.pilihan_paket),
          dl,                     // deadline_lock - 3 business days
          deadline_real: deadline, // the raw deadline lock
          is_overdue: deadline < weekStart,
          stts: 'DEADLINE LOCK',
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Sort: prioritas → express → reguler → unknown, then by deadline asc
    const rank: Record<string, number> = { prioritas: 0, express: 1, reguler: 2, unknown: 3 };
    rows.sort((a, b) => {
      const r = (rank[a.layanan_kind] ?? 3) - (rank[b.layanan_kind] ?? 3);
      if (r !== 0) return r;
      return a.deadline_real.localeCompare(b.deadline_real);
    });

    return NextResponse.json({
      success: true,
      data: { weekStart, weekEnd, rows },
    });
  } catch (err) {
    console.error('GET /api/crm/finishing error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
