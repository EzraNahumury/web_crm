import { NextRequest, NextResponse } from 'next/server';
import { query, execute, insert, queryOne } from '@/lib/db';

// Real Pengeluaran Bahan — save + auto deduct stok.
//
// Payload:
//   { wo_id: number, rows: [{ bagian, bahan, warna, kuantitas }, ...] }
//
// Behavior:
//   1. Aggregate kebutuhan per bahan (nama). Kalau ada beberapa row
//      pakai bahan sama, dijumlah dulu.
//   2. Pre-flight: cek stok tersedia >= kebutuhan untuk SEMUA bahan.
//      Kalau ada yang kurang, RETURN 400 dengan list insufficient
//      supaya UI bisa tampilkan warning + block save.
//   3. Kalau save PERTAMA kali (belum ada wo_pengeluaran header):
//      insert header + insert semua wo_pengeluaran_bahan row +
//      deduct stok + insert stok_adjustment audit trail.
//   4. Kalau EDIT (sudah ada header):
//      restore stok dari old rows dulu, delete old rows,
//      insert new rows + deduct stok baru + audit trail.
//      Efeknya: user bisa edit real pengeluaran, stok akan re-adjust.
//
// stok_adjustment.tipe:
//   - 'Pengurangan' saat deduct baru.
//   - 'Pengembalian' saat restore dari edit (soft undo).

type PayloadRow = {
  bagian?: string;
  bahan?: string;
  warna?: string;
  kuantitas?: number;
};

