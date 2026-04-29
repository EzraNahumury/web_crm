import { NextRequest, NextResponse } from 'next/server';
import { query, execute, insert, queryOne } from '@/lib/db';

type GudangRow = {
  id: number;
  barang_id: number | null;
  bahan: string;
  kuantitas: number;
  bagian: string;
};

type BarangRow = { id: number; nama: string };
type StokRow = { id: number; qty: number };

/**
 * Auto-deduct stok berdasarkan wo_permintaan_gudang ketika tahap
 * "Fabric Cutting" diselesaikan.
 *
 * Idempotent: row yang sudah punya `deducted_at` di-skip.
 *
 * Untuk row yang `barang_id IS NULL` (input bahan bebas / legacy),
 * sistem coba lookup barang_id dari nama (case-insensitive). Kalau
 * tidak ketemu di master barang, row di-skip (tidak ada potongan).
 */
export async function POST(req: NextRequest) {
  try {
    const { wo_id } = await req.json();
    if (!wo_id) {
      return NextResponse.json({ success: false, error: 'wo_id required' }, { status: 400 });
    }

    const rows = await query<GudangRow>(
      `SELECT id, barang_id, bahan, kuantitas, bagian
       FROM wo_permintaan_gudang
       WHERE work_order_id = ?
         AND deducted_at IS NULL
         AND kuantitas > 0`,
      [wo_id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ success: true, deducted: 0, skipped: 0 });
    }

    // ─── Pre-flight: resolve barang_id for each row & aggregate per barang ───
    type Resolved = { row: GudangRow; barangId: number | null };
    const resolved: Resolved[] = [];
    for (const row of rows) {
      let barangId = row.barang_id;
      if (!barangId) {
        const b = await queryOne<BarangRow>(
          'SELECT id FROM barang WHERE LOWER(nama) = LOWER(?) LIMIT 1',
          [row.bahan]
        );
        if (b) barangId = b.id;
      }
      resolved.push({ row, barangId });
    }

    // ─── Pre-flight: validate aggregate stock per barang ───
    const needed = new Map<number, number>();
    for (const { row, barangId } of resolved) {
      if (!barangId) continue;
      needed.set(barangId, (needed.get(barangId) || 0) + row.kuantitas);
    }

    const insufficient: { bahan: string; available: number; needed: number }[] = [];
    const stokSnapshot = new Map<number, { id: number | null; qty: number; nama: string }>();
    for (const [barangId, qtyNeeded] of needed) {
      const stok = await queryOne<StokRow>(
        'SELECT id, qty FROM stok WHERE barang_id = ? LIMIT 1',
        [barangId]
      );
      const barang = await queryOne<BarangRow>('SELECT nama FROM barang WHERE id = ?', [barangId]);
      const available = stok?.qty ?? 0;
      stokSnapshot.set(barangId, { id: stok?.id ?? null, qty: available, nama: barang?.nama || '' });
      if (available < qtyNeeded) {
        insufficient.push({ bahan: barang?.nama || `barang #${barangId}`, available, needed: qtyNeeded });
      }
    }

    if (insufficient.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Stok tidak cukup',
        insufficient,
      }, { status: 400 });
    }

    // ─── All checks passed: do the actual deductions atomically ───
    let deducted = 0;
    let skipped = 0;
    const detail: { bahan: string; qty: number; status: string }[] = [];

    for (const { row, barangId } of resolved) {
      if (!barangId) {
        skipped++;
        detail.push({ bahan: row.bahan, qty: row.kuantitas, status: 'barang_not_found' });
        continue;
      }

      const snapshot = stokSnapshot.get(barangId)!;
      const qtyBefore = snapshot.qty;
      const qtyAfter = qtyBefore - row.kuantitas;

      // Audit trail
      await insert(
        `INSERT INTO stok_adjustment
          (barang_id, tipe, qty_sebelum, qty_sesudah, selisih, keterangan, work_order_id)
         VALUES (?, 'Pemakaian_WO', ?, ?, ?, ?, ?)`,
        [barangId, qtyBefore, qtyAfter, -row.kuantitas, `Pemakaian WO untuk ${row.bagian}`, wo_id]
      );

      // Update / create stok
      if (snapshot.id) {
        await execute('UPDATE stok SET qty = ? WHERE id = ?', [qtyAfter, snapshot.id]);
      } else {
        const newId = await insert('INSERT INTO stok (barang_id, qty) VALUES (?, ?)', [barangId, qtyAfter]);
        snapshot.id = newId;
      }

      // Update snapshot for next iteration of same barang
      snapshot.qty = qtyAfter;

      // Mark deducted (idempotency)
      await execute(
        'UPDATE wo_permintaan_gudang SET deducted_at = NOW(), barang_id = ? WHERE id = ?',
        [barangId, row.id]
      );

      deducted++;
      detail.push({ bahan: row.bahan, qty: row.kuantitas, status: 'ok' });
    }

    return NextResponse.json({ success: true, deducted, skipped, detail });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
