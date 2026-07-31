# EmpAtt MVP — Audit & Fix Log

**Context:** This repo (`empattmvp-main.zip`) was uploaded as an existing,
already-scaffolded implementation of a field worker GPS attendance system
(Next.js admin dashboard + Flutter mobile app + Supabase). This was NOT a
from-scratch build — it was a real, mostly-working codebase with a live
Supabase project already behind it. This document is the full record of
what was found and what was changed, in case future-you (or anyone else
working on this) needs to know why something is the way it is.

Everything below was found by actually reading the code and, on the web
side, actually running it — not by inspecting file names or trusting
comments. See "What was verified vs not" at the end for exactly what that
means and where the limits are.

---

## Critical findings (fixed)

### 1. A live database password was committed to the repo
`web/run-schema.js` had a hardcoded Supabase Postgres **superuser**
connection string with the password in plaintext, in a file not covered by
`.gitignore`. **Deleted** (along with the empty duplicate `run_schema.mjs`).

**Action required from you, independent of anything in this repo:**
rotate the Supabase database password (Project Settings → Database →
Reset Database Password) and rotate the service role / anon keys if this
repo was ever pushed to a remote git host, public or private. Nothing in
this fix does that for you.

### 2. Device binding — the core anti-buddy-punching feature — didn't work
`device_service.dart` read `androidInfo.id` from `device_info_plus` and
treated it as a unique hardware ID. It isn't one: that field is Android's
`Build.ID` (the OS firmware build label — e.g. `"AP3A.240905.015.A2"`),
which is **identical across every phone running the same firmware build**.
Two workers with the same phone model on the same security patch level
would silently collide on the same "unique" device ID. `device_info_plus`
also removed real `ANDROID_ID` access entirely a few major versions ago.

**Fix:** switched to the dedicated `android_id` package (verified current
on pub.dev, fluttercommunity/verified publisher), which correctly reads
`Settings.Secure.ANDROID_ID`. See the long comment in
`mobile/lib/services/device_service.dart` — do not swap this back.

Related: the old comment claiming ANDROID_ID "does NOT change on factory
reset" was also factually wrong (confirmed against Android's own docs — it
DOES change on factory reset). That's now moot since the fix changes the
source entirely, but the corrected comment explains why a factory-reset
phone requiring admin re-authorization is the *intended* behavior, not a
bug.

### 3. Zero authentication on the admin dashboard
Anyone with the URL could hit `/admin` or any `/api/admin/*` route and see
every worker's GPS trail, or unbind any device. Not addressed anywhere in
the original spec.

**Fix:** added a single shared admin password (`ADMIN_PASSWORD` env var) +
signed session cookie (`lib/adminAuth.ts`), enforced by `proxy.ts` (see
naming note below) on `/admin/*` and `/api/admin/*`. Login page at
`/admin/login`, logout button added to the dashboard sidebar.

This is deliberately minimal — one password, no per-admin accounts, no
audit trail of who unbound which device. That's proportionate to what the
original spec needed (a single admin, a 10-user demo), not a claim that
it's enterprise-ready.

**Important catch made before wiring this up:** `/api/admin/sites` was
actually called by the *mobile app* (site picker), not the admin
dashboard — nothing in the web frontend used it. Gating it behind the new
admin password would have locked workers out of fetching the site list.
Moved it to `/api/sites` (unauthenticated by design — see the comment in
that route) before adding the auth gate, and updated the Flutter call site
to match.

