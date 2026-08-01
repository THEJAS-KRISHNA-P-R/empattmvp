import 'package:geolocator/geolocator.dart';

/// GPS position data returned from the location service
class LocationResult {
  final double latitude;
  final double longitude;
  final double accuracyMeters;
  final bool isMocked;

  const LocationResult({
    required this.latitude,
    required this.longitude,
    required this.accuracyMeters,
    required this.isMocked,
  });
}

/// Wraps geolocator to provide permission-safe GPS retrieval.
class LocationService {
  /// Checks/requests location permissions, then gets the current position.
  ///
  /// Returns a [LocationResult] on success.
  /// Throws [Exception] with a human-readable message on failure.
  static Future<LocationResult> getCurrentLocation() async {
    // 1. Check if location services are enabled on the device
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw Exception(
        'Location services are disabled.\n'
        'Please enable GPS in your device settings.',
      );
    }

    // 2. Check permissions
    LocationPermission permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw Exception(
          'Location permission denied.\n'
          'EmpAtt needs GPS access to record your attendance.',
        );
      }
    }

    if (permission == LocationPermission.deniedForever) {
      throw Exception(
        'Location permission is permanently denied.\n'
        'Please enable it in App Settings → Permissions → Location.',
      );
    }

    // 3. Get position — high accuracy for tight geofencing
    // GOOGLE MAPS STYLE STRATEGY:
    // First, check if the phone already knows exactly where it is (from another app or recent scan).
    // If it's less than 30 seconds old, trust it immediately. This skips the painful 15-second hang.
    try {
      final lastKnown = await Geolocator.getLastKnownPosition();
      if (lastKnown != null) {
        final age = DateTime.now().difference(lastKnown.timestamp);
        // Only trust it if it's recent AND highly accurate (< 50m)
        if (age.inSeconds < 30 && lastKnown.accuracy < 50) {
          return LocationResult(
            latitude: lastKnown.latitude,
            longitude: lastKnown.longitude,
            accuracyMeters: lastKnown.accuracy,
            isMocked: lastKnown.isMocked,
          );
        }
      }
    } catch (_) {
      // Ignore errors fetching last known, proceed to full fetch
    }

    // If no recent cache, force a fresh satellite lock
    Position? position;
    try {
      position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
    } catch (e) {
      if (e.toString().contains('TimeoutException')) {
        // Fallback: If it timed out, is there *any* older cached position we can use?
        final fallback = await Geolocator.getLastKnownPosition();
        if (fallback != null) {
          final age = DateTime.now().difference(fallback.timestamp);
          if (age.inMinutes <= 2) {
            return LocationResult(
              latitude: fallback.latitude,
              longitude: fallback.longitude,
              accuracyMeters: fallback.accuracy,
              isMocked: fallback.isMocked,
            );
          }
        }
        throw Exception(
          'Could not acquire a fresh GPS signal.\n'
          'Please step outdoors or check your location settings.',
        );
      }
      rethrow;
    }

    return LocationResult(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracy,
      isMocked: position.isMocked,
    );
  }

  /// Stream for real-time GPS status badge updates
  static Stream<Position> getPositionStream() {
    return Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5, // update every 5 metres
      ),
    );
  }
}
