import { cookies } from 'next/headers';
import { createHmac } from 'crypto';
import { User } from './types';

const COOKIE_NAME = 'session';
const SECRET = process.env.SESSION_SECRET || 'ayres-crm-default-secret-key';
const MAX_AGE = 8 * 60 * 60; // 8 hours

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

function encode(user: User): string {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64');
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function decode(value: string): User | null {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  if (sign(payload) !== signature) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64').toString());
  } catch {
    return null;
  }
}

export async function setSession(user: User) {
  const store = await cookies();
  store.set(COOKIE_NAME, encode(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<User | null> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME);
  if (!cookie) return null;
  return decode(cookie.value);
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
