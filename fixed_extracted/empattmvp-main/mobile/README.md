# EmpAtt Mobile — Field Worker App (Flutter/Android)

Android app for field worker GPS clock-in/out. Distributed as a sideloaded
APK (e.g. via WhatsApp), not the Play Store, per the original spec.

## Setup

1. **Point the app at your backend** — edit `_baseUrl` in
   `lib/services/api_service.dart`:
   ```dart
   const String _baseUrl = 'https://your-deployment.vercel.app';
   ```
   (Currently set to a specific Vercel URL that was already deployed when
   this codebase was reviewed — confirm that's still the one you want
   before building, or a fresh install will happily bind a worker's device
   to a backend nobody's using anymore.)

2. **Install dependencies**
   ```bash
   flutter pub get
   ```

3. **Build**
   ```bash
   flutter build apk --release
   ```
   The APK lands in `build/app/outputs/flutter-apk/app-release.apk`.

## Required permissions

Already declared in `android/app/src/main/AndroidManifest.xml`:
`INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`. The worker
grants location access on first launch via the OS permission prompt.

## How device binding works

On first login, the app reads `Settings.Secure.ANDROID_ID` via the
`android_id` package and sends it to the backend, which permanently binds
the worker's account to that value (see `services/device_service.dart` for
why this package specifically — `device_info_plus` looks similar but
returns the wrong thing for this purpose). If a worker needs to switch
phones, an admin has to unbind the old device from the web dashboard first.

## Offline behavior

If a clock-in/out request can't reach the server (no signal, backend down),
it's saved locally (`services/offline_queue_service.dart`, backed by
`sqflite`) and retried automatically once connectivity returns, or manually
via the "saved locally" banner on the dashboard screen. Events sync in the
order they were recorded and stop at the first failure, to avoid an OUT
syncing before its matching IN.

## Testing

```bash
flutter test
```

Runs on your host machine, not an Android device — the device-ID test
therefore exercises the non-Android fallback path, not a real
`Settings.Secure.ANDROID_ID` read. There's no integration test against a
real/emulated Android device in this repo; that would be the next thing to
add if this goes past demo stage.

## Known limitations (by design, for a demo at this scale)

- Android only (spec explicitly scoped it that way).
- Mock-location detection relies on `Position.isMocked`, which catches the
  standard Android "mock location app" developer setting but not GPS
  spoofing via a rooted device or hardware GPS simulator. It's a signal for
  the admin to review, not a guarantee.
