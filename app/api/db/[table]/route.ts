import { NextRequest, NextResponse } from 'next/server';
import { query, insert, execute } from '@/lib/db';

// Whitelist of allowed tables to prevent SQL injection.
// `filterCols` lists query param names that may be used as WHERE filters
// (e.g. ?work_order_id=42 → WHERE work_order_id = 42). Only whitelisted
// columns are accepted, so this is safe against SQL injection.
const ALLOWED_TABLES: Record<string, { columns: string; searchCols?: string[]; filterCols?: string[] }> = {
  customers:         { columns: '*', searchCols: ['nama', 'no_hp'], filterCols: ['id'] },
  paket:             { columns: '*', searchCols: ['nama'], filterCols: ['id'] },
  barang:            { columns: 'b.*, tb.nama AS tipe_nama', searchCols: ['b.nama'], filterCols: ['b.id'] },
  tipe_barang:       { columns: '*', searchCols: ['nama'], filterCols: ['id'] },
  ukuran:            { columns: '*', searchCols: ['nama'], filterCols: ['id'] },
  pecah_pola:        { columns: '*', searchCols: ['nama'], filterCols: ['id'] },
  jabatan:           { columns: '*', searchCols: ['nama'], filterCols: ['id'] },
  karyawan:          { columns: 'k.*, j.nama AS jabatan_nama', searchCols: ['k.nama'], filterCols: ['k.id'] },
  promo:             { columns: '*', searchCols: ['nama'], filterCols: ['id'] },
  leads:             { columns: '*', searchCols: ['nama', 'no_hp'], filterCols: ['id'] },
  production_stages: { columns: '*', filterCols: ['id'] },
  roles:             { columns: '*', searchCols: ['nama'], filterCols: ['id'] },
  role_menu_access:  { columns: '*', filterCols: ['role_id'] },
  users:             { columns: 'u.id, u.nama, u.email, u.role_id, u.status, u.created_at, r.nama AS role_nama', searchCols: ['u.nama', 'u.email'], filterCols: ['u.id', 'u.role_id'] },
  settings:          { columns: '*' },
  orders:            { columns: '*', searchCols: ['no_order', 'customer_nama'], filterCols: ['id', 'status'] },
  order_items:       { columns: '*', filterCols: ['order_id'] },
  order_promos:      { columns: '*', filterCols: ['order_id'] },
  order_detail_bahan: { columns: '*', filterCols: ['order_id'] },
  work_orders:       { columns: '*', searchCols: ['no_wo', 'customer_nama'], filterCols: ['id', 'order_id', 'status'] },
  wo_spesifikasi:    { columns: '*', filterCols: ['id', 'work_order_id'] },
  wo_spesifikasi_bahan: { columns: '*', filterCols: ['id', 'spesifikasi_id'] },
  wo_permintaan_gudang: { columns: '*', filterCols: ['work_order_id'] },
  wo_section_imports: { columns: '*', filterCols: ['id', 'work_order_id', 'section'] },
  wo_detail_items:   { columns: '*', filterCols: ['id', 'work_order_id'] },
  wo_pengiriman:     { columns: '*', filterCols: ['work_order_id'] },
  wo_progress:       { columns: '*', filterCols: ['work_order_id'] },
  monitoring_produksi: { columns: '*', filterCols: ['id', 'order_id', 'board'] },
  crm_finishing:     { columns: '*', filterCols: ['id', 'order_id'] },
  libur_nasional:    { columns: '*', filterCols: ['id'] },
  stok:              { columns: 's.*, b.nama AS barang_nama, b.satuan, tb.nama AS tipe_nama', searchCols: ['b.nama'], filterCols: ['s.id', 's.barang_id'] },
  stok_adjustment:   { columns: 'sa.*, b.nama AS barang_nama, b.satuan, tb.nama AS tipe_nama', searchCols: ['b.nama'], filterCols: ['sa.id', 'sa.barang_id'] },
};

