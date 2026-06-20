import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Read-only: returns one row per order with all customer + items + payment
// fields the "All Customer" page needs. Items are grouped per order. No
// writes, no schema changes.

type OrderRow = {
  id: number;
  no_order: string | null;
  customer_id: number | null;
  customer_nama: string | null;
  customer_phone: string | null;
  customer_alamat: string | null;
  customer_desa: string | null;
  customer_kecamatan: string | null;
  customer_kabupaten: string | null;
  customer_provinsi: string | null;
  nominal_order: number | string | null;
  dp_desain: number | string | null;
  dp_produksi: number | string | null;
  kekurangan: number | string | null;
  tanggal_order: string | null;
};

type ItemRow = {
  order_id: number;
  paket_nama: string | null;
  qty: number | string | null;
};

const n = (v: number | string | null | undefined) =>
  v == null || v === '' ? 0 : Number(v);

export async function GET() {
  try {
    const orders = await query<OrderRow>(
      `SELECT
         id, no_order, customer_id, customer_nama, customer_phone,
         customer_alamat, customer_desa, customer_kecamatan,
         customer_kabupaten, customer_provinsi,
         nominal_order, dp_desain, dp_produksi, kekurangan,
         tanggal_order
       FROM orders
       ORDER BY id DESC`
    );

    const items = await query<ItemRow>(
      `SELECT order_id, paket_nama, qty
       FROM order_items
       WHERE paket_nama IS NOT NULL`
    );

    const itemsByOrder = new Map<number, { paket: string; qty: number }[]>();
    for (const it of items) {
      if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
      itemsByOrder.get(it.order_id)!.push({
        paket: it.paket_nama || '',
        qty: n(it.qty),
      });
    }

    const data = orders.map(o => ({
      id: o.id,
      no_order: o.no_order || '',
      customer_id: o.customer_id,
      customer_nama: o.customer_nama || '',
      customer_phone: o.customer_phone || '',
      customer_alamat: o.customer_alamat || '',
      customer_desa: o.customer_desa || '',
      customer_kecamatan: o.customer_kecamatan || '',
      customer_kabupaten: o.customer_kabupaten || '',
      customer_provinsi: o.customer_provinsi || '',
      nominal_order: n(o.nominal_order),
      dp_desain: n(o.dp_desain),
      dp_produksi: n(o.dp_produksi),
      kekurangan: n(o.kekurangan),
      tanggal_order: o.tanggal_order || '',
      items: itemsByOrder.get(o.id) || [],
    }));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/analisa/all-customer error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
