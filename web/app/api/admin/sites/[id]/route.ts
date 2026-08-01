import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const { error } = await supabaseAdmin.from('work_sites').delete().eq('id', id);

    if (error) {
      console.error('[site-delete]', error);
      return NextResponse.json({ error: 'Failed to delete site (ensure no workers are linked to it)' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[site-delete]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
