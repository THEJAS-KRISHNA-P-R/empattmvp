# EmpAtt — Admin Dashboard & API (Next.js)

Field worker attendance/GPS tracking backend + admin dashboard.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Supabase project** (or use your existing one), then run the
   schema:
   - New project: paste `supabase/schema.sql` into the Supabase SQL Editor and run it.
   - Existing project (upgrading from an earlier version of this app): paste
     `supabase/migration_v2.sql` into the SQL Editor instead. See the comment
     at the top of that file for what it does.

3. **Environment variables** — copy `.env.example` to `.env.local` and fill
   in real values:
   ```bash
   cp .env.example .env.local
   ```
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
     `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Project Settings → API.
   - `ADMIN_PASSWORD` — the password for `/admin`. This is a single shared
     password, not per-admin accounts — appropriate for a demo, not for a
     real multi-admin product.
   - `ADMIN_SESSION_SECRET` — generate with `openssl rand -hex 32`.

4. **Run locally**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000/admin` and log in with `ADMIN_PASSWORD`.

5. **Deploy** — push to Vercel, set the same environment variables in the
   Vercel project settings.

## Demo credentials (seeded by schema.sql)

| Worker | Phone | Passcode |
|---|---|---|
| John Field Worker | +1234567890 | 1234 |
| Sarah Inspector | +0987654321 | 5678 |

These are for the mobile app login screen, not the admin dashboard.

## API surface

- `POST /api/auth/login` — worker login + device binding (mobile app)
- `POST /api/attendance/clock` — clock IN/OUT (mobile app)
- `GET /api/sites` — active work sites (mobile app; deliberately public, see
  the comment in that route for why)
- `POST /api/admin/login` / `POST /api/admin/logout` — admin session
- `GET /api/admin/workers` — worker list + status (admin dashboard)
- `GET /api/admin/clock-logs` — a worker's events for a date (admin dashboard)
- `POST /api/admin/reset-device` — unbind a worker's device (admin dashboard)

Everything under `/api/admin/*` (except `/api/admin/login`) requires the
admin session cookie — see `proxy.ts`.

## Known limitations (by design, for a demo at this scale)

- Single shared admin password, no per-admin accounts or audit trail on who
  unbound which device.
- Row Level Security is disabled on all tables — every table access goes
  through the service role key in API routes. Don't point a browser client
  at Supabase directly with the anon key until real RLS policies exist.
- Geofence and IN/OUT-sequence checks are flagged for the admin to review,
  never blocking — a worker can always clock in/out even if the reading
  looks anomalous.
