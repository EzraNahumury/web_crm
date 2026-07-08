import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/crm/finishing/history?month=YYYY-MM
// Returns every crm_finishing row that was checked off in the given month,
// enriched with the order details (customer, qty, paket, bonus). Sorted
// most-recent first.

type HistRow = {
  id: number;
  order_id: number;
  keterangan: string | null;
  completed_at: string | Date;
  no_order: string | null;
  customer_nama: string | null;
  nama_tim: string | null;
  pilihan_paket: string | null;
};
type ItemRow = { order_id: number; paket_nama: string | null; qty: number | null };
type PromoRow = { order_id: number; promo_nama: string | null };

function toIsoDateTime(v: string | Date | null): string {
  if (!v) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.toISOString();
  }
  return String(v);
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
    const monthNum = Number(monthStr);
    const first = `${yearStr}-${monthStr}-01 00:00:00`;
    const lastDayNum = new Date(year, monthNum, 0).getDate();
    const last = `${yearStr}-${monthStr}-${String(lastDayNum).padStart(2, '0')} 23:59:59`;

    const rows = await query<HistRow>(
      `SELECT f.id, f.order_id, f.keterangan, f.completed_at,
              o.no_order, o.customer_nama, o.nama_tim, o.pilihan_paket
         FROM crm_finishing f
         JOIN orders o ON o.id = f.order_id
        WHERE f.completed_at IS NOT NULL
          AND f.completed_at BETWEEN ? AND ?
        ORDER BY f.completed_at DESC`,
      [first, last]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: true, data: { month: monthParam, rows: [] } });
    }

    const orderIds = rows.map(r => r.order_id);
    const [items, promos] = await Promise.all([
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
    ]);
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

    const data = rows.map(r => ({
      finishing_id: r.id,
      order_id: r.order_id,
      no_order: r.no_order || '',
      cust: r.customer_nama || '',
      tim: r.nama_tim || '',
      qty: qtyByOrder.get(r.order_id) || 0,
      paket: (paketByOrder.get(r.order_id) || []).join(', ') || '-',
      bonus: (bonusByOrder.get(r.order_id) || []).join(', ') || '',
      keterangan: r.keterangan || '',
      pilihan_paket: r.pilihan_paket || '',
      completed_at: toIsoDateTime(r.completed_at),
    }));

    return NextResponse.json({ success: true, data: { month: monthParam, rows: data } });
  } catch (err) {
    console.error('GET /api/crm/finishing/history error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
