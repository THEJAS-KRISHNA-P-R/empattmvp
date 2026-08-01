import 'package:shared_preferences/shared_preferences.dart';
import '../models/worker.dart';

/// Manages worker session persistence using SharedPreferences.
/// Session survives app restarts until the user explicitly logs out.
class AuthService {
  static const String _keyWorkerId = 'session_worker_id';
  static const String _keyWorkerName = 'session_worker_name';
  static const String _keyWorkerPhone = 'session_worker_phone';
  static const String _keyWorkerEmployeeId = 'session_worker_employee_id';
  static const String _keyDeviceUuid = 'session_device_uuid';
  static const String _keyIsLoggedIn = 'session_is_logged_in';

  /// Persists the logged-in worker and device UUID locally.
  static Future<void> saveSession({
    required Worker worker,
    required String deviceUuid,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_keyIsLoggedIn, true);
    await prefs.setString(_keyWorkerId, worker.id);
    await prefs.setString(_keyWorkerName, worker.fullName);
    await prefs.setString(_keyWorkerPhone, worker.phone);
    await prefs.setString(_keyWorkerEmployeeId, worker.employeeId);
    await prefs.setString(_keyDeviceUuid, deviceUuid);
  }

  /// Loads the persisted session. Returns null if no session exists.
  static Future<Map<String, String>?> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    final isLoggedIn = prefs.getBool(_keyIsLoggedIn) ?? false;
    if (!isLoggedIn) return null;

    final workerId = prefs.getString(_keyWorkerId);
    final workerName = prefs.getString(_keyWorkerName);
    final workerPhone = prefs.getString(_keyWorkerPhone);
    final deviceUuid = prefs.getString(_keyDeviceUuid);
    // Sessions saved before employee_id existed won't have this key —
    // default to empty rather than treating them as "no session".
    final workerEmployeeId = prefs.getString(_keyWorkerEmployeeId) ?? '';

    if (workerId == null || workerName == null || workerPhone == null || deviceUuid == null) {
      return null;
    }

    return {
      'worker_id': workerId,
      'worker_name': workerName,
      'worker_phone': workerPhone,
      'worker_employee_id': workerEmployeeId,
      'device_uuid': deviceUuid,
    };
  }

  /// Returns the logged-in Worker, or null if no session exists.
  static Future<Worker?> getLoggedInWorker() async {
    final session = await loadSession();
    if (session == null) return null;
    return Worker(
      id: session['worker_id']!,
      fullName: session['worker_name']!,
      phone: session['worker_phone']!,
      employeeId: session['worker_employee_id'] ?? '',
    );
  }

  /// Returns the saved device UUID, or null.
  static Future<String?> getDeviceUuid() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyDeviceUuid);
  }

  /// Clears all session data (logout, or a forced re-login after the
  /// backend reports DEVICE_MISMATCH — see dashboard_screen.dart).
  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyIsLoggedIn);
    await prefs.remove(_keyWorkerId);
    await prefs.remove(_keyWorkerName);
    await prefs.remove(_keyWorkerPhone);
    await prefs.remove(_keyWorkerEmployeeId);
    await prefs.remove(_keyDeviceUuid);
  }
}
