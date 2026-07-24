import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { getSession } from '@/lib/session';

// Hapus paket + drop 2 kolom qty terkait dari line_jahit.
// DESTRUCTIVE: data qty untuk paket ini hilang permanen — konfirmasi
// wajib dilakukan di UI sebelum panggil endpoint ini.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

    const row = await queryOne<{ id: number; nama: string; kolom_prefix: string }>(
      'SELECT id, nama, kolom_prefix FROM line_jahit_paket WHERE id = ? LIMIT 1',
      [id]
    );
    if (!row) {
      return NextResponse.json({ success: false, error: 'Paket tidak ditemukan.' }, { status: 404 });
    }

    const prefix = String(row.kolom_prefix);
    // Defense in depth: prefix dari DB harus tetap match regex whitelist
    // sebelum masuk ke ALTER TABLE (nama kolom di-interpolasi langsung).
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(prefix)) {
      return NextResponse.json({ success: false, error: 'Prefix tidak valid.' }, { status: 500 });
    }

    // Cek kolom mana yang masih ada — supaya DROP idempoten kalau kolom
    // sudah dihapus manual di database.
    const existing = await query<{ COLUMN_NAME: string }>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
        "WHERE TABLE_NAME = 'line_jahit' AND TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN (?, ?)",
      [`${prefix}_atasan`, `${prefix}_celana`]
    );
    const existingSet = new Set(existing.map(c => String(c.COLUMN_NAME).toLowerCase()));
    const parts: string[] = [];
    if (existingSet.has(`${prefix}_atasan`)) parts.push('DROP COLUMN `' + prefix + '_atasan`');
    if (existingSet.has(`${prefix}_celana`)) parts.push('DROP COLUMN `' + prefix + '_celana`');
    if (parts.length > 0) {
      await execute('ALTER TABLE `line_jahit` ' + parts.join(', '), []);
    }

    // Hapus config.
    await execute('DELETE FROM line_jahit_paket WHERE id = ?', [id]);

    return NextResponse.json({ success: true, data: { id: Number(id), nama: row.nama } });
  } catch (err) {
    console.error('hapus-paket error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
