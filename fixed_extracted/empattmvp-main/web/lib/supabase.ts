import { createClient } from '@supabase/supabase-js';

// Server-side client using the Service Role Key — this BYPASSES Row Level
// Security entirely. Every table in supabase/schema.sql has RLS disabled
// (see the comment there), so this client has unrestricted read/write
// access to all worker, site, and clock-log data.
//
// NEVER import this into a client component, and never expose
// SUPABASE_SERVICE_ROLE_KEY via a NEXT_PUBLIC_* env var. Use this only
// inside API Routes (route.ts files) and Server Components — anything
// that actually runs on the server.
//
// There is deliberately no separate anon-key client exported here. With
// RLS off, an anon-key client used from the browser would hand out
// unrestricted read/write access to every table to anyone who opens the
// page — there's no safe way to use one until RLS policies exist.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
