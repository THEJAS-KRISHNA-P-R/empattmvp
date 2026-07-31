import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  verifyAdminPassword,
} from '@/lib/adminAuth';

/**
 * POST /api/admin/login
 *
 * Body: { password: string }
 *
 * On success, sets an HttpOnly signed session cookie. This route is one of
 * two paths (with /admin/login) that middleware.ts deliberately leaves
 * unauthenticated — see PUBLIC_ADMIN_PATHS there.
 */
export async function POST(request: Request) {
  try {
    const { password } = (await request.json()) ?? {};

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    if (!verifyAdminPassword(password)) {
      // Deliberately generic + same status regardless of reason, and no
      // attempt-counting here — this is a single shared password behind a
      // login form, not a per-user account. If you need brute-force
      // protection on this specific route, put it behind Vercel's
      // WAF/Attack Challenge Mode or similar at the edge.
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    const token = await createAdminSessionToken();
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (err) {
    console.error('[admin/login] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
