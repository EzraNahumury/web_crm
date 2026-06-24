import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Read-only CS analytics endpoint:
//   - paket aggregation (same shape as /api/analisa/grafik) but always
//     constrained by leads — so the chart reflects orders that have an
//     attributable CS/leads source
//   - leads aggregation: per-leads qty, order count, customer count
// Optional date range (?from=YYYY-MM-DD&to=YYYY-MM-DD on orders.tanggal_order).
// No writes, no schema changes.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    const dateClause: string[] = [];
    const dateParams: string[] = [];
    if (from) { dateClause.push('o.tanggal_order >= ?'); dateParams.push(from); }
    if (to)   { dateClause.push('o.tanggal_order <= ?'); dateParams.push(to); }
    const dateWhere = dateClause.length ? ` AND ${dateClause.join(' AND ')}` : '';

    const paket = await query<{ paket: string; total_qty: number; order_count: number }>(
      `SELECT
         oi.paket_nama AS paket,
         COALESCE(SUM(oi.qty), 0) AS total_qty,
         COUNT(DISTINCT oi.order_id) AS order_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.paket_nama IS NOT NULL AND TRIM(oi.paket_nama) <> ''${dateWhere}
       GROUP BY oi.paket_nama
       ORDER BY total_qty DESC`,
      dateParams
    );

    // Leads aggregation. LEFT JOIN so orders without a lead are bucketed
    // under "(Tanpa Leads)".
    const leads = await query<{
      lead_id: number | null;
      lead_nama: string | null;
      jenis_cs: string | null;
      total_qty: number;
      order_count: number;
      customer_count: number;
    }>(
      `SELECT
         o.lead_id AS lead_id,
         l.nama AS lead_nama,
         l.jenis_cs AS jenis_cs,
         COALESCE(SUM(oi.qty), 0) AS total_qty,
         COUNT(DISTINCT o.id) AS order_count,
         COUNT(DISTINCT o.customer_id) AS customer_count
       FROM orders o
       LEFT JOIN leads l ON l.id = o.lead_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE 1=1${dateWhere}
       GROUP BY o.lead_id, l.nama, l.jenis_cs
       ORDER BY total_qty DESC`,
      dateParams
    );

    const totalOrders = paket.reduce((s, p) => s + Number(p.order_count || 0), 0);
    const totalQty = paket.reduce((s, p) => s + Number(p.total_qty || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        paket: paket.map(p => ({
          ...p,
          total_qty: Number(p.total_qty),
          order_count: Number(p.order_count),
        })),
        leads: leads.map(l => ({
          lead_id: l.lead_id,
          lead_nama: l.lead_nama || '(Tanpa Leads)',
          jenis_cs: l.jenis_cs || '',
          total_qty: Number(l.total_qty),
          order_count: Number(l.order_count),
          customer_count: Number(l.customer_count),
        })),
        totals: {
          orders: totalOrders,
          qty: totalQty,
          paket_count: paket.length,
          leads_count: leads.length,
        },
      },
    });
  } catch (err) {
    console.error('GET /api/analisa/grafik-cs error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
