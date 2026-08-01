import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // For MVP: nullify site_id in attendance_logs referencing this site so
    // the FK constraint doesn't block deletion.
    const { error: logError } = await supabaseAdmin
      .from('attendance_logs')
      .update({ site_id: null })
      .eq('site_id', id);

    if (logError) {
      console.error('[site-delete] Could not nullify attendance_logs:', logError);
      return NextResponse.json({ error: 'Failed to unlink attendance records before deleting site.' }, { status: 500 });
    }

    // Now hard-delete the site row.
    const { error } = await supabaseAdmin
      .from('work_sites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[site-delete]', error);
      return NextResponse.json({ error: 'Failed to delete site: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[site-delete]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
