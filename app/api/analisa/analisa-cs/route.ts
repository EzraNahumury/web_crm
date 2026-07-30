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
    // Yang stuck di DP Design (funnel drop-off) — dipakai buat list
    // di bawah + potensi kekurangan. Beda dari belumDpProduksi yang
    // sekarang counts SEMUA order yang belum bayar DP Produksi (biar
    // sudahDpProduksi + belumDpProduksi = totalOrders — konsisten
    // secara matematika).
    let stuckDpDesign = 0;
    // Metrik uang (global scope — bukan hanya pending array):
    //   totalNilaiOrder: SUM(nominal_order) WHERE dp_produksi > 0
    //                    = revenue riil dari customer yang sudah lanjut
    //                    ke produksi.
    //   totalDpDesignTercatat: SUM(dp_desain) WHERE dp_desain > 0
    //                    = seluruh uang DP Design yang sudah masuk,
    //                    tidak peduli sudah lanjut atau belum.
    //   potensiKekurangan: SUM(nominal_order - dp_desain) WHERE
    //                    dp_desain > 0 AND dp_produksi = 0
    //                    = omset yang bisa hilang kalau pending
    //                    drop-off (money at risk).
    let totalNilaiOrder = 0;
    let totalDpDesignTercatat = 0;
    let potensiKekurangan = 0;
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
      const nom = n(o.nominal_order);
      if (dpD > 0) {
        sudahDpDesign++;
        totalDpDesignTercatat += dpD;
      }
      if (dpP > 0) {
        sudahDpProduksi++;
        totalNilaiOrder += nom;
      } else {
        // Belum DP Produksi = complement dari Sudah DP Produksi.
        // Total = Sudah + Belum secara matematika.
        belumDpProduksi++;
      }
      if (dpD > 0 && dpP === 0) {
        stuckDpDesign++;
        potensiKekurangan += Math.max(nom - dpD, 0);
        pending.push({
          id: o.id,
          no_order: o.no_order || '',
          customer_nama: o.customer_nama || '',
          customer_phone: o.customer_phone || '',
          nominal_order: nom,
          dp_desain: dpD,
          dp_produksi: dpP,
          tanggal_order: o.tanggal_order || '',
        });
      }
    }

    // % konversi = sudah DP Produksi / total orders × 100.
    // Kalau 0 order, konversi 0.
    const conversionPct = totalOrders > 0
      ? Math.round((sudahDpProduksi / totalOrders) * 1000) / 10
      : 0;
    // % drop-off = belum DP Produksi / total orders × 100.
    const dropOffPct = totalOrders > 0
      ? Math.round((belumDpProduksi / totalOrders) * 1000) / 10
      : 0;

    // ─── Perbandingan Harian ──────────────────────────────────────────
    // Kedua series pakai orders.tanggal_order sebagai "hari itu":
    //   masuk    = COUNT(*) per hari — semua order baru
    //   rincian  = COUNT(*) per hari WHERE nominal_order > 0 — order
    //              yang sudah punya rincian pembayaran (CS Order sudah
    //              set nominal_order via drawer create atau edit).
    //
    // Kenapa tidak pakai order_payments.created_at (approach lama):
    // banyak legacy data yang nominal_order-nya di-set langsung di
    // kolom orders tapi tidak insert row di order_payments. Query
    // GROUP BY payments.created_at balik 0. Fallback ke orders.
    // nominal_order lebih reliable.
    //
    // Trade-off: kalau CS Order edit rincian di hari yang beda dari
    // tanggal_order, count-nya tetap masuk hari tanggal_order (bukan
    // hari edit). Match dengan user's phrasing 'di hari itu juga'.
    type DailyRow = { d: string; masuk: number; rincian: number };
    const dailyRows = await query<DailyRow>(
      `SELECT
         DATE_FORMAT(tanggal_order, '%Y-%m-%d') AS d,
         COUNT(*) AS masuk,
         SUM(CASE WHEN nominal_order > 0 THEN 1 ELSE 0 END) AS rincian
       FROM orders
       ${whereSql}
       GROUP BY DATE_FORMAT(tanggal_order, '%Y-%m-%d')`,
      params,
    );

    const byDate = new Map<string, { masuk: number; rincian: number }>();
    for (const r of dailyRows) {
      const key = String(r.d || '').slice(0, 10);
      if (!key || key === '0000-00-00') continue;
      byDate.set(key, {
        masuk: Number(r.masuk) || 0,
        rincian: Number(r.rincian) || 0,
      });
    }
    // Kalau ada range from-to, fill missing days dengan 0 supaya chart
    // tidak lompat. Kalau tidak, cuma dates yang ada data.
    const daily: Array<{ tanggal: string; masuk: number; rincian: number }> = [];
    if (from && to) {
      const start = new Date(from + 'T00:00:00');
      const end = new Date(to + 'T00:00:00');
      for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
        const d = new Date(t);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const v = byDate.get(key) || { masuk: 0, rincian: 0 };
        daily.push({ tanggal: key, masuk: v.masuk, rincian: v.rincian });
      }
    } else {
      const keys = Array.from(byDate.keys()).sort();
      for (const k of keys) {
        const v = byDate.get(k)!;
        daily.push({ tanggal: k, masuk: v.masuk, rincian: v.rincian });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          total_orders: totalOrders,
          sudah_dp_design: sudahDpDesign,
          sudah_dp_produksi: sudahDpProduksi,
          belum_dp_produksi: belumDpProduksi,
          stuck_dp_design: stuckDpDesign,
          conversion_pct: conversionPct,
          drop_off_pct: dropOffPct,
          total_nilai_order: totalNilaiOrder,
          total_dp_design_tercatat: totalDpDesignTercatat,
          potensi_kekurangan: potensiKekurangan,
        },
        pending,
        daily,
      },
    });
  } catch (err) {
    console.error('GET /api/analisa/analisa-cs error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
