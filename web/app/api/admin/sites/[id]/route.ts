import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // Step 1: Delete all attendance logs tied to this site.
    // site_id is NOT NULL in the DB so we can't nullify — we delete the logs instead.
    const { error: logError } = await supabaseAdmin
      .from('attendance_logs')
      .delete()
      .eq('site_id', id);

    if (logError) {
      console.error('[site-delete] Could not delete attendance_logs:', logError);
      return NextResponse.json(
        { error: 'Failed to remove attendance records: ' + logError.message },
        { status: 500 }
      );
    }

    // Step 2: Hard-delete the site row.
    const { error } = await supabaseAdmin
      .from('work_sites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[site-delete]', error);
      return NextResponse.json(
        { error: 'Failed to delete site: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[site-delete]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
