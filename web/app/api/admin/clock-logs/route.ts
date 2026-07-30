import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/clock-logs?worker_id=UUID&date=YYYY-MM-DD
 *
 * Returns all clock log entries for a specific worker on a specific date,
 * ordered by client_timestamp ASC — used by the map to draw journey traces.
 *
 * Response shape:
 * {
 *   logs: Array<{
 *     id, event_type, latitude, longitude,
 *     accuracy_meters, is_mock_location,
 *     client_timestamp, site_name
 *   }>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const worker_id = searchParams.get('worker_id');
    const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

    if (!worker_id) {
      return NextResponse.json({ error: 'Missing required query param: worker_id' }, { status: 400 });
    }

    const { data: logs, error } = await supabaseAdmin
      .from('clock_logs')
      .select(
        'id, event_type, latitude, longitude, accuracy_meters, is_mock_location, client_timestamp, work_sites(name)'
      )
      .eq('worker_id', worker_id)
      .gte('client_timestamp', `${date}T00:00:00Z`)
      .lte('client_timestamp', `${date}T23:59:59Z`)
      .order('client_timestamp', { ascending: true });

    if (error) {
      console.error('[clock-logs] Fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch clock logs' }, { status: 500 });
    }

    const formatted = (logs ?? []).map((log) => ({
      id: log.id,
      event_type: log.event_type,
      latitude: log.latitude,
      longitude: log.longitude,
      accuracy_meters: log.accuracy_meters,
      is_mock_location: log.is_mock_location,
      client_timestamp: log.client_timestamp,
      // @ts-expect-error — Supabase join type inference
      site_name: log.work_sites?.name ?? 'Unknown Site',
    }));

    return NextResponse.json({ logs: formatted });
  } catch (err) {
    console.error('[clock-logs] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
