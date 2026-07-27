import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Analisa CS: konversi dari DP Design → DP Produksi.
// - sudah DP Design (dp_desain > 0)
// - sudah DP Produksi (dp_produksi > 0)
// - belum DP Produksi tapi sudah DP Design (funnel drop-off)
// Return counts + list customers pending untuk follow-up CS.

type Row = {
  id: number;
  no_order: string | null;
  customer_id: number | null;
  customer_nama: string | null;
  customer_phone: string | null;
  nominal_order: number | string | null;
  dp_desain: number | string | null;
  dp_produksi: number | string | null;
  tanggal_order: string | null;
};

const n = (v: number | string | null | undefined) =>
  v == null || v === '' ? 0 : Number(v);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    const whereParts: string[] = [];
    const params: string[] = [];
    if (from) { whereParts.push('DATE(tanggal_order) >= ?'); params.push(from); }
    if (to)   { whereParts.push('DATE(tanggal_order) <= ?'); params.push(to); }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const orders = await query<Row>(
      `SELECT id, no_order, customer_id, customer_nama, customer_phone,
              nominal_order, dp_desain, dp_produksi, tanggal_order
       FROM orders
       ${whereSql}
       ORDER BY tanggal_order DESC, id DESC`,
      params
    );

    let totalOrders = 0;
    let sudahDpDesign = 0;
    let sudahDpProduksi = 0;
    let belumDpProduksi = 0;
    const pending: {
      id: number;
      no_order: string;
      customer_nama: string;
      customer_phone: string;
      nominal_order: number;
      dp_desain: number;
      dp_produksi: number;
      tanggal_order: string;
    }[] = [];

    for (const o of orders) {
      totalOrders++;
      const dpD = n(o.dp_desain);
      const dpP = n(o.dp_produksi);
      if (dpD > 0) sudahDpDesign++;
      if (dpP > 0) sudahDpProduksi++;
      if (dpD > 0 && dpP === 0) {
        belumDpProduksi++;
        pending.push({
          id: o.id,
          no_order: o.no_order || '',
          customer_nama: o.customer_nama || '',
          customer_phone: o.customer_phone || '',
          nominal_order: n(o.nominal_order),
          dp_desain: dpD,
          dp_produksi: dpP,
          tanggal_order: o.tanggal_order || '',
        });
      }
    }

    // % konversi = sudah DP Produksi / sudah DP Design × 100.
    // Kalau 0 order dengan DP Design, konversi 0.
    const conversionPct = sudahDpDesign > 0
      ? Math.round((sudahDpProduksi / sudahDpDesign) * 1000) / 10
      : 0;
    // % drop-off = belum DP Produksi / sudah DP Design × 100.
    const dropOffPct = sudahDpDesign > 0
      ? Math.round((belumDpProduksi / sudahDpDesign) * 1000) / 10
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          total_orders: totalOrders,
          sudah_dp_design: sudahDpDesign,
          sudah_dp_produksi: sudahDpProduksi,
          belum_dp_produksi: belumDpProduksi,
          conversion_pct: conversionPct,
          drop_off_pct: dropOffPct,
        },
        pending,
      },
    });
  } catch (err) {
    console.error('GET /api/analisa/analisa-cs error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
