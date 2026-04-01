import { NextRequest, NextResponse } from 'next/server';
import { setSession } from '@/lib/session';
import { Role } from '@/lib/types';

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';

// Local users — will be replaced by DB later
const LOCAL_USERS: Record<string, { password: string; role: Role }> = {
  'admin@gmail.com': { password: 'admin123', role: 'admin' },
  'admin':           { password: 'admin',    role: 'admin' },
  'cs':              { password: 'cs',       role: 'cs' },
  'produksi':        { password: 'produksi', role: 'produksi' },
};

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Username dan password wajib diisi.' }, { status: 400 });
    }

    // Check local users first
    const local = LOCAL_USERS[username];
    if (local && local.password === password) {
      const user = { username, role: local.role };
      await setSession(user);
      return NextResponse.json({ success: true, data: user });
    }

    // Fallback to Apps Script
    try {
      const params = new URLSearchParams({
        action: 'login',
        username,
        password,
        body: JSON.stringify({ action: 'login', username, password }),
      });

      const url = `${APPS_SCRIPT_URL}?${params}`;
      const response = await fetch(url, { redirect: 'follow' });
      const result = await response.json();

      if (result.success && result.data) {
        const user = { username: result.data.username, role: result.data.role as Role };
        await setSession(user);
        return NextResponse.json({ success: true, data: user });
      }
    } catch {}

    return NextResponse.json({ success: false, error: 'Username atau password salah.' });
  } catch {
    return NextResponse.json({ success: false, error: 'Tidak dapat terhubung ke server.' }, { status: 500 });
  }
}
