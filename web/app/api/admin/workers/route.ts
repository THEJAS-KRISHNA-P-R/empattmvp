import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';

const BCRYPT_ROUNDS = 10;
const MIN_PIN_LENGTH = 4;

/**
 * GET /api/admin/workers?date=YYYY-MM-DD
 *
 * Returns all active workers with their latest clock_log status for the given date.
 * Used by the Admin Dashboard sidebar to show worker status badges.
 *
 * Response shape per worker:
 * {
 *   id, full_name, phone, employee_id, bound_device_id,
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
      .select('id, full_name, phone, employee_id, bound_device_id, is_active')
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
          employee_id: worker.employee_id,
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

/**
 * POST /api/admin/workers
 *
 * Creates a new field worker. This is the ONLY place a worker's PIN ever
 * exists in plaintext outside the admin's own head — it's hashed
 * immediately and returned exactly once in this response so the admin can
 * copy it or share it over WhatsApp. It is never retrievable again after
 * this call; if lost, the admin has to set a new one (there's no "forgot
 * PIN" flow in this MVP — resetting the phone lock and reissuing a PIN
 * are the same "something's wrong, fix it from the dashboard" motion).
 *
 * Body: { full_name: string, phone: string, employee_id: string, pin: string }
 *
 * Responses:
 *   201 – Created. Body includes the ONE-TIME plaintext PIN.
 *   400 – Missing/invalid fields
 *   409 – Phone or employee_id already in use
 *   500 – Internal error
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const full_name = String(body?.full_name ?? '').trim();
    const phone = String(body?.phone ?? '').trim();
    const employee_id = String(body?.employee_id ?? '').trim();
    const pin = String(body?.pin ?? '');

    if (!full_name || !phone || !employee_id || !pin) {
      return NextResponse.json(
        { error: 'full_name, phone, employee_id, and pin are all required' },
        { status: 400 }
      );
    }

    if (pin.length < MIN_PIN_LENGTH) {
      return NextResponse.json(
        { error: `PIN must be at least ${MIN_PIN_LENGTH} characters` },
        { status: 400 }
      );
    }

    const passcode_hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    const { data: worker, error } = await supabaseAdmin
      .from('workers')
      .insert({ full_name, phone, employee_id, passcode_hash })
      .select('id, full_name, phone, employee_id')
      .single();

    if (error) {
      // 23505 = unique_violation — phone or employee_id already taken.
      // Postgres tells us which constraint via error.details/message; we
      // don't have a clean structured field for "which column" from
      // PostgREST, so a substring check on the constraint name is the
      // pragmatic way to give a specific message instead of a generic one.
      if (error.code === '23505') {
        const onPhone = error.message?.includes('phone');
        return NextResponse.json(
          {
            error: onPhone
              ? 'A worker with this phone number already exists.'
              : 'A worker with this employee ID already exists.',
          },
          { status: 409 }
        );
      }
      console.error('[workers] Create error:', error);
      return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        worker: {
          id: worker.id,
          full_name: worker.full_name,
          phone: worker.phone,
          employee_id: worker.employee_id,
          // Plaintext, one time only — see the doc comment above.
          pin,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[workers] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
