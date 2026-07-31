import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'api_service.dart';

/// A single clock IN/OUT event that failed to reach the server and is
/// waiting to be retried.
class PendingClockEvent {
  final int? id; // null until inserted (sqlite assigns it)
  final String workerId;
  final String deviceUuid;
  final String siteId;
  final String eventType; // 'IN' or 'OUT'
  final double latitude;
  final double longitude;
  final double accuracyMeters;
  final bool isMockLocation;
  final DateTime clientTimestamp;
  final DateTime queuedAt;

  const PendingClockEvent({
    this.id,
    required this.workerId,
    required this.deviceUuid,
    required this.siteId,
    required this.eventType,
    required this.latitude,
    required this.longitude,
    required this.accuracyMeters,
    required this.isMockLocation,
    required this.clientTimestamp,
    required this.queuedAt,
  });

  Map<String, Object?> toMap() {
    return {
      'worker_id': workerId,
      'device_uuid': deviceUuid,
      'site_id': siteId,
      'event_type': eventType,
      'latitude': latitude,
      'longitude': longitude,
      'accuracy_meters': accuracyMeters,
      'is_mock_location': isMockLocation ? 1 : 0,
      'client_timestamp': clientTimestamp.toUtc().toIso8601String(),
      'queued_at': queuedAt.toUtc().toIso8601String(),
    };
  }

  factory PendingClockEvent.fromMap(Map<String, Object?> map) {
    return PendingClockEvent(
      id: map['id'] as int?,
      workerId: map['worker_id'] as String,
      deviceUuid: map['device_uuid'] as String,
      siteId: map['site_id'] as String,
      eventType: map['event_type'] as String,
      latitude: map['latitude'] as double,
      longitude: map['longitude'] as double,
      accuracyMeters: map['accuracy_meters'] as double,
      isMockLocation: (map['is_mock_location'] as int) == 1,
      clientTimestamp: DateTime.parse(map['client_timestamp'] as String),
      queuedAt: DateTime.parse(map['queued_at'] as String),
    );
  }
}

/// Persists clock events locally when the network is unreachable, and
/// retries them (in order) once connectivity returns.
///
/// This exists because the original dashboard showed a "Pending Sync —
/// will sync when online" banner on a failed clock-in but never actually
/// stored or retried anything — the event was silently lost. Field
/// workers in basements/rural sites with dead zones are exactly the
/// scenario this needs to survive.
///
/// Events are synced strictly in the order they were queued, and syncing
/// STOPS at the first failure — both to preserve IN/OUT ordering (the
/// backend's sequence-anomaly detection and the admin map's journey
/// polyline both assume events arrive in order) and because if the first
/// retry fails from no connectivity, every subsequent one will too.
class OfflineQueueService {
  static const String _tableName = 'pending_clock_events';
  static Database? _db;

  static Future<Database> get _database async {
    if (_db != null) return _db!;
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'empatt_offline_queue.db');
    _db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE $_tableName (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id TEXT NOT NULL,
            device_uuid TEXT NOT NULL,
            site_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            accuracy_meters REAL NOT NULL,
            is_mock_location INTEGER NOT NULL,
            client_timestamp TEXT NOT NULL,
            queued_at TEXT NOT NULL
          )
        ''');
      },
    );
    return _db!;
  }

  /// Saves an event locally after a failed send attempt.
  static Future<void> enqueue(PendingClockEvent event) async {
    final db = await _database;
    await db.insert(_tableName, event.toMap());
  }

  /// All pending events, oldest first.
  static Future<List<PendingClockEvent>> getAll() async {
    final db = await _database;
    final rows = await db.query(_tableName, orderBy: 'queued_at ASC');
    return rows.map(PendingClockEvent.fromMap).toList();
  }

  /// Count of events still waiting to sync (for the UI badge).
  static Future<int> count() async {
    final db = await _database;
    final result = Sqflite.firstIntValue(
      await db.rawQuery('SELECT COUNT(*) FROM $_tableName'),
    );
    return result ?? 0;
  }

  static Future<void> _remove(int id) async {
    final db = await _database;
    await db.delete(_tableName, where: 'id = ?', whereArgs: [id]);
  }

  /// Attempts to send every pending event to the server, in order.
  /// Stops at the first failure. Returns how many were successfully synced.
  static Future<int> attemptSync() async {
    final pending = await getAll();
    var syncedCount = 0;

    for (final event in pending) {
      try {
        await ApiService.clockEvent(
          workerId: event.workerId,
          deviceUuid: event.deviceUuid,
          siteId: event.siteId,
          eventType: event.eventType,
          latitude: event.latitude,
          longitude: event.longitude,
          accuracyMeters: event.accuracyMeters,
          isMockLocation: event.isMockLocation,
          clientTimestamp: event.clientTimestamp,
        );
        await _remove(event.id!);
        syncedCount++;
      } catch (_) {
        // Stop here — see class doc for why we don't skip ahead.
        break;
      }
    }

    return syncedCount;
  }
}
