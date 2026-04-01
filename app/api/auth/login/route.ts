import { NextRequest, NextResponse } from 'next/server';
import { setSession } from '@/lib/session';
import { queryOne } from '@/lib/db';

interface UserRow {
  id: number;
  nama: string;
  email: string;
  password: string;
  role_id: number;
  role_nama: string;
  is_super_admin: number;
}

function mapRole(row: UserRow): string {
  if (row.is_super_admin) return 'admin';
  const r = row.role_nama.toLowerCase();
  if (r.includes('admin')) return 'admin';
  if (r.includes('cs') || r.includes('customer')) return 'cs';
  if (r.includes('produksi')) return 'produksi';
  return 'admin';
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Username dan password wajib diisi.' }, { status: 400 });
    }

    // Query database
    const row = await queryOne<UserRow>(
      `SELECT u.id, u.nama, u.email, u.password, u.role_id,
              r.nama AS role_nama, r.is_super_admin
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = ? AND u.status = 'aktif'
       LIMIT 1`,
      [username]
    );

    if (!row || row.password !== password) {
      return NextResponse.json({ success: false, error: 'Username atau password salah.' });
    }

    const user = { username: row.email, role: mapRole(row) as 'admin' | 'cs' | 'produksi' };
    await setSession(user);

    return NextResponse.json({ success: true, data: user });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ success: false, error: 'Tidak dapat terhubung ke server.' }, { status: 500 });
  }
}
