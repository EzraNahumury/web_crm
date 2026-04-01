import { NextRequest, NextResponse } from 'next/server';

const SECRET = process.env.SESSION_SECRET || 'ayres-crm-default-secret-key';
const COOKIE_NAME = 'session';

const PUBLIC_PATHS = ['/', '/tracking', '/invoice', '/api'];

async function hmacSign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifySession(cookieValue: string): Promise<boolean> {
  const [payload, signature] = cookieValue.split('.');
  if (!payload || !signature) return false;
  const expected = await hmacSign(payload);
  return expected === signature;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Allow static files
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Check session cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie || !(await verifySession(cookie.value))) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
