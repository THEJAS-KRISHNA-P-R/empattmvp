import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * POST /api/auth/login
 *
 * Authenticates a field worker and enforces 1:1 device binding (anti-buddy-punching)
 * in BOTH directions: a worker can't switch devices without an admin reset, AND a
 * device can't be claimed by a second worker while already bound to another.
 *
 * Body: { phone: string, employee_id: string, passcode: string, device_uuid: string }
 *
 * Three credential fields (phone + employee_id + PIN) must ALL match the
 * same worker row — this is deliberately stricter than PIN alone, per the
 * spec's 3-field login requirement.
 *
 * Responses carry a machine-readable `code` alongside `error` so the mobile
 * app can react specifically (e.g. clear a stale local session) instead of
 * just displaying text:
 *   200 – Success (first login binds device, subsequent logins verify binding)
 *   400 MISSING_FIELDS
 *   401 INVALID_CREDENTIALS
 *   403 ACCOUNT_DEACTIVATED / ACCOUNT_LOCKED / DEVICE_MISMATCH / DEVICE_ALREADY_CLAIMED
 *   500 INTERNAL_ERROR
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
    const { phone, employee_id, passcode, device_uuid } = body ?? {};

    // --- Input validation ---
    if (!phone || !employee_id || !passcode || !device_uuid) {
      return NextResponse.json(
        {
          error: 'Missing required fields: phone, employee_id, passcode, device_uuid',
          code: 'MISSING_FIELDS',
        },
        { status: 400 }
      );
    }

    // --- 1. Fetch the worker by phone AND employee_id — both must match
    //         the same row (passcode is hashed, compared separately below). ---
    const { data: worker, error } = await supabaseAdmin
      .from('workers')
      .select(
        'id, full_name, phone, employee_id, passcode_hash, bound_device_id, is_active, failed_login_attempts, locked_until'
      )
      .eq('phone', phone.trim())
      .eq('employee_id', String(employee_id).trim())
      .single();

    // Generic message either way — don't reveal which of the three fields
    // was wrong.
    const invalidCredsResponse = () =>
      NextResponse.json(
        { error: 'Invalid phone number, employee ID, or PIN', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );

    if (error || !worker) {
      return invalidCredsResponse();
    }

    // --- 2. Check worker is active ---
    if (!worker.is_active) {
      return NextResponse.json(
        { error: 'This worker account has been deactivated. Contact admin.', code: 'ACCOUNT_DEACTIVATED' },
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
          code: 'ACCOUNT_LOCKED',
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

    // --- 6. Hardware lock verification (race-safe, both directions) ---
    //
    // Two directions of "1:1" both need enforcing:
    //   (a) this worker's account must not be bound to a DIFFERENT device
    //       than the one making this request (handled below)
    //   (b) this device must not already belong to a DIFFERENT worker
    //       (checked here, and backstopped by a DB-level unique index —
    //       idx_workers_bound_device_unique in schema.sql — since a
    //       plain SELECT-then-UPDATE check has the same TOCTOU race as
    //       the single-worker bind below)
    const deviceAlreadyClaimedResponse = () =>
      NextResponse.json(
        {
          error: 'This device is already registered to another worker account. Contact admin.',
          code: 'DEVICE_ALREADY_CLAIMED',
        },
        { status: 403 }
      );

    const deviceMismatchResponse = () =>
      NextResponse.json(
        {
          error: 'This account is locked to a different physical device. Contact admin to reset.',
          code: 'DEVICE_MISMATCH',
        },
        { status: 403 }
      );

    if (!worker.bound_device_id) {
      const { data: deviceOwner } = await supabaseAdmin
        .from('workers')
        .select('id')
        .eq('bound_device_id', device_uuid)
        .neq('id', worker.id)
        .maybeSingle();

      if (deviceOwner) {
        return deviceAlreadyClaimedResponse();
      }

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
        // 23505 = unique_violation. This fires if a DIFFERENT worker's
        // login request bound this exact device in the split second
        // between the deviceOwner check above and this write — the
        // application-level check above narrows the window, but only
        // idx_workers_bound_device_unique in the database actually closes
        // it. This is what closing the race looks like, not a bug.
        if (bindError.code === '23505') {
          return deviceAlreadyClaimedResponse();
        }
        console.error('[login] Failed to bind device:', bindError);
        return NextResponse.json(
          { error: 'Failed to bind device. Try again.', code: 'INTERNAL_ERROR' },
          { status: 500 }
        );
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
          return deviceMismatchResponse();
        }
        // Otherwise: the concurrent request bound this SAME device — fine, proceed.
      }
    } else if (worker.bound_device_id !== device_uuid) {
      // Security rejection: credential is locked to a different device
      return deviceMismatchResponse();
    }

    // --- 7. Return success with worker data ---
    return NextResponse.json({
      success: true,
      worker: {
        id: worker.id,
        full_name: worker.full_name,
        phone: worker.phone,
        employee_id: worker.employee_id,
      },
    });
  } catch (err) {
    console.error('[login] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
