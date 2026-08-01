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

---

# Session 2 — Device Lock Hardening, Admin Worker Management, Light-Mode Redesign

Continuation of the same audit-and-fix work above. This session covered three
things asked for together: (1) make device lock airtight and give the admin
a way to actually create workers, (2) a full light-mode redesign of both
portals with no purple/violet, and (3) a brand mark + real favicon/app icon
files. Everything below was verified the same way as Session 1 — real
Postgres, real `npm run build`/`lint`, and disclosed plainly where that
wasn't possible (Flutter).

## Device lock — closed the second half of the original spec

Session 1 fixed *which ID* gets used for device binding. This session fixed
*enforcement*, and found it was only half-implemented.

- **Real bug, caught by actually running the SQL**: `schema.sql`'s
  `idx_clock_logs_date` index used `client_timestamp::DATE`, which Postgres
  rejects — that cast depends on session timezone, so it isn't `IMMUTABLE`.
  Fixed by casting through `AT TIME ZONE 'UTC'` first. This wasn't visible
  from reading the file; it only surfaced when I installed a real Postgres
  in the sandbox and ran the schema against it.
- **The missing direction of "1:1"**: the original spec's Rule 1 has three
  parts — Worker A can't switch phones, Worker B can't use Worker A's
  phone, AND (this one) a phone already bound to someone can't be claimed
  by a second worker. Only the first two were enforced. Added
  `idx_workers_bound_device_unique` — a partial unique index — as the real,
  race-safe backstop, plus an application-level check in `login/route.ts`
  that gives a clear error before the database ever has to reject it.
- **Proved it two ways, not just read the code**: (1) seeded two workers,
  tried to bind both to the same device ID, watched Postgres reject the
  second one. (2) Seeded a database with that exact collision already
  present — simulating what the old `device_info_plus` bug could have
  actually produced in a live deployment — and confirmed `migration_v2.sql`
  doesn't crash; it skips the constraint, names the exact workers/device
  involved, and lets you resolve and re-run.
- **A worker whose phone gets unbound now finds out.** Previously, if an
  admin reset a worker's phone lock, the worker's app kept behaving as if
  logged in and every clock attempt just failed silently with a generic
  error forever — no path forward. Added machine-readable `code` fields
  (`DEVICE_MISMATCH`, `DEVICE_ALREADY_CLAIMED`, `ACCOUNT_DEACTIVATED`, etc.)
  to every auth/clock error response, and the mobile app now detects
  `DEVICE_MISMATCH`/`ACCOUNT_DEACTIVATED` specifically and forces a clean
  logout with an explanation, instead of just showing an error.

## Admin worker management (was entirely missing)

The live deployment had zero way to create a worker — confirmed directly
from the screenshot showing "FIELD WORKERS (0)" with no add option. Built:

- `POST /api/admin/workers` — creates a worker, hashes the PIN immediately,
  returns the plaintext PIN exactly once in the response (never stored,
  never retrievable again after that).
- An "Add Worker" modal on the dashboard (`AddWorkerModal.tsx`) with Copy
  and "Share via WhatsApp" buttons — the WhatsApp button opens a `wa.me`
  deep link pre-addressed to the worker's own phone number with the
  credentials pre-filled, so the admin doesn't have to switch apps and
  retype anything.
- An empty-state call-to-action ("Add your first worker") so the exact
  situation in the screenshot has an obvious next step instead of a dead
  end.

## Login changed from 2 factors to 3, per your updated spec

Phone + PIN became phone + employee ID (or email) + PIN — all three now
have to match the same worker row, not just the PIN. This is a real
increase in login friction for a low-tech field-worker audience, worth
naming plainly: it's what was specified, and the employee_id is deliberately
unvalidated free text (not required to be a real email) so an admin can
just assign "EMP001" instead of needing to invent email addresses for
workers who don't have one — but it is one more thing a worker has to get
right on a small phone keyboard. If login friction turns out to be a
problem in practice, the two-factor version (phone + PIN, device lock
doing the rest of the security work) is a reasonable fallback.

