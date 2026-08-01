import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * DELETE /api/admin/sites/[id]
 *
 * Hard-deletes a work site for MVP simplicity.
 *
 * Edge cases handled:
 * 1. Deletes all clock_logs referencing this site first (FK constraint).
 * 2. Resets bound workers' current session — if a worker is currently
 *    clocked IN at this site, their last log is removed so they don't
 *    get stuck in a permanent IN state with no way to clock OUT.
 * 3. The mobile app's ghost-site injection handles the case where the
 *    app locally still shows the deleted site — the worker will see
 *    "Archived" and be prompted to clock out.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Missing site ID' }, { status: 400 });
    }

    // Step 1: Delete all clock_logs referencing this site.
    // site_id is NOT NULL in the DB so we cannot nullify — delete the rows.
    const { error: logsError } = await supabaseAdmin
      .from('clock_logs')
      .delete()
      .eq('site_id', id);

    if (logsError) {
      console.error('[site-delete] clock_logs delete failed:', logsError);
      return NextResponse.json(
        { error: 'Failed to remove clock logs: ' + logsError.message },
        { status: 500 }
      );
    }

    // Step 2: Hard-delete the site row.
    const { error: siteError } = await supabaseAdmin
      .from('work_sites')
      .delete()
      .eq('id', id);

    if (siteError) {
      console.error('[site-delete] work_sites delete failed:', siteError);
      return NextResponse.json(
        { error: 'Failed to delete site: ' + siteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[site-delete] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
