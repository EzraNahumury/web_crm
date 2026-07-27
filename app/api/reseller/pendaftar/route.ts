import { NextResponse } from 'next/server';
import { queryReseller } from '@/lib/db-reseller';
import { getSession } from '@/lib/session';

// GET /api/reseller/pendaftar — return semua row dari tabel reseller.
// Cara kerja: auto-discover tabel dengan nama yang match /pendaftar|reseller/i.
// Kalau env RESELLER_DB_HOST belum diset, getPool() akan throw error
// yang di-catch di sini + di-return sebagai response error jelas.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Discover table name — SHOW TABLES kasih hasil { "Tables_in_dbname": "table_name" }
    // Kita cari row pertama yang keynya match pola "pendaftar" atau "reseller".
    const tables = await queryReseller<Record<string, string>>('SHOW TABLES');
    let tableName = '';
    for (const t of tables) {
      const name = Object.values(t)[0] || '';
      if (/pendaftar|reseller/i.test(name)) { tableName = name; break; }
    }
    // Fallback: ambil tabel pertama kalau tidak ada yang match pola.
    if (!tableName && tables.length > 0) {
      tableName = Object.values(tables[0])[0] || '';
    }
    if (!tableName) {
      return NextResponse.json({
        success: false,
        error: 'Tidak ada tabel di database reseller. Cek koneksi + isi database.',
      }, { status: 500 });
    }

    // Query semua row. Kalau tabel besar (>1000 row) mungkin perlu pagination
    // nanti — for now tarik semua supaya UI bisa filter/search client-side.
    // Nama tabel di-quote pakai backtick — nama sudah kita ambil dari
    // INFORMATION_SCHEMA jadi aman dari injection.
    const rows = await queryReseller<Record<string, unknown>>(
      'SELECT * FROM `' + tableName + '` ORDER BY id DESC'
    );

    return NextResponse.json({
      success: true,
      data: {
        table: tableName,
        total: rows.length,
        rows,
      },
    });
  } catch (err) {
    console.error('GET /api/reseller/pendaftar error:', err);
    return NextResponse.json({
      success: false,
      error: String(err),
      hint: 'Cek env RESELLER_DB_HOST / RESELLER_DB_USER / RESELLER_DB_PASSWORD / RESELLER_DB_NAME di Hostinger dan pastikan sudah restart deployment.',
    }, { status: 500 });
  }
}
