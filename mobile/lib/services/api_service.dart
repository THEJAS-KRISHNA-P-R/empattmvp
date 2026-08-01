import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/worker.dart';
import '../models/work_site.dart';

/// ─────────────────────────────────────────────────────────────
/// This already points at a live deployment. Confirm this is still the
/// backend you want before building — if you've deployed your own copy of
/// web/ elsewhere, update this to match, or the app will happily bind a
/// worker's device to a backend nobody's using anymore.
/// ─────────────────────────────────────────────────────────────
const String _baseUrl = 'https://employee-reg-psi.vercel.app';

/// All HTTP calls to the Next.js backend API.
class ApiService {
  static const Duration _timeout = Duration(seconds: 20);

  // ──────────────────────────────────────────────────
  // AUTH
  // ──────────────────────────────────────────────────

  /// POST /api/auth/login
  ///
  /// Three credentials required — phone, employee ID, and PIN all have to
  /// match the same worker record (not PIN alone).
  ///
  /// Returns the [Worker] on success.
  /// Throws [ApiException] with a user-facing message on failure.
  static Future<Worker> login({
    required String phone,
    required String employeeId,
    required String passcode,
    required String deviceUuid,
  }) async {
    final response = await http
        .post(
          Uri.parse('$_baseUrl/api/auth/login'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'phone': phone,
            'employee_id': employeeId,
            'passcode': passcode,
            'device_uuid': deviceUuid,
          }),
        )
        .timeout(_timeout);

    final body = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode == 200) {
      return Worker.fromJson(body['worker'] as Map<String, dynamic>);
    }

    throw ApiException(
      body['error']?.toString() ?? 'Login failed. Try again.',
      code: body['code']?.toString(),
    );
  }

  // ──────────────────────────────────────────────────
  // ATTENDANCE
  // ──────────────────────────────────────────────────

  /// POST /api/attendance/clock
  ///
  /// Records a clock IN or OUT event.
  static Future<String> clockEvent({
    required String workerId,
    required String deviceUuid,
    required String siteId,
    required String eventType, // 'IN' or 'OUT'
    required double latitude,
    required double longitude,
    required double accuracyMeters,
    required bool isMockLocation,
    required DateTime clientTimestamp,
  }) async {
    final response = await http
        .post(
          Uri.parse('$_baseUrl/api/attendance/clock'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'worker_id': workerId,
            'device_uuid': deviceUuid,
            'site_id': siteId,
            'event_type': eventType,
            'latitude': latitude,
            'longitude': longitude,
            'accuracy_meters': accuracyMeters,
            'is_mock_location': isMockLocation,
            'client_timestamp': clientTimestamp.toUtc().toIso8601String(),
          }),
        )
        .timeout(_timeout);

    final body = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode == 200) {
      return body['message']?.toString() ?? 'Clocked $eventType successfully!';
    }

    // `code` carries DEVICE_MISMATCH / ACCOUNT_DEACTIVATED / etc — the
    // dashboard screen uses this to decide whether to force a re-login
    // instead of just showing an error on every future clock attempt.
    throw ApiException(
      body['error']?.toString() ?? 'Failed to record clock event.',
      code: body['code']?.toString(),
    );
  }

  // ──────────────────────────────────────────────────
  // SITES
  // ──────────────────────────────────────────────────

  /// GET /api/sites
  ///
  /// Returns all active work sites for the site picker.
  static Future<List<WorkSite>> fetchSites() async {
    final response = await http
        .get(Uri.parse('$_baseUrl/api/sites'))
        .timeout(_timeout);

    if (response.statusCode == 200) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final list = body['sites'] as List<dynamic>;
      return list.map((s) => WorkSite.fromJson(s as Map<String, dynamic>)).toList();
    } else {
      throw const ApiException('Failed to load work sites.');
    }
  }

  // ──────────────────────────────────────────────────
  // WORKER STATUS & HISTORY
  // ──────────────────────────────────────────────────

  /// GET /api/worker/status
  static Future<Map<String, dynamic>> getWorkerStatus(String workerId) async {
    final response = await http
        .get(Uri.parse('$_baseUrl/api/worker/status?worker_id=$workerId'))
        .timeout(_timeout);

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode == 200) {
      return body['status'] as Map<String, dynamic>;
    }
    throw ApiException(body['error']?.toString() ?? 'Failed to load status.');
  }

  /// GET /api/worker/history
  static Future<List<dynamic>> getWorkerHistory(String workerId) async {
    final response = await http
        .get(Uri.parse('$_baseUrl/api/worker/history?worker_id=$workerId'))
        .timeout(_timeout);

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode == 200) {
      return body['history'] as List<dynamic>;
    }
    throw ApiException(body['error']?.toString() ?? 'Failed to load history.');
  }
}

/// Typed exception for user-facing API error messages. [code] is the
/// machine-readable error code from the backend (e.g. DEVICE_MISMATCH),
/// when present — see app/api/auth/login/route.ts and
/// app/api/attendance/clock/route.ts on the web side for the full list.
class ApiException implements Exception {
  final String message;
  final String? code;
  const ApiException(this.message, {this.code});

  @override
  String toString() => message;
}
