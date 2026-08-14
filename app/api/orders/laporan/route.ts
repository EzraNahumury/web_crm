import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { HIDE_ORDERS_BEFORE } from '@/lib/data-cutoff';

// Laporan CS Order — rekap per PAKET (nama barang dari master Barang CS)
// untuk order yang RINCIAN ORDER-nya sudah dibuat, dalam rentang tanggal.
//
// Definisi:
//   • "Rincian Order dibuat" = order sudah dipromote dari status 'SELLING'
//     (pembayaran-modal mengubah SELLING → PENDING saat Rincian disimpan)
//     dan punya baris order_items.
//   • Paket yang dihitung = order_items yang BUKAN aksesoris, yaitu yang
//     barang_cs-nya hitung_qty <> 0 (COALESCE default 1 untuk paket yang
//     tidak ada di master — konsisten dengan lib/qty-aksesoris.buildAksesorisSet).
//   • qty  = SUM(order_items.qty)  → jumlah pemesanan
//   • cust = COUNT(DISTINCT orders.customer_id) → jumlah customer
//
// Filter tanggal pada orders.tanggal_order (?from=YYYY-MM-DD&to=YYYY-MM-DD).
// Cutoff HIDE_ORDERS_BEFORE tetap diterapkan supaya konsisten dengan menu
// CS Order lain. Read-only, tidak mengubah schema.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    // Filter WHERE bersama untuk kedua query (per-paket + totals).
    const where: string[] = [
      "oi.paket_nama IS NOT NULL AND TRIM(oi.paket_nama) <> ''",
      "o.status <> 'SELLING'",
      'COALESCE(bc.hitung_qty, 1) = 1',
      '(o.tanggal_order IS NULL OR o.tanggal_order >= ?)',
    ];
    const params: string[] = [HIDE_ORDERS_BEFORE];
    if (from) { where.push('o.tanggal_order >= ?'); params.push(from); }
    if (to)   { where.push('o.tanggal_order <= ?'); params.push(to); }
    const whereSql = where.join(' AND ');

    const fromJoin =
      `FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN barang_cs bc ON LOWER(TRIM(bc.nama)) = LOWER(TRIM(oi.paket_nama))`;

    // Jumlah customer dihitung distinct berdasarkan NAMA customer (bukan
    // customer_id) — sebagian order (customer baru) bisa punya customer_id
    // NULL sehingga COUNT(DISTINCT customer_id) undercount. Nama juga yang
    // ditampilkan di breakdown per-paket, jadi lebih konsisten.
    const paket = await query<{ paket: string; qty: number; cust: number; orders: number }>(
      `SELECT
         oi.paket_nama AS paket,
         COALESCE(SUM(oi.qty), 0) AS qty,
         COUNT(DISTINCT TRIM(o.customer_nama)) AS cust,
         COUNT(DISTINCT o.id) AS orders
       ${fromJoin}
       WHERE ${whereSql}
       GROUP BY oi.paket_nama
       ORDER BY qty DESC`,
      params,
    );

    // Totals dihitung terpisah supaya cust/orders benar-benar DISTINCT
    // lintas paket (satu customer bisa pesan beberapa paket).
    const totalsRow = await query<{ qty: number; cust: number; orders: number }>(
      `SELECT
         COALESCE(SUM(oi.qty), 0) AS qty,
         COUNT(DISTINCT TRIM(o.customer_nama)) AS cust,
         COUNT(DISTINCT o.id) AS orders
       ${fromJoin}
       WHERE ${whereSql}`,
      params,
    );

    // Breakdown per (paket, customer) → dipakai tabel rincian per paket
    // di halaman (nama customer + qty), lengkap dengan total per paket.
    const breakdown = await query<{ paket: string; customer: string; qty: number }>(
      `SELECT
         oi.paket_nama AS paket,
         TRIM(o.customer_nama) AS customer,
         COALESCE(SUM(oi.qty), 0) AS qty
       ${fromJoin}
       WHERE ${whereSql}
       GROUP BY oi.paket_nama, TRIM(o.customer_nama)
       ORDER BY oi.paket_nama, qty DESC`,
      params,
    );

    const t = totalsRow[0] || { qty: 0, cust: 0, orders: 0 };

    return NextResponse.json({
      success: true,
      data: {
        paket: paket.map(p => ({
          paket: p.paket,
          qty: Number(p.qty) || 0,
          cust: Number(p.cust) || 0,
          orders: Number(p.orders) || 0,
        })),
        breakdown: breakdown.map(b => ({
          paket: b.paket,
          customer: b.customer || '(Tanpa Nama)',
          qty: Number(b.qty) || 0,
        })),
        totals: {
          qty: Number(t.qty) || 0,
          cust: Number(t.cust) || 0,
          orders: Number(t.orders) || 0,
          paket_count: paket.length,
        },
      },
    });
  } catch (err) {
    console.error('GET /api/orders/laporan error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
