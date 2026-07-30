import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/attendance/clock
 *
 * Records a clock-in or clock-out event for a field worker.
 * Validates device binding before inserting into clock_logs.
 *
 * Body: {
 *   worker_id: string (UUID)
 *   device_uuid: string
 *   site_id: string (UUID)
 *   event_type: 'IN' | 'OUT'
 *   latitude: number
 *   longitude: number
 *   accuracy_meters: number
 *   is_mock_location: boolean
 *   client_timestamp: string (ISO 8601)
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      worker_id,
      device_uuid,
      site_id,
      event_type,
      latitude,
      longitude,
      accuracy_meters,
      is_mock_location,
      client_timestamp,
    } = body ?? {};

    // --- Input validation ---
    if (!worker_id || !device_uuid || !site_id || !event_type || latitude == null || longitude == null || !client_timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['IN', 'OUT'].includes(event_type)) {
      return NextResponse.json(
        { error: 'event_type must be IN or OUT' },
        { status: 400 }
      );
    }

    // --- 1. Verify device binding (anti-spoofing) ---
    const { data: worker, error: workerError } = await supabaseAdmin
      .from('workers')
      .select('bound_device_id, is_active')
      .eq('id', worker_id)
      .single();

    if (workerError || !worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    if (!worker.is_active) {
      return NextResponse.json({ error: 'Worker account is deactivated' }, { status: 403 });
    }

    if (worker.bound_device_id !== device_uuid) {
      return NextResponse.json(
        { error: 'Device UUID mismatch. This request is rejected for security.' },
        { status: 403 }
      );
    }

    // --- 2. Verify site exists ---
    const { data: site, error: siteError } = await supabaseAdmin
      .from('work_sites')
      .select('id')
      .eq('id', site_id)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Work site not found' }, { status: 404 });
    }

    // --- 3. Insert clock log ---
    const { error: insertError } = await supabaseAdmin.from('clock_logs').insert({
      worker_id,
      site_id,
      event_type,
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy_meters: Number(accuracy_meters ?? 0),
      is_mock_location: Boolean(is_mock_location),
      client_timestamp,
    });

    if (insertError) {
      console.error('[clock] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to record clock event' }, { status: 500 });
    }

    const label = event_type === 'IN' ? 'IN' : 'OUT';
    return NextResponse.json({
      success: true,
      message: `Clocked ${label} successfully!`,
    });
  } catch (err) {
    console.error('[clock] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
