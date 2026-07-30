import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/auth/login
 *
 * Authenticates a field worker and enforces 1:1 device binding (anti-buddy-punching).
 *
 * Body: { phone: string, passcode: string, device_uuid: string }
 *
 * Responses:
 *   200 – Success (first login binds device, subsequent logins verify binding)
 *   400 – Missing required fields
 *   401 – Invalid phone/passcode
 *   403 – Account bound to a different device
 *   500 – Internal server error
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, passcode, device_uuid } = body ?? {};

    // --- Input validation ---
    if (!phone || !passcode || !device_uuid) {
      return NextResponse.json(
        { error: 'Missing required fields: phone, passcode, device_uuid' },
        { status: 400 }
      );
    }

    // --- 1. Verify credentials ---
    const { data: worker, error } = await supabaseAdmin
      .from('workers')
      .select('id, full_name, phone, bound_device_id, is_active')
      .eq('phone', phone.trim())
      .eq('passcode', passcode.trim())
      .single();

    if (error || !worker) {
      return NextResponse.json(
        { error: 'Invalid phone number or passcode' },
        { status: 401 }
      );
    }

    // --- 2. Check worker is active ---
    if (!worker.is_active) {
      return NextResponse.json(
        { error: 'This worker account has been deactivated. Contact admin.' },
        { status: 403 }
      );
    }

    // --- 3. Hardware lock verification ---
    if (!worker.bound_device_id) {
      // First login — permanently bind this hardware UUID to this account
      const { error: updateError } = await supabaseAdmin
        .from('workers')
        .update({ bound_device_id: device_uuid })
        .eq('id', worker.id);

      if (updateError) {
        console.error('[login] Failed to bind device:', updateError);
        return NextResponse.json({ error: 'Failed to bind device. Try again.' }, { status: 500 });
      }
    } else if (worker.bound_device_id !== device_uuid) {
      // Security rejection: credential is locked to a different device
      return NextResponse.json(
        {
          error:
            'This account is locked to a different physical device. Contact admin to reset.',
        },
        { status: 403 }
      );
    }

    // --- 4. Return success with worker data ---
    return NextResponse.json({
      success: true,
      worker: {
        id: worker.id,
        full_name: worker.full_name,
        phone: worker.phone,
      },
    });
  } catch (err) {
    console.error('[login] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
