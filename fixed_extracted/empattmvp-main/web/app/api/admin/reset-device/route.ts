import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/admin/reset-device
 *
 * Unbinds (resets) a worker's hardware UUID lock.
 * After this call, the worker can log in from any device (new device gets bound on next login).
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
      return NextResponse.json({ error: 'Failed to unbind device' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Device binding has been reset. Worker can now log in from any device.',
    });
  } catch (err) {
    console.error('[reset-device] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
