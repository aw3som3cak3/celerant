import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from './session';

export const PARENT_COOKIE = 'psid';
export const PARENT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes; re-ask often

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function setCookie(res: NextResponse, name: string, token: string, maxAgeMs: number): NextResponse {
  res.cookies.set(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

export function clearCookie(res: NextResponse, name: string): NextResponse {
  res.cookies.set(name, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

export { SESSION_COOKIE };
