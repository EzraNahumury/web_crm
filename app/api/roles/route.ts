import { NextRequest, NextResponse } from 'next/server';
import { query, insert, execute } from '@/lib/db';

interface RoleRow {
  id: number;
  nama: string;
  deskripsi: string | null;
  is_super_admin: number;
}

interface MenuRow {
  role_id: number;
  menu_name: string;
}

interface StageAccessRow {
  role_id: number;
  stage_id: number;
}

// Ensure role_stage_access table exists
let tableChecked = false;
async function ensureStageTable() {
  if (tableChecked) return;
  try {
    await execute(`CREATE TABLE IF NOT EXISTS role_stage_access (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      role_id INT UNSIGNED NOT NULL,
      stage_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (id),
      KEY fk_rsa_role (role_id),
      KEY fk_rsa_stage (stage_id)
    ) ENGINE=InnoDB`, []);
    tableChecked = true;
  } catch {
    // Table may already exist with foreign keys
    tableChecked = true;
  }
}

// GET — list all roles with their menu access and stage access
export async function GET() {
  try {
    await ensureStageTable();

    const roles = await query<RoleRow>('SELECT * FROM roles ORDER BY id ASC');
    const menus = await query<MenuRow>('SELECT role_id, menu_name FROM role_menu_access');
    const stageAccess = await query<StageAccessRow>('SELECT role_id, stage_id FROM role_stage_access');

    const data = roles.map(r => ({
      ...r,
      menus: menus.filter(m => m.role_id === r.id).map(m => m.menu_name),
      stage_ids: stageAccess.filter(s => s.role_id === r.id).map(s => s.stage_id),
    }));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET roles error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// POST — create role with menu access and stage access
export async function POST(req: NextRequest) {
  try {
    await ensureStageTable();

    const { nama, deskripsi, is_super_admin, menus, stage_ids } = await req.json();

    const roleId = await insert(
      'INSERT INTO `roles` (`nama`, `deskripsi`, `is_super_admin`) VALUES (?, ?, ?)',
      [nama, deskripsi || null, is_super_admin ? 1 : 0]
    );

    // Insert menu access
    if (menus?.length) {
      const placeholders = menus.map(() => '(?, ?)').join(', ');
      const values = menus.flatMap((m: string) => [roleId, m]);
      await execute(`INSERT INTO role_menu_access (role_id, menu_name) VALUES ${placeholders}`, values);
    }

    // Insert stage access
    if (stage_ids?.length) {
      const placeholders = stage_ids.map(() => '(?, ?)').join(', ');
      const values = stage_ids.flatMap((id: number) => [roleId, id]);
      await execute(`INSERT INTO role_stage_access (role_id, stage_id) VALUES ${placeholders}`, values);
    }

    return NextResponse.json({ success: true, data: { id: roleId } });
  } catch (err) {
    console.error('POST roles error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// PUT — update role and its access
export async function PUT(req: NextRequest) {
  try {
    await ensureStageTable();

    const { id, nama, deskripsi, is_super_admin, menus, stage_ids } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

    await execute(
      'UPDATE `roles` SET `nama` = ?, `deskripsi` = ?, `is_super_admin` = ? WHERE id = ?',
      [nama, deskripsi || null, is_super_admin ? 1 : 0, id]
    );

    // Replace menu access
    await execute('DELETE FROM role_menu_access WHERE role_id = ?', [id]);
    if (menus?.length) {
      const placeholders = menus.map(() => '(?, ?)').join(', ');
      const values = menus.flatMap((m: string) => [id, m]);
      await execute(`INSERT INTO role_menu_access (role_id, menu_name) VALUES ${placeholders}`, values);
    }

    // Replace stage access
    await execute('DELETE FROM role_stage_access WHERE role_id = ?', [id]);
    if (stage_ids?.length) {
      const placeholders = stage_ids.map(() => '(?, ?)').join(', ');
      const values = stage_ids.flatMap((sid: number) => [id, sid]);
      await execute(`INSERT INTO role_stage_access (role_id, stage_id) VALUES ${placeholders}`, values);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT roles error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// DELETE — delete role (will cascade to role_menu_access and role_stage_access)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

    const users = await query<{ nama: string }>('SELECT nama FROM users WHERE role_id = ?', [id]);
    if (users.length > 0) {
      const names = users.map(u => u.nama).join(', ');
      return NextResponse.json(
        { success: false, error: `Role tidak bisa dihapus karena masih dipakai oleh user: ${names}` },
        { status: 409 }
      );
    }

    const affected = await execute('DELETE FROM `roles` WHERE id = ?', [id]);
    return NextResponse.json({ success: true, data: { affected } });
  } catch (err) {
    console.error('DELETE roles error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