- `employee_id` added to the schema (unique, indexed), with a migration
  path for the live DB that auto-generates a placeholder ID for existing
  workers (`EMP-<short id>`) rather than requiring manual backfill.
- Terminology changed to match your spec throughout: "Unbind Device" is now
  "Reset Phone Lock" everywhere in the UI (the API route path stayed
  `reset-device` — internal detail, not user-facing).

## Light-mode redesign, no purple/violet, YourFee-aligned palette

- Pulled the real YourFee brand green (`RGB(27,166,126)`) and Plus Jakarta
  Sans from memory, then **computed actual WCAG contrast ratios in Python**
  for every color pairing before locking in shades — the raw brand color
  fails 4.5:1 for white button text, so interactive elements use a
  darkened `#0F8060` (4.91:1) while the true brand hex is kept for larger
  accents. Neutrals are a slate scale; status colors (red/amber) are
  unchanged in meaning from Session 1, just re-tuned for light backgrounds.
- Rebuilt: `globals.css` (light-only tokens, explicitly no
  `prefers-color-scheme: dark` override), `layout.tsx`, `admin/login/page.tsx`,
  `AdminDashboard.tsx`, `MapView.tsx` (switched to CARTO Positron light
  basemap instead of stock OSM tiles, custom SVG circle markers instead of
  default Leaflet pins).
- Used the `ui-ux-pro-max` skill's search tooling for style/color reference
  rather than freehanding the palette.

## Flutter: light mode + a small custom component library

