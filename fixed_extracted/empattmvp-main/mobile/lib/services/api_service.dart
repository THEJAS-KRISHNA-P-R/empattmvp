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
  /// Returns the [Worker] on success.
  /// Throws [ApiException] with a user-facing message on failure.
  static Future<Worker> login({
    required String phone,
    required String passcode,
    required String deviceUuid,
  }) async {
    final response = await http
        .post(
          Uri.parse('$_baseUrl/api/auth/login'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'phone': phone,
            'passcode': passcode,
            'device_uuid': deviceUuid,
          }),
        )
        .timeout(_timeout);

    final body = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode == 200) {
      return Worker.fromJson(body['worker'] as Map<String, dynamic>);
    } else if (response.statusCode == 401) {
      throw ApiException('Invalid phone number or passcode.');
    } else if (response.statusCode == 403) {
      throw ApiException(
        'This account is locked to a different physical device.\n'
        'Contact admin to reset.',
      );
    } else {
      throw ApiException(body['error']?.toString() ?? 'Login failed. Try again.');
    }
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
    } else if (response.statusCode == 403) {
      throw ApiException('Security error: device mismatch. Contact admin.');
    } else {
      throw ApiException(body['error']?.toString() ?? 'Failed to record clock event.');
    }
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
      throw ApiException('Failed to load work sites.');
    }
  }
}

/// Typed exception for user-facing API error messages.
class ApiException implements Exception {
  final String message;
  const ApiException(this.message);

  @override
  String toString() => message;
}
