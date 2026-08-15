import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { HIDE_ORDERS_BEFORE } from '@/lib/data-cutoff';

// Breakdown order per RESELLER (dari snapshot orders.reseller_nama yang diisi
// saat CS Selling / Buat Order memilih reseller — lihat migration 059).
// Menampilkan customer yang sudah jadi reseller: order paket apa + nominalnya.
// Read-only, filter tanggal opsional (?from&to pada orders.tanggal_order).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    const where: string[] = [
      "o.reseller_nama IS NOT NULL AND TRIM(o.reseller_nama) <> ''",
      '(o.tanggal_order IS NULL OR o.tanggal_order >= ?)',
    ];
    const params: string[] = [HIDE_ORDERS_BEFORE];
    if (from) { where.push('o.tanggal_order >= ?'); params.push(from); }
    if (to)   { where.push('o.tanggal_order <= ?'); params.push(to); }

    const rows = await query<{
      id: number; no_order: string | null; customer_nama: string | null;
      tanggal_order: string | null; nominal_order: number | string | null;
      reseller_nama: string | null; reseller_kota: string | null;
      paket: string | null; qty: number | string | null;
    }>(
      `SELECT
         o.id, o.no_order, o.customer_nama, o.tanggal_order, o.nominal_order,
         TRIM(o.reseller_nama) AS reseller_nama, o.reseller_kota,
         GROUP_CONCAT(DISTINCT NULLIF(TRIM(oi.paket_nama), '') ORDER BY oi.paket_nama SEPARATOR ', ') AS paket,
         COALESCE(SUM(oi.qty), 0) AS qty
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE ${where.join(' AND ')}
       GROUP BY o.id
       ORDER BY TRIM(o.reseller_nama) ASC, o.tanggal_order DESC, o.id DESC`,
      params,
    );

    const orders = rows.map(r => ({
      id: r.id,
      no_order: r.no_order || '',
      customer: r.customer_nama || '',
      tanggal: r.tanggal_order ? String(r.tanggal_order).slice(0, 10) : '',
      nominal: Number(r.nominal_order) || 0,
      reseller: r.reseller_nama || '',
      kota: r.reseller_kota || '',
      paket: r.paket || '-',
      qty: Number(r.qty) || 0,
    }));

    // Grand totals.
    const resellerSet = new Set(orders.map(o => o.reseller));
    const totals = {
      reseller_count: resellerSet.size,
      order_count: orders.length,
      qty: orders.reduce((s, o) => s + o.qty, 0),
      nominal: orders.reduce((s, o) => s + o.nominal, 0),
    };

    return NextResponse.json({ success: true, data: { orders, totals } });
  } catch (err) {
    console.error('GET /api/reseller/order-breakdown error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