Per "lightweight custom components rather than heavy libraries" — no UI kit
package was added. Built plain, hand-styled widgets instead
(`lib/widgets/`: `AppButton`, `AppTextField`, `AppCard`, `AppLogoMark`,
`app_dialog.dart`'s `showAppAlert`), all reading from a single
`lib/theme/app_colors.dart` token file that mirrors the web palette exactly.
`login_screen.dart`, `dashboard_screen.dart`, and `main.dart` (which still
had the old dark theme + indigo seed color) were all rebuilt on top of
these.

**Two real bugs caught by manual review that would have been compile
errors**, in lieu of being able to run `flutter analyze`:
- `auth_service.dart` manually reconstructs a `Worker` object in
  `getLoggedInWorker()` — adding a required `employeeId` field to `Worker`
  would have broken this call site silently until someone tried to log
  back into a saved session. Fixed alongside the model change.
- `app_text_field.dart` used `TextInputFormatter` as a type but only had an
  `export` statement for `flutter/services.dart`, not an `import` — an
  `export` doesn't bring symbols into scope for the exporting file itself.
  Verified this distinction against official Flutter team code samples
  before fixing it (every real Flutter example that uses
  `TextInputFormatter` imports `services.dart` directly and explicitly,
  which is exactly the tell that `material.dart` doesn't quietly cover it).

Also ran a systematic cross-check script over every Dart file — for a list
of ~15 signal identifiers (`SystemChrome`, `Position`, `Connectivity`,
`Database`, etc.), confirmed each file using one also directly imports the
package that defines it, not just relying on a transitive re-export. One
more flag came back, checked, and was a false positive (the word
"SharedPreferences" appearing only inside a code comment). A rough
brace/paren/bracket balance check ran clean across every file too. This is
the honest ceiling of what's verifiable without a Dart compiler in this
sandbox — confirmed again this session that Flutter's engine artifacts are
served from Google Cloud Storage, outside the sandbox's network allowlist,
so `flutter analyze`/`pub get`/`test` still cannot actually run here.

## Brand mark, favicon, and app icon

Hand-drawn an original SVG mark (rounded square, brand green, a geometric
pin built from arcs and a punched circle — not a copy of Material's pin
glyph) rather than sourcing existing artwork. Verified it actually renders
correctly two ways: visually, and by sampling pixel colors at known
coordinates in Python (confirmed transparent rounded corners, white pin
fill, and the green punched-circle all land where the path math says they
should).

Generated from that one SVG source, not hand-built per size:
- Web: `app/favicon.ico` (real multi-resolution ICO — 16/32/48px, verified
  with `identify`), `app/icon.svg` (modern browsers use this directly, via
  Next.js's file-convention auto-detection), `app/apple-icon.png` (180px).
- Mobile: `ic_launcher.png` at all five Android densities (mdpi 48px
  through xxxhdpi 192px, each verified at its exact required pixel size),
  replacing Flutter's default placeholder icon. Standard launcher icons,
  not adaptive-icon XML layers — proportionate for a sideloaded APK, not
  going through Play Store's stricter icon requirements. Source SVG and a
  512px master PNG kept in `mobile/assets/branding/` for future
  regeneration.

## Files touched this session

**web/**: `supabase/schema.sql`, `supabase/migration_v2.sql`,
`app/api/auth/login/route.ts`, `app/api/attendance/clock/route.ts`,
`app/api/admin/workers/route.ts` (added POST), `app/api/admin/reset-device/route.ts`
(terminology), `app/globals.css`, `app/layout.tsx`, `app/admin/login/page.tsx`,
`app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png` (new),
`components/admin/AdminDashboard.tsx`, `components/admin/MapView.tsx`,
`components/admin/AddWorkerModal.tsx` (new)

**mobile/**: `lib/theme/app_colors.dart` (new), `lib/widgets/*` (new:
`app_button.dart`, `app_text_field.dart`, `app_card.dart`,
`app_logo_mark.dart`, `app_dialog.dart`), `lib/main.dart`,
`lib/screens/login_screen.dart`, `lib/screens/dashboard_screen.dart`,
`lib/models/worker.dart`, `lib/services/auth_service.dart`,
`lib/services/api_service.dart`, `android/app/src/main/res/mipmap-*/ic_launcher.png`
(all 5 densities), `assets/branding/` (new)

## What changed about verification this session

Installed a real local PostgreSQL 16 + PostGIS in the sandbox specifically
to test schema and constraint behavior against actual query execution,
not just read the SQL and reason about it — this is what caught the
IMMUTABLE index bug and let me prove the device-uniqueness constraint
under two realistic scenarios (clean DB, and a DB with the exact
corruption the old bug could have caused). This is a meaningfully deeper
verification bar than Session 1 had for the schema layer specifically; the
web build/lint verification approach is unchanged and was re-run clean
after every batch of changes.

## Post-packaging review pass — one more real bug caught

Before finalizing, ran a systematic method-signature and field-name
cross-check across every service call in both screens (not just imports
this time — actual parameter names and types). Found a third real bug:

- **`dashboard_screen.dart` declared `final Position location;` in
  `_handleClock`, but `LocationService.getCurrentLocation()` returns
  `Future<LocationResult>`** — a app-defined wrapper class, not
  geolocator's `Position`. The two types don't have the same fields
  either (`Position.accuracy` vs `LocationResult.accuracyMeters`), so this
  would have failed to compile. Fixed by correcting the declared type.
  Re-verified the *other* use of `Position` in the same file (`_lastPosition`,
  fed by the live GPS stream, which genuinely does return `Position`) uses
  `.accuracy`/`.isMocked` correctly — that one was right; only the
  one-shot `_handleClock` location fetch had the mismatch.
- Separately verified `Color.withValues(alpha: ...)` (used in
  `app_logo_mark.dart` and the Clock IN/OUT button disabled states) is a
  real, current `dart:ui` API — introduced when `withOpacity` was
  deprecated — rather than assuming it was safe to use.

This is now three real, compiler-would-have-caught bugs found through
manual cross-referencing this session (missing import, required-field
break, and this type mismatch) — logged here rather than glossed over,
since the whole point of this level of review is to be honest about what
manual verification actually catches versus what it might still miss
without a real `flutter analyze` run.
