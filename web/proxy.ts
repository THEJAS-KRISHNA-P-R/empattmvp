import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/adminAuth';

// Routes that must stay reachable WITHOUT an admin session — they're how
// you get one in the first place.
const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/api/admin/login']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = await verifyAdminSessionToken(token);

  if (isAuthenticated) {
    return NextResponse.next();
  }

  // API routes get a JSON 401 (the mobile app never hits these — see
  // app/api/sites/route.ts for the one admin-adjacent route that's
  // deliberately public). The admin dashboard's own fetch calls will
  // surface this as an error toast; a real product would redirect
  // client-side on 401, which is a reasonable next iteration.
  if (pathname.startsWith('/api/admin')) {
    return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
  }

  // Page routes (/admin, /admin/anything) redirect to the login page.
  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