// JOIN clauses for tables with relations
function getFrom(table: string): string {
  switch (table) {
    case 'barang': return 'barang b LEFT JOIN tipe_barang tb ON tb.id = b.tipe_barang_id';
    case 'karyawan': return 'karyawan k LEFT JOIN jabatan j ON j.id = k.jabatan_id';
    case 'users': return 'users u JOIN roles r ON r.id = u.role_id';
    case 'stok': return 'stok s JOIN barang b ON b.id = s.barang_id LEFT JOIN tipe_barang tb ON tb.id = b.tipe_barang_id';
    case 'stok_adjustment': return 'stok_adjustment sa JOIN barang b ON b.id = sa.barang_id LEFT JOIN tipe_barang tb ON tb.id = b.tipe_barang_id';
    default: return table;
  }
}

function getOrderBy(table: string): string {
  switch (table) {
    case 'production_stages': return 'ORDER BY urutan ASC';
    case 'stok_adjustment': return 'ORDER BY sa.created_at DESC';
    case 'orders': return 'ORDER BY id DESC';
    case 'work_orders': return 'ORDER BY id DESC';
    default: return 'ORDER BY id ASC';
  }
}

// GET — list all rows
export async function GET(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const config = ALLOWED_TABLES[table];
  if (!config) return NextResponse.json({ success: false, error: 'Invalid table' }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    let sql = `SELECT ${config.columns} FROM ${getFrom(table)}`;
    const values: unknown[] = [];
    const whereParts: string[] = [];

    if (search && config.searchCols?.length) {
      const conditions = config.searchCols.map(col => `${col} LIKE ?`).join(' OR ');
      whereParts.push(`(${conditions})`);
      config.searchCols.forEach(() => values.push(`%${search}%`));
    }

    // Apply column filters from whitelist (e.g. ?work_order_id=42).
    // Column names come from filterCols, never from user input, so this is injection-safe.
    if (config.filterCols?.length) {
      for (const col of config.filterCols) {
        // The whitelist may use qualified names like "u.id" — match the unqualified param name.
        const paramName = col.includes('.') ? col.split('.').slice(-1)[0] : col;
        const val = searchParams.get(paramName);
        if (val != null && val !== '') {
          whereParts.push(`${col} = ?`);
          values.push(val);
        }
      }
    }

    if (whereParts.length > 0) sql += ` WHERE ${whereParts.join(' AND ')}`;
    sql += ` ${getOrderBy(table)}`;

    const rows = await query(sql, values);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error(`GET ${table} error:`, err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// POST — insert new row
export async function POST(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  if (!ALLOWED_TABLES[table]) return NextResponse.json({ success: false, error: 'Invalid table' }, { status: 400 });

  try {
    const body = await req.json();
    const keys = Object.keys(body);
    const vals = Object.values(body);
    const placeholders = keys.map(() => '?').join(', ');

    const id = await insert(
      `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`,
      vals
    );

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error(`POST ${table} error:`, err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// PUT — update row
export async function PUT(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  if (!ALLOWED_TABLES[table]) return NextResponse.json({ success: false, error: 'Invalid table' }, { status: 400 });

  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

    const sets = Object.keys(fields).map(k => `\`${k}\` = ?`).join(', ');
    const vals = [...Object.values(fields), id];

    const affected = await execute(`UPDATE \`${table}\` SET ${sets} WHERE id = ?`, vals);
    return NextResponse.json({ success: true, data: { affected } });
  } catch (err) {
    console.error(`PUT ${table} error:`, err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// DELETE — delete row
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  if (!ALLOWED_TABLES[table]) return NextResponse.json({ success: false, error: 'Invalid table' }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

    const affected = await execute(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
    return NextResponse.json({ success: true, data: { affected } });
  } catch (err) {
    console.error(`DELETE ${table} error:`, err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