type BarangRow = { id: number; nama: string };
type StokRow = { id: number; qty: number };
type PengBahanRow = { id: number; bahan: string; kuantitas: number; bagian: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const woId = Number(body.wo_id);
    const notes: string | null = body.notes ?? null;
    const rawRows: PayloadRow[] = Array.isArray(body.rows) ? body.rows : [];
    if (!woId) {
      return NextResponse.json({ success: false, error: 'wo_id required' }, { status: 400 });
    }

    // Filter valid rows only (harus punya bahan + kuantitas > 0)
    const rows = rawRows
      .map(r => ({
        bagian: String(r.bagian || '').trim(),
        bahan: String(r.bahan || '').trim(),
        warna: String(r.warna || '').trim() || null,
        kuantitas: Number(r.kuantitas) || 0,
      }))
      .filter(r => r.bahan && r.kuantitas > 0);

    // ─── Aggregate needed per bahan (case-insensitive) ───
    const needed = new Map<string, number>();  // key: bahan (lower)
    for (const r of rows) {
      const key = r.bahan.toLowerCase();
      needed.set(key, (needed.get(key) || 0) + r.kuantitas);
    }

    // ─── Resolve barang_id + current stok per unique bahan ───
    const bahanMeta = new Map<string, { barangId: number | null; nama: string; stokId: number | null; qty: number }>();
    for (const [key, qtyNeeded] of needed) {
      const b = await queryOne<BarangRow>('SELECT id, nama FROM barang WHERE LOWER(nama) = LOWER(?) LIMIT 1', [key]);
      if (!b) {
        bahanMeta.set(key, { barangId: null, nama: key.toUpperCase(), stokId: null, qty: 0 });
        continue;
      }
      const s = await queryOne<StokRow>('SELECT id, qty FROM stok WHERE barang_id = ? LIMIT 1', [b.id]);
      bahanMeta.set(key, { barangId: b.id, nama: b.nama, stokId: s?.id ?? null, qty: Number(s?.qty ?? 0) });
      // qtyNeeded referenced below in validation
      void qtyNeeded;
    }

    // ─── Existing pengeluaran header (untuk edit case) ───
    const existingHeader = await queryOne<{ id: number }>(
      'SELECT id FROM wo_pengeluaran WHERE work_order_id = ? LIMIT 1',
      [woId]
    );

    // ─── Existing detail rows (yang akan di-restore stoknya kalau edit) ───
    const existingRows = existingHeader
      ? await query<PengBahanRow>(
          'SELECT id, bahan, kuantitas, bagian FROM wo_pengeluaran_bahan WHERE work_order_id = ?',
          [woId]
        )
      : [];

    // Restore map: bahan_lower → qty to add back to stok.
    const restoreByBahan = new Map<string, number>();
    for (const er of existingRows) {
      const key = String(er.bahan || '').trim().toLowerCase();
      if (!key) continue;
      restoreByBahan.set(key, (restoreByBahan.get(key) || 0) + Number(er.kuantitas || 0));
    }

    // ─── Pre-flight validate: NET consumption per bahan
    //     effective_available = current_qty + restore_qty (kalau edit,
    //     bahan yg sama akan di-restore dulu → tersedia lebih banyak).
    //     Kalau needed > effective_available → insufficient. ───
    const insufficient: { bahan: string; available: number; needed: number }[] = [];
    for (const [key, qtyNeeded] of needed) {
      const meta = bahanMeta.get(key)!;
      if (!meta.barangId) {
        insufficient.push({ bahan: key.toUpperCase(), available: 0, needed: qtyNeeded });
        continue;
      }
      const restore = restoreByBahan.get(key) || 0;
      const effAvail = meta.qty + restore;
      if (qtyNeeded > effAvail) {
        insufficient.push({ bahan: meta.nama, available: effAvail, needed: qtyNeeded });
      }
    }
    if (insufficient.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Stok tidak cukup', insufficient },
        { status: 400 }
      );
    }

    // ─── EDIT CASE: restore old stok + insert audit + delete old rows ───
    if (existingHeader) {
      // Restore stok dari existing rows.
      // Group by bahan (unique) → tulis 1 audit row per bahan.
      const restoreMeta = new Map<string, { barangId: number | null; nama: string; stokId: number | null; qty: number; add: number }>();
      for (const er of existingRows) {
        const key = String(er.bahan || '').trim().toLowerCase();
        if (!key) continue;
        if (!restoreMeta.has(key)) {
          const b = await queryOne<BarangRow>('SELECT id, nama FROM barang WHERE LOWER(nama) = LOWER(?) LIMIT 1', [key]);
          const barangId = b?.id ?? null;
          const s = barangId
            ? await queryOne<StokRow>('SELECT id, qty FROM stok WHERE barang_id = ? LIMIT 1', [barangId])
            : null;
          restoreMeta.set(key, { barangId, nama: b?.nama || key.toUpperCase(), stokId: s?.id ?? null, qty: Number(s?.qty ?? 0), add: 0 });
        }
        restoreMeta.get(key)!.add += Number(er.kuantitas || 0);
      }
      for (const [, m] of restoreMeta) {
        if (!m.barangId || m.add <= 0) continue;
        const before = m.qty;
        const after = before + m.add;
        if (m.stokId) {
          await execute('UPDATE stok SET qty = ? WHERE id = ?', [after, m.stokId]);
        } else {
          await insert('INSERT INTO stok (barang_id, qty) VALUES (?, ?)', [m.barangId, after]);
        }
        await insert(
          `INSERT INTO stok_adjustment
             (barang_id, tipe, qty_sebelum, qty_sesudah, selisih, keterangan, work_order_id)
           VALUES (?, 'Penambahan', ?, ?, ?, ?, ?)`,
          [m.barangId, before, after, m.add, 'Restore Real Pengeluaran (edit)', woId]
        );
        // Sync current qty ke bahanMeta supaya deduction pakai angka baru.
        const dedKey = m.nama.toLowerCase();
        if (bahanMeta.has(dedKey)) {
          const b = bahanMeta.get(dedKey)!;
          b.qty = after;
          b.stokId = b.stokId ?? m.stokId;
        }
      }
      // Delete existing detail rows.
      await execute('DELETE FROM wo_pengeluaran_bahan WHERE work_order_id = ?', [woId]);
    }

    // ─── Insert header (kalau belum ada) or update notes ───
    if (!existingHeader) {
      await insert(
        'INSERT INTO wo_pengeluaran (work_order_id, notes) VALUES (?, ?)',
        [woId, notes]
      );
    } else {
      await execute('UPDATE wo_pengeluaran SET notes = ? WHERE work_order_id = ?', [notes, woId]);
    }

    // ─── Insert new detail rows + deduct stok + audit ───
    let ordinal = 0;
    for (const r of rows) {
      ordinal++;
      await insert(
        `INSERT INTO wo_pengeluaran_bahan
           (work_order_id, form_no, urutan, kategori, bagian, bahan, warna, kuantitas)
         VALUES (?, 1, ?, 'BAHAN_UTAMA', ?, ?, ?, ?)`,
        [woId, ordinal, r.bagian, r.bahan, r.warna, r.kuantitas]
      );
    }

    // Aggregate deduction per bahan (biar audit ringkas).
    const dedMeta = new Map<string, { barangId: number; nama: string; stokId: number | null; qty: number; sub: number }>();
    for (const r of rows) {
      const key = r.bahan.toLowerCase();
      const meta = bahanMeta.get(key)!;
      if (!meta.barangId) continue;
      if (!dedMeta.has(key)) {
        dedMeta.set(key, { barangId: meta.barangId, nama: meta.nama, stokId: meta.stokId, qty: meta.qty, sub: 0 });
      }
      dedMeta.get(key)!.sub += Number(r.kuantitas || 0);
    }
    for (const [, m] of dedMeta) {
      if (m.sub <= 0) continue;
      const before = m.qty;
      const after = before - m.sub;
      if (m.stokId) {
        await execute('UPDATE stok SET qty = ? WHERE id = ?', [after, m.stokId]);
      } else {
        await insert('INSERT INTO stok (barang_id, qty) VALUES (?, ?)', [m.barangId, after]);
      }
      await insert(
        `INSERT INTO stok_adjustment
           (barang_id, tipe, qty_sebelum, qty_sesudah, selisih, keterangan, work_order_id)
         VALUES (?, 'Pengurangan', ?, ?, ?, ?, ?)`,
        [m.barangId, before, after, -m.sub, 'Real Pengeluaran Bahan', woId]
      );
    }

    return NextResponse.json({ success: true, saved: rows.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
