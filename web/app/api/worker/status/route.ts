import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const worker_id = searchParams.get('worker_id');

    if (!worker_id) {
      return NextResponse.json({ error: 'worker_id is required' }, { status: 400 });
    }

    const { data: worker, error: workerError } = await supabaseAdmin
      .from('workers')
      .select('is_active')
      .eq('id', worker_id)
      .single();

    if (workerError || !worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    if (!worker.is_active) {
      return NextResponse.json({ error: 'Worker is deactivated' }, { status: 403 });
    }

    const { data: lastLog, error: logError } = await supabaseAdmin
      .from('clock_logs')
      .select('event_type, client_timestamp, site_id')
      .eq('worker_id', worker_id)
      .order('client_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logError) {
      throw logError;
    }

    return NextResponse.json({
      success: true,
      status: {
        last_event: lastLog?.event_type ?? null,
        client_timestamp: lastLog?.client_timestamp ?? null,
        site_id: lastLog?.site_id ?? null,
      },
    });
  } catch (err) {
    console.error('[status] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
