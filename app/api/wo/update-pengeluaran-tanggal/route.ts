import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';

// Ubah HANYA tanggal Real Pengeluaran Bahan — tanpa menyentuh stok.
//
// Real pengeluaran sudah memotong stok saat disimpan. Kalau operator cuma mau
// mengoreksi tanggalnya (mis. input tidak real-time), tidak perlu restore +
// potong ulang stok. Endpoint ini hanya:
//   1. Update wo_pengeluaran.tanggal
//   2. Geser created_at baris stok_adjustment pemotongan WO ini ke tanggal baru
//      (jam 12:00 untuk aman dari zona waktu) supaya Riwayat Adjustment & laporan
//      ikut tanggal yang benar.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const woId = Number(body.wo_id);
    if (!woId) return NextResponse.json({ success: false, error: 'wo_id required' }, { status: 400 });
    const t = /^\d{4}-\d{2}-\d{2}$/.test(String(body.tanggal || '')) ? String(body.tanggal) : null;

    await execute('UPDATE `wo_pengeluaran` SET `tanggal` = ? WHERE `work_order_id` = ?', [t, woId]);
    if (t) {
      await execute(
        "UPDATE `stok_adjustment` SET `created_at` = ? WHERE `work_order_id` = ? AND `keterangan` = 'Real Pengeluaran Bahan'",
        [`${t} 12:00:00`, woId],
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
