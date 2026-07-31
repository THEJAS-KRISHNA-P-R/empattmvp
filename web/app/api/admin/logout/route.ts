import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/adminAuth';

/**
 * POST /api/admin/logout
 *
 * Note: this path is UNDER /api/admin/, so middleware.ts requires a valid
 * session to reach it — which is fine, you need to be logged in to log
 * out, and the middleware check runs before this handler either way.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
