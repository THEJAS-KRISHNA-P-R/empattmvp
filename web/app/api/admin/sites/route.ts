import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, latitude, longitude, radius_meters } = body ?? {};

    if (!name || latitude == null || longitude == null || radius_meters == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: site, error } = await supabaseAdmin
      .from('work_sites')
      .insert({
        name,
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius_meters: Number(radius_meters),
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('[site-create]', error);
      return NextResponse.json({ error: 'Failed to create site' }, { status: 500 });
    }

    return NextResponse.json({ site });
  } catch (err) {
    console.error('[site-create]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
