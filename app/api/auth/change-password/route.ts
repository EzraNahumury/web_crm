import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/auth/change-password
// Body: { oldPassword: string, newPassword: string }
//
// User yang sedang login mengganti password sendiri. Verifikasi
// oldPassword terhadap kolom users.password (plain text sesuai schema
// existing) sebelum update. Sesi tidak di-invalidate — user tetap
// login pakai session cookie yang sudah ada.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.username) {
      return NextResponse.json({ success: false, error: 'Sesi tidak valid. Login ulang.' }, { status: 401 });
    }

    const { oldPassword, newPassword } = await req.json();
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
      return NextResponse.json({ success: false, error: 'Payload tidak valid.' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: 'Password baru minimal 6 karakter.' });
    }
    if (oldPassword === newPassword) {
      return NextResponse.json({ success: false, error: 'Password baru harus berbeda dari password lama.' });
    }

    // Ambil password saat ini dari DB, verify.
    const row = await queryOne<{ id: number; password: string }>(
      `SELECT id, password FROM users WHERE email = ? AND status = 'aktif' LIMIT 1`,
      [session.username]
    );
    if (!row) {
      return NextResponse.json({ success: false, error: 'Akun tidak ditemukan.' }, { status: 404 });
    }
    if (row.password !== oldPassword) {
      return NextResponse.json({ success: false, error: 'Password lama salah.' });
    }

    await execute(`UPDATE users SET password = ? WHERE id = ?`, [newPassword, row.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/change-password error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
