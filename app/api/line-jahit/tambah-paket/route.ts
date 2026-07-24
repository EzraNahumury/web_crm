import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, insert, execute } from '@/lib/db';
import { getSession } from '@/lib/session';

// Tambah paket baru ke line_jahit:
// - INSERT ke line_jahit_paket (config table).
// - ALTER TABLE line_jahit ADD 2 kolom qty (atasan + celana) sesuai prefix.
// Prefix disanitasi ketat supaya aman di ALTER TABLE (regex whitelist).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const namaInput = String(body.nama || '').trim();
    if (!namaInput) {
      return NextResponse.json({ success: false, error: 'Nama paket wajib diisi.' }, { status: 400 });
    }
    if (namaInput.length > 60) {
      return NextResponse.json({ success: false, error: 'Nama paket terlalu panjang (max 60 char).' }, { status: 400 });
    }

    const nama = namaInput.toUpperCase();
    // Prefix = nama di-normalize jadi identifier SQL yang aman.
    const prefix = namaInput
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(prefix)) {
      return NextResponse.json(
        { success: false, error: 'Nama paket harus dimulai huruf latin (a-z).' },
        { status: 400 }
      );
    }

    // Cek unique nama & prefix.
    const dup = await queryOne<{ id: number }>(
      'SELECT id FROM line_jahit_paket WHERE nama = ? OR kolom_prefix = ? LIMIT 1',
      [nama, prefix]
    );
    if (dup) {
      return NextResponse.json(
        { success: false, error: `Paket "${nama}" atau prefix "${prefix}" sudah ada.` },
        { status: 409 }
      );
    }

    // Urutan berikutnya.
    const maxRow = await queryOne<{ mx: number | null }>(
      'SELECT MAX(urutan) AS mx FROM line_jahit_paket',
      []
    );
    const urutan = (Number(maxRow?.mx) || 0) + 1;

    // Cek kalau kolom sudah ada di line_jahit (defensive — kasus half-completed
    // dari retry). Kalau ada, skip ALTER supaya idempoten.
    const colName1 = `${prefix}_atasan`;
    const colName2 = `${prefix}_celana`;
    const existingCols = await query<{ COLUMN_NAME: string }>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
        "WHERE TABLE_NAME = 'line_jahit' AND TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN (?, ?)",
      [colName1, colName2]
    );
    const have = new Set(existingCols.map(c => String(c.COLUMN_NAME).toLowerCase()));

    const alterParts: string[] = [];
    if (!have.has(colName1)) alterParts.push('ADD COLUMN `' + colName1 + '` INT NOT NULL DEFAULT 0');
    if (!have.has(colName2)) alterParts.push('ADD COLUMN `' + colName2 + '` INT NOT NULL DEFAULT 0');
    if (alterParts.length > 0) {
      // Prefix sudah divalidasi via regex whitelist — kolom name aman dari injection.
      await execute('ALTER TABLE `line_jahit` ' + alterParts.join(', '), []);
    }

    // INSERT config paket. Urutan setelah ALTER supaya kalau ALTER gagal, config
    // tidak tertinggal orphan tanpa kolom pendukung.
    const id = await insert(
      'INSERT INTO line_jahit_paket (nama, kolom_prefix, urutan) VALUES (?, ?, ?)',
      [nama, prefix, urutan]
    );

    return NextResponse.json({
      success: true,
      data: { id, nama, kolom_prefix: prefix, urutan },
    });
  } catch (err) {
    console.error('tambah-paket error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
