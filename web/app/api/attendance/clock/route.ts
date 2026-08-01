import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { haversineDistanceMeters } from '@/lib/geo';

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
 *
 * Geofence and IN/OUT-sequence checks are FLAGGED, never blocking — same
 * philosophy as is_mock_location in the original spec: record the anomaly
 * for the admin to review, never lock a worker out of clocking in/out over
 * a GPS reading or a missed sync. A hard block here would turn a data-
 * quality signal into a worker being unable to log their hours, which is
 * a worse failure mode than the anomaly itself.
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
      return NextResponse.json(
        { error: 'Worker not found', code: 'WORKER_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!worker.is_active) {
      return NextResponse.json(
        { error: 'Worker account is deactivated', code: 'ACCOUNT_DEACTIVATED' },
        { status: 403 }
      );
    }

    if (worker.bound_device_id !== device_uuid) {
      // This fires both for a genuinely different/spoofed device AND for
      // the legitimate case of "admin unbound this device from the
      // dashboard" — the mobile app treats DEVICE_MISMATCH as "your local
      // session is stale, log in again" rather than just showing an error
      // on every clock attempt with no path forward. See
      // ApiService/dashboard_screen.dart on the mobile side.
      return NextResponse.json(
        {
          error: 'Device UUID mismatch. This request is rejected for security.',
          code: 'DEVICE_MISMATCH',
        },
        { status: 403 }
      );
    }

    // --- 2. Verify site exists, fetch its geofence ---
    const { data: site, error: siteError } = await supabaseAdmin
      .from('work_sites')
      .select('id, latitude, longitude, radius_meters, is_active')
      .eq('id', site_id)
      .single();

    if (siteError || !site || !site.is_active) {
      // A deleted site must not block a clock-OUT — the worker needs to be
      // able to end their shift even if an admin removed the site.
      if (event_type === 'OUT') {
        // Allow the OUT to proceed without geofence checks
        const { error: insertError } = await supabaseAdmin.from('clock_logs').insert({
          worker_id,
          site_id,
          event_type: 'OUT',
          latitude: Number(latitude),
          longitude: Number(longitude),
          accuracy_meters: Number(accuracy_meters ?? 0),
          is_mock_location: Boolean(is_mock_location),
          distance_from_site_meters: 0,
          within_geofence: false,
          sequence_anomaly: true, // flag it since site is gone
          client_timestamp,
        });
        if (insertError) {
          return NextResponse.json({ error: 'Failed to record clock out' }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: 'Clocked OUT successfully!' });
      }
      return NextResponse.json({ error: 'Work site not found or inactive' }, { status: 404 });
    }


    // --- 3. Geofence check (flag only) ---
    const distanceMeters = haversineDistanceMeters(
      Number(latitude),
      Number(longitude),
      site.latitude,
      site.longitude
    );
    const withinGeofence = distanceMeters <= site.radius_meters;

    // A worker clocking IN while their last event was also IN (or clocking
    // OUT with no prior IN) breaks the IN->OUT pairing. Per user request,
    // we now reject these entirely on the server.
    const { data: lastLog } = await supabaseAdmin
      .from('clock_logs')
      .select('event_type')
      .eq('worker_id', worker_id)
      .order('client_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (event_type === 'IN' && lastLog?.event_type === 'IN') {
      return NextResponse.json(
        { error: 'You are already clocked in. Please clock out first.' },
        { status: 400 }
      );
    }

    if (event_type === 'OUT' && (!lastLog || lastLog.event_type === 'OUT')) {
      return NextResponse.json(
        { error: 'You are not clocked in. Please clock in first.' },
        { status: 400 }
      );
    }

    // --- 5. Insert clock log ---
    const { error: insertError } = await supabaseAdmin.from('clock_logs').insert({
      worker_id,
      site_id,
      event_type,
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy_meters: Number(accuracy_meters ?? 0),
      is_mock_location: Boolean(is_mock_location),
      distance_from_site_meters: Math.round(distanceMeters),
      within_geofence: withinGeofence,
      sequence_anomaly: false,
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
      // Additive/optional — the current mobile app ignores these, but
      // they're here for a future version to surface a soft warning
      // ("You appear to be 850m from the site — clock in anyway?").
      warnings: {
        outside_geofence: !withinGeofence,
        distance_from_site_meters: Math.round(distanceMeters),
      },
    });
  } catch (err) {
    console.error('[clock] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
