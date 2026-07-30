import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';

/// Retrieves the device's persistent hardware identifier.
///
/// On Android: uses `AndroidDeviceInfo.id` (ANDROID_ID) — a 64-bit hex string
/// that is unique per app-signing key and does NOT change on factory reset on
/// Android 8+. It is stable across app reinstalls unless the device is wiped.
class DeviceService {
  static final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();
  static String? _cachedUuid;

  /// Returns the persistent hardware UUID for this device.
  /// Throws [UnsupportedError] if not running on Android.
  static Future<String> getHardwareUuid() async {
    if (_cachedUuid != null) return _cachedUuid!;

    if (Platform.isAndroid) {
      final androidInfo = await _deviceInfo.androidInfo;
      // androidInfo.id = ANDROID_ID (unique per app signing + device)
      _cachedUuid = androidInfo.id;
      return _cachedUuid!;
    }

    throw UnsupportedError(
      'EmpAtt only supports Android devices. '
      'iOS support can be added in Phase 2.',
    );
  }
}
