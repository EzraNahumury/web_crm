import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { computeDeadlineLock } from '@/lib/business-days';

// GET /api/crm/deadline-lock?month=YYYY-MM
//
// Returns every order whose tanggal_acc_proofing falls in the requested
// month, grouped by that ACC date. Also computes the deadline_lock for
// each order using the business-days rules so the client can render it
// without duplicating the logic.

type OrderRow = {
  id: number;
  no_order: string;
  customer_nama: string;
  pilihan_paket: string | null;
  deadline_lock: string | null;
  tanggal_acc_proofing: string;
  keterangan: string | null;
};

type ItemRow = { order_id: number; paket_nama: string | null; qty: number | null };
type OrderPromoRow = { order_id: number; promo_nama: string | null };

const MONTH_NAMES = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER',
];

function isoDate(v: string | Date | null | undefined): string {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month') || '';
    const m = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      return NextResponse.json({ success: false, error: 'Query param month=YYYY-MM required' }, { status: 400 });
    }
    const [, yearStr, monthStr] = m;
    const year = Number(yearStr);
    const monthNum = Number(monthStr); // 1-12
    const monthName = MONTH_NAMES[monthNum - 1] || '';

    // First/last day of the requested month (inclusive)
    const firstDay = `${yearStr}-${monthStr}-01`;
    const lastDayNum = new Date(year, monthNum, 0).getDate();
    const lastDay = `${yearStr}-${monthStr}-${String(lastDayNum).padStart(2, '0')}`;

    const orders = await query<OrderRow>(
      `SELECT id, no_order, customer_nama, pilihan_paket, deadline_lock,
              tanggal_acc_proofing, keterangan
         FROM orders
        WHERE tanggal_acc_proofing IS NOT NULL
          AND tanggal_acc_proofing BETWEEN ? AND ?
        ORDER BY tanggal_acc_proofing ASC, id ASC`,
      [firstDay, lastDay]
    );

    // No orders → return empty groups quickly.
    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        data: { month: monthParam, monthName, groups: [] },
      });
    }

    // Aggregate items (qty + paket) per order
    const orderIds = orders.map(o => o.id);
    const items = await query<ItemRow>(
      `SELECT order_id, paket_nama, qty
         FROM order_items
        WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds
    );
    const qtyByOrder = new Map<number, number>();
    const paketByOrder = new Map<number, string[]>();
    for (const it of items) {
      qtyByOrder.set(it.order_id, (qtyByOrder.get(it.order_id) || 0) + Number(it.qty || 0));
      if (it.paket_nama) {
        const arr = paketByOrder.get(it.order_id) || [];
        arr.push(String(it.paket_nama));
        paketByOrder.set(it.order_id, arr);
      }
    }

    // Aggregate bonus (promo names) per order
    const promos = await query<OrderPromoRow>(
      `SELECT op.order_id, p.nama AS promo_nama
         FROM order_promos op
         JOIN promo p ON p.id = op.promo_id
        WHERE op.order_id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds
    );
    const bonusByOrder = new Map<number, string[]>();
    for (const pr of promos) {
      if (!pr.promo_nama) continue;
      const arr = bonusByOrder.get(pr.order_id) || [];
      arr.push(String(pr.promo_nama));
      bonusByOrder.set(pr.order_id, arr);
    }

    // Holidays for the business-day calculator
    const holidayRows = await query<{ tanggal: string }>(
      'SELECT `tanggal` FROM `libur_nasional`'
    );
    const holidays = new Set(holidayRows.map(h => isoDate(h.tanggal)));

    // Compute deadline_lock per order + group by ACC date
    const groupsMap = new Map<string, {
      date: string;
      orders: {
        no_order: string;
        cust: string;
        qty: number;
        paket: string;
        bonus: string;
        ket: string;
        deadline_lock: string;
        pilihan_paket: string;
        stts: string;
      }[];
    }>();

    for (const o of orders) {
      const accIso = isoDate(o.tanggal_acc_proofing);
      if (!accIso) continue;
      const deadline = computeDeadlineLock({
        pilihanPaket: o.pilihan_paket,
        tanggalAccProofing: accIso,
        deadlineLock: o.deadline_lock,
        holidays,
      });
      const bucket = groupsMap.get(accIso) || { date: accIso, orders: [] };
      bucket.orders.push({
        no_order: o.no_order || '',
        cust: o.customer_nama || '',
        qty: qtyByOrder.get(o.id) || 0,
        paket: (paketByOrder.get(o.id) || []).join(', ') || '-',
        bonus: (bonusByOrder.get(o.id) || []).join(', ') || '',
        ket: o.keterangan || '',
        deadline_lock: deadline,
        pilihan_paket: o.pilihan_paket || '',
        stts: 'DEADLINE LOCK',
      });
      groupsMap.set(accIso, bucket);
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      data: { month: monthParam, monthName, groups },
    });
  } catch (err) {
    console.error('GET /api/crm/deadline-lock error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
