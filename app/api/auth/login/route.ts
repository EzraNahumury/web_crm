import { NextRequest, NextResponse } from 'next/server';
import { setSession } from '@/lib/session';
import { Role } from '@/lib/types';

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Username dan password wajib diisi.' }, { status: 400 });
    }

    // Validate credentials via Apps Script
    const params = new URLSearchParams({
      action: 'login',
      username,
      password,
      body: JSON.stringify({ action: 'login', username, password }),
    });

    const url = `${APPS_SCRIPT_URL}?${params}`;
    const response = await fetch(url, { redirect: 'follow' });
    const result = await response.json();

    if (!result.success || !result.data) {
      return NextResponse.json({ success: false, error: result.error || 'Username atau password salah.' });
    }

    const user = { username: result.data.username, role: result.data.role as Role };

    // Set httpOnly session cookie
    await setSession(user);

    return NextResponse.json({ success: true, data: user });
  } catch {
    return NextResponse.json({ success: false, error: 'Tidak dapat terhubung ke server.' }, { status: 500 });
  }
}