### 4. Passcodes stored and compared in plaintext
4-digit passcode, no hashing, no rate limiting — trivially brute-forceable,
and a fully compromised credential set if the DB ever leaks (see #1).

**Fix:** `passcode_hash` (bcrypt, via `bcryptjs`) replaces the plaintext
`passcode` column. Login now does `bcrypt.compare()`. Added DB-backed
lockout (`failed_login_attempts`, `locked_until`) — 5 failed attempts locks
the account for 15 minutes. This is DB-backed rather than in-memory
deliberately: API routes run as serverless functions on Vercel, which
don't share memory between invocations, so an in-process rate limiter would
silently do nothing.

`supabase/migration_v2.sql` handles upgrading your *existing* live DB
(backfills bcrypt hashes from the old plaintext column via `pgcrypto`,
then drops it) — `schema.sql` alone only describes a fresh database, it
won't touch existing data.

---

## Real bugs fixed (not security-critical, but "everything must work")

- **Race condition in first-login device binding.** Two simultaneous
  logins from different devices on a freshly-registered account could both
  pass the `bound_device_id == null` check before either write landed. The
  login route's device-bind write is now conditional
  (`.is('bound_device_id', null)` at write time, not just read time), with
  a re-check if the conditional update matches zero rows.
- **Geofence verification didn't exist.** Promised in the feature-overview
  doc you pasted (and implied by `radius_meters` in the schema), but no
  distance check existed anywhere in the code. Added a Haversine distance
  calculation in `attendance/clock/route.ts` (`lib/geo.ts`) — **flagged,
  not blocking**, same philosophy as the original spec's mock-location
  handling. A worker is never locked out of clocking in/out over a GPS
  reading; the admin map now shows an "outside geofence" badge instead.
- **Offline sync queue didn't exist.** The mobile dashboard showed a
  "Pending Sync — will sync when online" banner on a failed clock-in, but
  nothing was ever stored or retried — the event was silently dropped.
  Built a real one: `mobile/lib/services/offline_queue_service.dart`
  (sqflite-backed), wired into `dashboard_screen.dart` with a
  `connectivity_plus` listener that retries automatically when the network
  returns, plus a tappable banner for manual retry. Events sync strictly in
  the order they were recorded and stop at the first failure, to avoid an
  OUT syncing before its matching IN and corrupting the sequence/polyline
  logic below.
- **No IN/OUT sequence validation.** A worker could clock IN twice in a
  row with no server-side signal, which would corrupt the admin map's
  IN→OUT polyline pairing. Added `sequence_anomaly` detection in the clock
  route (flagged, not blocking, same reasoning as geofence) — checks the
  worker's most recent event and flags if this one breaks the expected
  alternation.
- **Broken default test file.** `mobile/test/widget_test.dart` was the
  unmodified Flutter counter-app template, referencing `MyApp`, a class
  that doesn't exist in this project (`EmpAttApp` does) — `flutter test`
  would fail to compile it. Replaced with two real tests: a widget smoke
  test that the login screen renders, and a unit test for
  `DeviceService`'s non-Android fallback path.
- **Dead code / latent risk:** `lib/supabase.ts` exported an unused
  anon-key Supabase client (`supabasePublic`). Nothing imported it, but
  with RLS disabled on every table (see Known Limitations), it was a
  landmine for someone to later import into a client component and
  accidentally expose every table to the browser. Removed.

---

## Dependency version audit (you explicitly asked for this to be verified, not assumed)

Ran real `npm install` + `npm run build` + `npm run lint` in a sandbox
against the actual code, not just read `package.json`.

| Package | Was | Now | Note |
|---|---|---|---|
| next | 16.2.12 | 16.2.12 | Already latest — confirmed against npm's `latest` dist-tag |
| react / react-dom | 19.2.4 | 19.2.8 | Latest patch |
| @supabase/supabase-js | ^2.111.0 | ^2.111.0 | Already latest |
| leaflet / react-leaflet | current | current | Already latest |
| **typescript** | ^5 | **5.9.3** (exact) | npm's `latest` tag is TypeScript 7.0 — tried it for real, breaks the toolchain: `typescript-eslint` (bundled via `eslint-config-next`) declares `peerDependencies: "typescript": ">=4.8.4 <6.1.0"`. 5.9.3 is the actual latest *compatible* version. |
| **eslint** | ^9 | **9.39.5** (exact) | Same story — npm's `latest` is ESLint 10, but `eslint-config-next`'s bundled plugins don't support it yet (invalid peer deps on install). 9.39.5 is latest-within-9.x. |
| bcryptjs | — | ^3.0.3 | New, for passcode hashing |

**Flutter side** (`geolocator` ^13→^14, `device_info_plus` removed
entirely in favor of `android_id` ^0.5.1, added `sqflite`/`path`/
`connectivity_plus` for the offline queue): versions were researched via
web search / pub.dev, but **not verified by an actual `flutter pub get` or
build** — this sandbox has no Flutter SDK and no network path to
`pub.dev`. Run `flutter pub get && flutter analyze` yourself as the final
check before building, and let me know if anything surfaces — see "What
was verified vs not" below.

---

## Next.js 16 naming change caught mid-fix

While verifying the build after adding the admin-auth gate, the build
output warned that the `middleware.ts` file convention is **deprecated in
Next.js 16** in favor of `proxy.ts` (the exported function also renames
from `middleware` to `proxy`; the new convention runs Node.js runtime only,
no Edge). Migrated to `proxy.ts` before this ever shipped as `middleware.ts`
— confirmed via a clean rebuild that the deprecation warning is gone and
the route table shows `ƒ Proxy (Middleware)`.

---

## Every file touched

**web/**
- `supabase/schema.sql` — rewritten (hashed passcodes, lockout columns, geofence/sequence columns, safer seed-data instructions)
- `supabase/migration_v2.sql` — new (upgrade path for the existing live DB)
- `run-schema.js`, `run_schema.mjs` — deleted (leaked credential)
- `lib/supabase.ts` — removed unused anon client, hardened comments
- `lib/adminAuth.ts` — new (signed session cookie, Web Crypto-based so it works under the Node-only proxy runtime)
- `lib/geo.ts` — new (Haversine distance)
- `proxy.ts` — new (formerly `middleware.ts`; admin auth gate)
- `.env.example` — new (didn't exist before — nothing documented which env vars were required)
- `app/api/auth/login/route.ts` — rewritten (bcrypt, lockout, race-safe device bind)
- `app/api/attendance/clock/route.ts` — rewritten (geofence + sequence checks)
- `app/api/admin/clock-logs/route.ts` — updated (returns new anomaly fields)
- `app/api/admin/login/route.ts`, `app/api/admin/logout/route.ts` — new
- `app/api/sites/route.ts` — moved from `app/api/admin/sites/route.ts`
- `app/admin/login/page.tsx` — new
- `components/admin/AdminDashboard.tsx` — logout button, broader anomaly summary, lint fix
- `components/admin/MapView.tsx` — geofence/sequence badges, lint fixes (unused import, `any` type)
- `package.json` — version bumps described above
- `README.md` — replaced create-next-app boilerplate with real setup instructions

**mobile/**
- `pubspec.yaml` — dependency changes described above
- `lib/services/device_service.dart` — rewritten (android_id, not device_info_plus)
- `lib/services/api_service.dart` — sites endpoint URL updated, base-URL comment corrected
- `lib/services/offline_queue_service.dart` — new
- `lib/screens/dashboard_screen.dart` — real offline queue wiring, connectivity listener, split GPS-failure from network-failure handling
- `test/widget_test.dart` — replaced broken template test
- `README.md` — replaced flutter-create boilerplate with real setup instructions

---

## Known limitations (deliberate, not oversights — proportionate to a demo)

- Single shared admin password, not per-admin accounts.
- RLS disabled on all Supabase tables — every access goes through the
  service role key in API routes. Don't point a browser client at Supabase
  directly with the anon key until real RLS policies exist.
- Geofence distance uses a plain Haversine formula in the API layer, not a
  native PostGIS spatial query, even though PostGIS is enabled on the DB.
  Fine at this scale (a handful of workers, a few events/day); worth
  revisiting with `ST_DWithin` + a geography column if this scales up.
- Mock-location detection relies on `Position.isMocked`, which catches the
  standard Android "mock location app" setting but not GPS spoofing via a
  rooted device or hardware GPS simulator.
- Geofence and sequence anomalies are flagged, never blocking — a worker
  can always clock in/out. This was a judgment call following the
  precedent your own spec set for mock-location handling (Rule 2: "do not
  block the worker"), not something explicitly specified either way for
  these two checks.

## What was verified vs. not

**Web/Next.js — actually run, not just read:**
`npm install` → `npm run build` → `npm run lint`, clean install, zero
build errors, zero lint errors/warnings, on the final code. (One caveat:
this sandbox can't reach `fonts.googleapis.com`, so the Google Fonts import
in `layout.tsx` was temporarily swapped out *only for the verification
build*, then restored byte-for-byte afterward — confirmed via `diff`
before restoring. That swap never shipped; it's not in the delivered code.)

**Flutter/mobile — researched, not executed:**
No Flutter SDK and no network path to `pub.dev` in this sandbox, so
`flutter pub get`, `flutter analyze`, and `flutter test` were not actually
run against this code. The dependency versions and code changes are based
on careful reading and web research (pub.dev package pages fetched
directly), not a green build. Run those three commands yourself as the
real final check — that's the honest state of this, not a claim of
Flutter-side verification that didn't happen.

One consequence: `mobile/pubspec.lock` has been **deleted** rather than
shipped stale. It still referenced `device_info_plus` and had no entries
for `android_id`/`sqflite`/`path`/`connectivity_plus` — since it can't be
regenerated correctly without a real `flutter pub get`, leaving it in place
would have been a lockfile that silently disagreed with `pubspec.yaml`.
Running `flutter pub get` will generate a fresh, correct one.
