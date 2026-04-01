import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { wo_id, status } = await req.json();
    if (!wo_id || !status) return NextResponse.json({ success: false, error: 'wo_id and status required' }, { status: 400 });

    // Update WO status
    await execute('UPDATE work_orders SET status = ? WHERE id = ?', [status, wo_id]);

    // Get order_id from this WO
    const wos = await query<{ order_id: number }>('SELECT order_id FROM work_orders WHERE id = ?', [wo_id]);
    if (wos.length === 0) return NextResponse.json({ success: true });

    const orderId = wos[0].order_id;

    // Check all WOs for this order
    const allWos = await query<{ status: string }>('SELECT status FROM work_orders WHERE order_id = ?', [orderId]);

    if (allWos.length > 0) {
      const allSelesai = allWos.every(w => w.status === 'SELESAI');
      const anyProses = allWos.some(w => w.status === 'PROSES_PRODUKSI');

      if (allSelesai) {
        // Semua WO selesai → order jadi DONE
        await execute('UPDATE orders SET status = ? WHERE id = ?', ['DONE', orderId]);
      } else if (anyProses) {
        // Ada yang proses → order tetap IN_PROGRESS
        await execute('UPDATE orders SET status = ? WHERE id = ?', ['IN_PROGRESS', orderId]);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
