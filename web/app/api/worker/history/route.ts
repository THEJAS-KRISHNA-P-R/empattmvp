import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const worker_id = searchParams.get('worker_id');

    if (!worker_id) {
      return NextResponse.json({ error: 'worker_id is required' }, { status: 400 });
    }

    // Join with work_sites to get the site name
    const { data, error } = await supabaseAdmin
      .from('clock_logs')
      .select(`
        id,
        event_type,
        client_timestamp,
        distance_from_site_meters,
        within_geofence,
        work_sites (
          name
        )
      `)
      .eq('worker_id', worker_id)
      .order('client_timestamp', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    // Map to a cleaner structure for the mobile app
    const history = data.map((log: any) => ({
      id: log.id,
      event_type: log.event_type,
      client_timestamp: log.client_timestamp,
      distance_from_site_meters: log.distance_from_site_meters,
      within_geofence: log.within_geofence,
      site_name: log.work_sites?.name ?? 'Unknown Site',
    }));

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (err) {
    console.error('[history] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
