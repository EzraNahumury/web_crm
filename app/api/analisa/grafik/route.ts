import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Read-only analytics endpoint. Runs aggregation SELECTs against orders +
// order_items and returns rows for charting. No writes, no schema changes —
// existing data is untouched.
//
// Returns:
//   {
//     paket: [{ paket: string, total_qty: number, order_count: number }, ...]
//     provinsi: [{ provinsi: string, total_qty: number, customer_count: number, order_count: number }, ...]
//     totals: { orders, qty, paket_count, provinsi_count }
//   }
export async function GET() {
  try {
    const paket = await query<{ paket: string; total_qty: number; order_count: number }>(
      `SELECT
         oi.paket_nama AS paket,
         COALESCE(SUM(oi.qty), 0) AS total_qty,
         COUNT(DISTINCT oi.order_id) AS order_count
       FROM order_items oi
       WHERE oi.paket_nama IS NOT NULL AND TRIM(oi.paket_nama) <> ''
       GROUP BY oi.paket_nama
       ORDER BY total_qty DESC`
    );

    const provinsi = await query<{ provinsi: string; total_qty: number; customer_count: number; order_count: number }>(
      `SELECT
         o.customer_provinsi AS provinsi,
         COALESCE(SUM(oi.qty), 0) AS total_qty,
         COUNT(DISTINCT o.customer_id) AS customer_count,
         COUNT(DISTINCT o.id) AS order_count
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_provinsi IS NOT NULL AND TRIM(o.customer_provinsi) <> ''
       GROUP BY o.customer_provinsi
       ORDER BY total_qty DESC`
    );

    const totalOrders = paket.reduce((s, p) => s + Number(p.order_count || 0), 0);
    const totalQty = paket.reduce((s, p) => s + Number(p.total_qty || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        paket: paket.map(p => ({ ...p, total_qty: Number(p.total_qty), order_count: Number(p.order_count) })),
        provinsi: provinsi.map(p => ({
          ...p,
          total_qty: Number(p.total_qty),
          customer_count: Number(p.customer_count),
          order_count: Number(p.order_count),
        })),
        totals: {
          orders: totalOrders,
          qty: totalQty,
          paket_count: paket.length,
          provinsi_count: provinsi.length,
        },
      },
    });
  } catch (err) {
    console.error('GET /api/analisa/grafik error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
