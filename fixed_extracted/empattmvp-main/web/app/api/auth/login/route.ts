import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

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
 *   403 – Account bound to a different device, deactivated, or temporarily locked
 *   500 – Internal server error
 *
 * device_uuid MUST be Settings.Secure.ANDROID_ID (read via the `android_id`
 * package on the mobile side), not device_info_plus's `.id` field — that
 * field is the OS build label, identical across every phone on the same
 * firmware build, and does not identify a specific device. See
 * mobile/lib/services/device_service.dart for the corrected implementation.
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

    // --- 1. Fetch the worker by phone only (passcode is hashed — it can't be
    //         filtered in SQL, we compare it with bcrypt after fetching). ---
    const { data: worker, error } = await supabaseAdmin
      .from('workers')
      .select(
        'id, full_name, phone, passcode_hash, bound_device_id, is_active, failed_login_attempts, locked_until'
      )
      .eq('phone', phone.trim())
      .single();

    // Generic message either way — don't reveal whether the phone number
    // itself is registered.
    const invalidCredsResponse = () =>
      NextResponse.json({ error: 'Invalid phone number or passcode' }, { status: 401 });

    if (error || !worker) {
      return invalidCredsResponse();
    }

    // --- 2. Check worker is active ---
    if (!worker.is_active) {
      return NextResponse.json(
        { error: 'This worker account has been deactivated. Contact admin.' },
        { status: 403 }
      );
    }

    // --- 3. Check lockout (tracked in the DB, not in memory — this is a
    //         serverless function; there is no shared memory between
    //         invocations for an in-process rate limiter to live in). ---
    if (worker.locked_until && new Date(worker.locked_until).getTime() > Date.now()) {
      const minutesLeft = Math.ceil(
        (new Date(worker.locked_until).getTime() - Date.now()) / 60000
      );
      return NextResponse.json(
        {
          error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
        },
        { status: 403 }
      );
    }

    // --- 4. Verify passcode ---
    const passcodeMatches = await bcrypt.compare(String(passcode).trim(), worker.passcode_hash);

    if (!passcodeMatches) {
      const newFailedAttempts = (worker.failed_login_attempts ?? 0) + 1;
      const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

      await supabaseAdmin
        .from('workers')
        .update({
          failed_login_attempts: shouldLock ? 0 : newFailedAttempts,
          locked_until: shouldLock
            ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000).toISOString()
            : null,
        })
        .eq('id', worker.id);

      return invalidCredsResponse();
    }

    // --- 5. Passcode correct — reset lockout counters ---
    await supabaseAdmin
      .from('workers')
      .update({ failed_login_attempts: 0, locked_until: null })
      .eq('id', worker.id);

    // --- 6. Hardware lock verification (race-safe) ---
    if (!worker.bound_device_id) {
      // First login — atomically bind this device, but ONLY if the column
      // is still NULL at write time. Two simultaneous first-logins from
      // different physical devices would otherwise both pass the
      // `!worker.bound_device_id` check above (read at slightly different
      // times) and the second write could silently overwrite the first,
      // binding the account to the second device without ever having
      // verified the first device lost its claim. The `.is('bound_device_id',
      // null)` condition below makes the write itself the race gate, not
      // the earlier read.
      const { data: bindResult, error: bindError } = await supabaseAdmin
        .from('workers')
        .update({ bound_device_id: device_uuid })
        .eq('id', worker.id)
        .is('bound_device_id', null)
        .select('bound_device_id')
        .maybeSingle();

      if (bindError) {
        console.error('[login] Failed to bind device:', bindError);
        return NextResponse.json({ error: 'Failed to bind device. Try again.' }, { status: 500 });
      }

      if (!bindResult) {
        // Someone else's request won the race and bound a device first.
        // Re-check what actually landed.
        const { data: recheck } = await supabaseAdmin
          .from('workers')
          .select('bound_device_id')
          .eq('id', worker.id)
          .single();

        if (recheck?.bound_device_id !== device_uuid) {
          return NextResponse.json(
            {
              error:
                'This account is locked to a different physical device. Contact admin to reset.',
            },
            { status: 403 }
          );
        }
        // Otherwise: the concurrent request bound this SAME device — fine, proceed.
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

    // --- 7. Return success with worker data ---
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
