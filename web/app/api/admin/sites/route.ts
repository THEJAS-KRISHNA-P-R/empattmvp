import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/sites
 *
 * Returns all active work sites.
 * Used by Admin Dashboard dropdowns and the Flutter mobile app site picker.
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
