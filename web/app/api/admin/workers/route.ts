import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/workers?date=YYYY-MM-DD
 *
 * Returns all active workers with their latest clock_log status for the given date.
 * Used by the Admin Dashboard sidebar to show worker status badges.
 *
 * Response shape per worker:
 * {
 *   id, full_name, phone, bound_device_id,
 *   latest_event: { event_type, site_name, client_timestamp } | null
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

    // Fetch all active workers
    const { data: workers, error: workersError } = await supabaseAdmin
      .from('workers')
      .select('id, full_name, phone, bound_device_id, is_active')
      .eq('is_active', true)
      .order('full_name');

    if (workersError) {
      console.error('[workers] Fetch error:', workersError);
      return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 });
    }

    // For each worker, fetch their latest clock log for the date
    const enriched = await Promise.all(
      (workers ?? []).map(async (worker) => {
        const { data: logs } = await supabaseAdmin
          .from('clock_logs')
          .select('event_type, client_timestamp, site_id, work_sites(name)')
          .eq('worker_id', worker.id)
          .gte('client_timestamp', `${date}T00:00:00Z`)
          .lte('client_timestamp', `${date}T23:59:59Z`)
          .order('client_timestamp', { ascending: false })
          .limit(1);

        const latest = logs?.[0] ?? null;

        return {
          id: worker.id,
          full_name: worker.full_name,
          phone: worker.phone,
          is_bound: !!worker.bound_device_id,
          latest_event: latest
            ? {
                event_type: latest.event_type,
                // @ts-expect-error — Supabase join type inference
                site_name: latest.work_sites?.name ?? 'Unknown Site',
                client_timestamp: latest.client_timestamp,
              }
            : null,
        };
      })
    );

    return NextResponse.json({ workers: enriched });
  } catch (err) {
    console.error('[workers] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
