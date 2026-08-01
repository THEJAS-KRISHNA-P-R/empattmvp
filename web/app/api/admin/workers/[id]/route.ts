import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;
const MIN_PIN_LENGTH = 4;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const { full_name, phone, employee_id, pin, is_active } = body ?? {};
    
    // Await params per Next.js 15+ changes, though currently in 14 it's sync. Safe practice.
    const { id } = await context.params;

    if (!id || !full_name || !phone || !employee_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    if (!/^\+91\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Phone number must be exactly 10 digits with a +91 prefix' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      full_name,
      phone,
      employee_id,
      is_active: Boolean(is_active)
    };

    if (pin && pin.length >= MIN_PIN_LENGTH) {
      updates.pin_hash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    } else if (pin) {
      return NextResponse.json({ error: `PIN must be at least ${MIN_PIN_LENGTH} characters` }, { status: 400 });
    }

    const { data: worker, error } = await supabaseAdmin
      .from('workers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Phone number or Employee ID already in use' }, { status: 409 });
      }
      console.error('[worker-update]', error);
      return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
    }

    return NextResponse.json({ worker });
  } catch (err) {
    console.error('[worker-update]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const { error } = await supabaseAdmin.from('workers').delete().eq('id', id);

    if (error) {
      console.error('[worker-delete]', error);
      return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[worker-delete]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
