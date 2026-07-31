import 'dart:io';
import 'package:android_id/android_id.dart';

/// Retrieves the device's persistent hardware identifier.
///
/// On Android: uses `Settings.Secure.ANDROID_ID` (SSAID) via the `android_id`
/// package — a 64-bit hex string that is unique per app-signing-key + user +
/// device. It survives app reinstall (same signing key) but DOES change on
/// factory reset or if the device is transferred to a different user
/// profile. That's the correct, intended behavior for this app: after a
/// factory reset the phone should look "new" and require an admin to
/// re-authorize it, the same as if the worker started using a different
/// physical phone.
///
/// IMPORTANT — do not swap this back to `device_info_plus`'s
/// `AndroidDeviceInfo.id` field. That field maps to `Build.ID`, the OS
/// build/firmware label (e.g. "AP3A.240905.015.A2") — it is IDENTICAL
/// across every phone running the same firmware build, not unique per
/// device. Using it here would mean two workers with the same phone model
/// on the same Android security patch collide on the same "unique" device
/// ID, defeating the entire point of device binding. `device_info_plus`
/// removed real ANDROID_ID access around v4.0 — this dedicated package is
/// the current correct source for it.
class DeviceService {
  static const AndroidId _androidIdPlugin = AndroidId();
  static String? _cachedUuid;

  /// Returns the persistent hardware UUID for this device.
  /// Throws [UnsupportedError] if not running on Android.
  /// Throws [StateError] if the platform returned no ID (rare, but the
  /// underlying platform channel can return null).
  static Future<String> getHardwareUuid() async {
    if (_cachedUuid != null) return _cachedUuid!;

    if (Platform.isAndroid) {
      final id = await _androidIdPlugin.getId();
      if (id == null || id.isEmpty) {
        throw StateError(
          'Unable to read a device ID from this phone. Restart the app and '
          'try again; if this persists, the device may not expose '
          'Settings.Secure.ANDROID_ID.',
        );
      }
      _cachedUuid = id;
      return _cachedUuid!;
    }

    throw UnsupportedError(
      'EmpAtt only supports Android devices. '
      'iOS support can be added in Phase 2.',
    );
  }
}
