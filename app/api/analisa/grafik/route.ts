import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Read-only analytics endpoint. Aggregates orders + order_items inside an
// optional date range (?from=YYYY-MM-DD&to=YYYY-MM-DD on orders.tanggal_order).
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

    // Hanya paket UTAMA (yang dihitung qty) — barang aksesoris dari master
    // Barang CS (hitung_qty = 0) dikecualikan. COALESCE default 1 supaya
    // paket yang belum ada di master tetap tampil (konsisten dengan
    // lib/qty-aksesoris.buildAksesorisSet).
    const paket = await query<{ paket: string; total_qty: number; order_count: number }>(
      `SELECT
         oi.paket_nama AS paket,
         COALESCE(SUM(oi.qty), 0) AS total_qty,
         COUNT(DISTINCT oi.order_id) AS order_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN barang_cs bc ON LOWER(TRIM(bc.nama)) = LOWER(TRIM(oi.paket_nama))
       WHERE oi.paket_nama IS NOT NULL AND TRIM(oi.paket_nama) <> ''
         AND COALESCE(bc.hitung_qty, 1) = 1${dateWhere}
       GROUP BY oi.paket_nama
       ORDER BY total_qty DESC`,
      dateParams
    );

    // Customer per provinsi. Hitung customer DISTINCT by NAMA (customer_id
    // sering NULL untuk customer baru → undercount). Order tanpa provinsi
    // di-bucket "(Tanpa Provinsi)" supaya total customer mencerminkan
    // realita (bukan hanya yang provinsinya terisi).
    const provinsi = await query<{ provinsi: string; total_qty: number; customer_count: number; order_count: number }>(
      `SELECT
         COALESCE(NULLIF(TRIM(o.customer_provinsi), ''), '(Tanpa Provinsi)') AS provinsi,
         COALESCE(SUM(oi.qty), 0) AS total_qty,
         COUNT(DISTINCT TRIM(o.customer_nama)) AS customer_count,
         COUNT(DISTINCT o.id) AS order_count
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE 1=1${dateWhere}
       GROUP BY COALESCE(NULLIF(TRIM(o.customer_provinsi), ''), '(Tanpa Provinsi)')
       ORDER BY total_qty DESC`,
      dateParams
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
