import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { computeDeadlineLock, hasJaket } from '@/lib/business-days';
import { HIDE_ORDERS_BEFORE } from '@/lib/data-cutoff';

// Read-only analytics endpoint. Aggregates orders + order_items inside an
// optional date range (?from=YYYY-MM-DD&to=YYYY-MM-DD).
//
// ?basis=order    → rentang dihitung pada orders.tanggal_order (tanggal order
//                   masuk / penjualan). DEFAULT.
// ?basis=deadline → rentang dihitung pada DEADLINE tiap order (deadline_lock
//                   manual, kalau kosong dihitung otomatis dari ACC Proofing +
//                   hari kerja — sama seperti kolom TGL DEADLINE LOCK di menu
//                   Rincian Order). Dipakai supaya angka cocok dengan daftar
//                   order yang dikelompokkan per bulan deadline.
function dateOnly(v: unknown): string {
  if (!v) return '';
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const basis = (searchParams.get('basis') || 'order') === 'deadline' ? 'deadline' : 'order';

    // Bangun filter WHERE (dipakai di query paket & provinsi; keduanya punya
    // alias o + oi, jadi klausa yang sama valid di dua-duanya).
    let whereClause = '';
    let whereParams: (string | number)[] = [];

    if (basis === 'deadline' && (from || to)) {
      // Hitung deadline efektif tiap order lalu saring order_id yang masuk rentang.
      type OrdRow = { id: number; pilihan_paket: string | null; tanggal_acc_proofing: unknown; deadline_lock: string | Date | null };
      const [ords, items, holidayRows] = await Promise.all([
        query<OrdRow>(
          `SELECT id, pilihan_paket, tanggal_acc_proofing, deadline_lock
             FROM orders WHERE (tanggal_order IS NULL OR tanggal_order >= ?)`, [HIDE_ORDERS_BEFORE]).catch(() => [] as OrdRow[]),
        query<{ order_id: number; paket_nama: string | null }>('SELECT order_id, paket_nama FROM order_items').catch(() => []),
        query<{ tanggal: unknown }>('SELECT `tanggal` FROM `libur_nasional`').catch(() => []),
      ]);
      const holidays = new Set(holidayRows.map(h => dateOnly(h.tanggal)));
      const paketByOrder = new Map<number, string[]>();
      for (const it of items) { if (it.paket_nama) { const a = paketByOrder.get(Number(it.order_id)) || []; a.push(String(it.paket_nama)); paketByOrder.set(Number(it.order_id), a); } }

      const ids: number[] = [];
      for (const o of ords) {
        const dl = computeDeadlineLock({
          pilihanPaket: o.pilihan_paket,
          tanggalAccProofing: dateOnly(o.tanggal_acc_proofing),
          deadlineLock: o.deadline_lock,
          holidays,
          isJaket: hasJaket(paketByOrder.get(Number(o.id)) || []),
        });
        if (!dl) continue;
        if (from && dl < from) continue;
        if (to && dl > to) continue;
        ids.push(Number(o.id));
      }
      if (ids.length === 0) {
        return NextResponse.json({ success: true, data: { paket: [], provinsi: [], totals: { orders: 0, qty: 0, paket_count: 0, provinsi_count: 0 } } });
      }
      whereClause = ` AND oi.order_id IN (${ids.map(() => '?').join(',')})`;
      whereParams = ids;
    } else {
      if (from) { whereClause += ' AND o.tanggal_order >= ?'; whereParams.push(from); }
      if (to) { whereClause += ' AND o.tanggal_order <= ?'; whereParams.push(to); }
    }

    // Hanya paket UTAMA (yang dihitung qty) — barang aksesoris dari master
    // Barang CS (hitung_qty = 0) dikecualikan. COALESCE default 1 supaya
    // paket yang belum ada di master tetap tampil.
    const paket = await query<{ paket: string; total_qty: number; order_count: number }>(
      `SELECT
         oi.paket_nama AS paket,
         COALESCE(SUM(oi.qty), 0) AS total_qty,
         COUNT(DISTINCT oi.order_id) AS order_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN barang_cs bc ON LOWER(TRIM(bc.nama)) = LOWER(TRIM(oi.paket_nama))
       WHERE oi.paket_nama IS NOT NULL AND TRIM(oi.paket_nama) <> ''
         AND COALESCE(bc.hitung_qty, 1) = 1${whereClause}
       GROUP BY oi.paket_nama
       ORDER BY total_qty DESC`,
      whereParams,
    );

    // Customer per provinsi.
    const provinsi = await query<{ provinsi: string; total_qty: number; customer_count: number; order_count: number }>(
      `SELECT
         COALESCE(NULLIF(TRIM(o.customer_provinsi), ''), '(Tanpa Provinsi)') AS provinsi,
         COALESCE(SUM(oi.qty), 0) AS total_qty,
         COUNT(DISTINCT TRIM(o.customer_nama)) AS customer_count,
         COUNT(DISTINCT o.id) AS order_count
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE 1=1${whereClause}
       GROUP BY COALESCE(NULLIF(TRIM(o.customer_provinsi), ''), '(Tanpa Provinsi)')
       ORDER BY total_qty DESC`,
      whereParams,
    );

    // Total order = jumlah order UNIK (bukan penjumlahan per-paket yang bisa
    // menghitung satu order berkali-kali kalau isinya beberapa paket).
    const totalRow = await query<{ cnt: number; qty: number }>(
      `SELECT COUNT(DISTINCT oi.order_id) AS cnt, COALESCE(SUM(oi.qty), 0) AS qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN barang_cs bc ON LOWER(TRIM(bc.nama)) = LOWER(TRIM(oi.paket_nama))
       WHERE oi.paket_nama IS NOT NULL AND TRIM(oi.paket_nama) <> ''
         AND COALESCE(bc.hitung_qty, 1) = 1${whereClause}`,
      whereParams,
    );
    const totalOrders = Number(totalRow[0]?.cnt || 0);
    const totalQty = Number(totalRow[0]?.qty || 0);

    return NextResponse.json({
      success: true,
      data: {
        basis,
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
