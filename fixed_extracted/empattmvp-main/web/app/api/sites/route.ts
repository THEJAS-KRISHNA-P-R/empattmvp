import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/sites
 *
 * Returns all active work sites (id, name, lat/lng, radius only — no
 * worker or attendance data). Used by the Flutter mobile app's site
 * picker.
 *
 * Deliberately NOT under /api/admin/ and NOT behind the admin password
 * gate in middleware.ts: the mobile worker app needs this list before/
 * independent of any admin session, and a plain site directory isn't
 * sensitive the way worker/attendance data is.
 */
export async function GET() {
  try {
    const { data: sites, error } = await supabaseAdmin
      .from('work_sites')
      .select('id, name, latitude, longitude, radius_meters')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[sites] Fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch work sites' }, { status: 500 });
    }

    return NextResponse.json({ sites: sites ?? [] });
  } catch (err) {
    console.error('[sites] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
