import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/admin/reset-device
 *
 * "Reset Phone Lock" — clears a worker's bound device, letting them log in
 * from a new/replacement phone. Endpoint path kept as reset-device (an
 * internal detail); user-facing text everywhere else says "Reset Phone
 * Lock" per the spec's terminology.
 *
 * Body: { worker_id: string (UUID) }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { worker_id } = body ?? {};

    if (!worker_id) {
      return NextResponse.json({ error: 'Missing required field: worker_id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('workers')
      .update({ bound_device_id: null })
      .eq('id', worker_id);

    if (error) {
      console.error('[reset-device] Update error:', error);
      return NextResponse.json({ error: 'Failed to reset phone lock' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Phone lock has been reset. Worker can now log in from a new phone.',
    });
  } catch (err) {
    console.error('[reset-device] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
