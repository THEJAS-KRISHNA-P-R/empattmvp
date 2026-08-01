import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../models/worker.dart';
import '../models/work_site.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/location_service.dart';
import '../services/offline_queue_service.dart';
import '../theme/app_colors.dart';
import '../widgets/app_card.dart';
import '../widgets/app_dialog.dart';
import 'login_screen.dart';

class DashboardScreen extends StatefulWidget {
  final Worker worker;
  final String deviceUuid;

  const DashboardScreen({
    super.key,
    required this.worker,
    required this.deviceUuid,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  // GPS state
  Position? _lastPosition;
  bool _gpsLoading = false;

  // Sites state
  List<WorkSite> _sites = [];
  WorkSite? _selectedSite;
  bool _loadingSites = true;
  bool _userSelectedSite = false;

  // Clock action state
  bool _clockingIn = false;
  bool _clockingOut = false;

  // Connectivity / sync
  int _pendingSyncCount = 0;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  StreamSubscription<Position>? _gpsSubscription;

  @override
  void initState() {
    super.initState();
    _startGpsStream();
    _loadSites();
    _refreshPendingCount();
    // Retry any events left over from a previous session (app was killed
    // or closed while offline) as soon as we have connectivity.
    _attemptSync();
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((results) {
      final hasConnection = results.any((r) => r != ConnectivityResult.none);
      if (hasConnection) _attemptSync();
    });
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    _gpsSubscription?.cancel();
    super.dispose();
  }

  Future<void> _refreshPendingCount() async {
    final count = await OfflineQueueService.count();
    if (mounted) setState(() => _pendingSyncCount = count);
  }

  Future<void> _attemptSync() async {
    final syncedCount = await OfflineQueueService.attemptSync();
    await _refreshPendingCount();
    if (syncedCount > 0 && mounted) {
      _showSnack('Synced $syncedCount pending event${syncedCount == 1 ? '' : 's'}.');
    }
  }

  // ───────────────────────────────────────
  // GPS Stream
  // ───────────────────────────────────────
  void _startGpsStream() {
    try {
      _gpsSubscription = LocationService.getPositionStream().listen(
        (pos) {
          if (mounted) {
            setState(() {
              _lastPosition = pos;
              if (_sites.isNotEmpty) {
                // Auto-sort sites by distance so the nearest is always on top
                _sites.sort((a, b) {
                  final distA = Geolocator.distanceBetween(pos.latitude, pos.longitude, a.latitude, a.longitude);
                  final distB = Geolocator.distanceBetween(pos.latitude, pos.longitude, b.latitude, b.longitude);
                  return distA.compareTo(distB);
                });
                
                // If user hasn't manually picked a site, auto-select the nearest one
                if (!_userSelectedSite) {
                  _selectedSite = _sites.first;
                }
              }
            });
          }
        },
        onError: (_) {}, // Silently ignore stream errors; user taps will surface them
      );
    } catch (_) {}
  }

  // ───────────────────────────────────────
  // Load Sites
  // ───────────────────────────────────────
  Future<void> _loadSites() async {
    setState(() => _loadingSites = true);
    try {
      final sites = await ApiService.fetchSites();
      if (mounted) {
        setState(() {
          _sites = sites;
          
          if (_lastPosition != null) {
            _sites.sort((a, b) {
              final distA = Geolocator.distanceBetween(_lastPosition!.latitude, _lastPosition!.longitude, a.latitude, a.longitude);
              final distB = Geolocator.distanceBetween(_lastPosition!.latitude, _lastPosition!.longitude, b.latitude, b.longitude);
              return distA.compareTo(distB);
            });
          }
          
          if (!_userSelectedSite && sites.isNotEmpty) {
            _selectedSite = _sites.first;
          }
          _loadingSites = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingSites = false);
      _showSnack('Could not load sites. Check connection.', isError: true);
    }
  }

  // ───────────────────────────────────────
  // Forced logout — when the backend reports the device/account is no
  // longer valid for continued use (admin reset the phone lock, or
  // deactivated the account), keeping the worker "logged in" locally with
  // no way to ever clock in again is worse than logging them out with an
  // explanation. This is the fix for a real gap: previously any of these
  // conditions just showed the same generic error forever with no path
  // forward.
  // ───────────────────────────────────────
  Future<void> _forceLogout(String reason) async {
    await AuthService.clearSession();
    if (!mounted) return;
    await showAppAlert(
      context,
      title: 'Logged Out',
      message: reason,
      icon: Icons.info_outline_rounded,
      iconColor: AppColors.amber600,
    );
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  /// Returns true if this exception was handled by forcing a logout (in
  /// which case the caller should not also show its own error snack).
  Future<bool> _handleApiExceptionCode(ApiException e) async {
    switch (e.code) {
      case 'DEVICE_MISMATCH':
        await _forceLogout(
          'This phone is no longer linked to your account (an admin may have reset the phone lock). Please log in again.',
        );
        return true;
      case 'ACCOUNT_DEACTIVATED':
        await _forceLogout('Your account has been deactivated. Contact your admin.');
        return true;
      default:
        return false;
    }
  }

  // ───────────────────────────────────────
  // Clock Action
  // ───────────────────────────────────────
  Future<void> _handleClock(String eventType) async {
    if (_selectedSite == null) {
      _showSnack('Please select a work site first.', isError: true);
      return;
    }

    setState(() {
      if (eventType == 'IN') _clockingIn = true;
      if (eventType == 'OUT') _clockingOut = true;
      _gpsLoading = true;
    });

    // 1. Get GPS position. If this fails, there's nothing to queue — the
    //    worker needs to get a GPS fix and try again, that's not a
    //    connectivity problem.
    final LocationResult location;
    try {
      location = await LocationService.getCurrentLocation();
    } catch (e) {
      _showSnack(e.toString().replaceAll('Exception: ', ''), isError: true, duration: const Duration(seconds: 4));
      if (mounted) {
        setState(() {
          _clockingIn = false;
          _clockingOut = false;
          _gpsLoading = false;
        });
      }
      return;
    }

    setState(() => _gpsLoading = false);
    final site = _selectedSite!;
    final clientTimestamp = DateTime.now();

    final distance = Geolocator.distanceBetween(
      location.latitude,
      location.longitude,
      site.latitude,
      site.longitude,
    );

    // Strict Geofencing Check
    if (distance > site.radius_meters) {
      _showSnack(
        'You are ${distance.toStringAsFixed(0)}m from ${site.name}. You must be within ${site.radius_meters}m to clock in or out!', 
        isError: true, 
        duration: const Duration(seconds: 4)
      );
      if (mounted) {
        setState(() {
          _clockingIn = false;
          _clockingOut = false;
        });
      }
      return;
    }

    // 2. Send clock event.
    try {
      final message = await ApiService.clockEvent(
        workerId: widget.worker.id,
        deviceUuid: widget.deviceUuid,
        siteId: site.id,
        eventType: eventType,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracyMeters: location.accuracyMeters,
        isMockLocation: location.isMocked,
        clientTimestamp: clientTimestamp,
      );
      _showSnack(message);
      // Opportunistically flush anything still queued from earlier — if
      // this request got through, we're online.
      unawaited(_attemptSync());
    } on ApiException catch (e) {
      // The server reached and REJECTED this request (bad device, bad
      // input, deactivated account, etc). Retrying the identical request
      // will fail the same way, so this does NOT get queued — that would
      // just mean the same rejection keeps happening silently in the
      // background. Some rejection reasons mean the local session is no
      // longer valid at all — force a clean re-login for those instead of
      // just showing an error every time.
      final handled = await _handleApiExceptionCode(e);
      if (!handled) _showSnack(e.message, isError: true);
    } catch (e) {
      // Never reached the server — genuine connectivity failure. This is
      // exactly what the offline queue is for.
      await OfflineQueueService.enqueue(
        PendingClockEvent(
          workerId: widget.worker.id,
          deviceUuid: widget.deviceUuid,
          siteId: site.id,
          eventType: eventType,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracyMeters,
          isMockLocation: location.isMocked,
          clientTimestamp: clientTimestamp,
          queuedAt: DateTime.now(),
        ),
      );
      await _refreshPendingCount();
      _showSnack(
        'No connection — saved locally. Will sync automatically when back online.',
        isError: true,
        duration: const Duration(seconds: 4),
      );
    } finally {
      if (mounted) {
        setState(() {
          _clockingIn = false;
          _clockingOut = false;
          _gpsLoading = false;
        });
      }
    }
  }

  // ───────────────────────────────────────
  // Logout
  // ───────────────────────────────────────
  Future<void> _handleLogout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Log Out?', style: TextStyle(color: AppColors.textPrimary)),
        content: const Text(
          'You will be logged out of EmpAtt. Your phone lock remains intact.',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textSecondary)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Log Out', style: TextStyle(color: AppColors.red600, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );

    if (confirm != true) return;
    await AuthService.clearSession();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  // ───────────────────────────────────────
  // Snackbar helper
  // ───────────────────────────────────────
  void _showSnack(
    String msg, {
    bool isError = false,
    Duration duration = const Duration(seconds: 3),
  }) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg, style: const TextStyle(color: Colors.white, fontSize: 13)),
        backgroundColor: isError ? AppColors.red600 : AppColors.brand600,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: duration,
      ),
    );
  }

  // ───────────────────────────────────────
  // GPS Badge label
  // ───────────────────────────────────────
  String get _gpsBadgeText {
    if (_gpsLoading) return 'Getting GPS…';
    if (_lastPosition == null) return 'GPS Acquiring…';
    final acc = _lastPosition!.accuracy.toStringAsFixed(0);
    if (_lastPosition!.isMocked) return '⚠ Mock GPS (±${acc}m)';
    return 'GPS Locked ±${acc}m';
  }

  Color get _gpsBadgeColor {
    if (_lastPosition == null || _gpsLoading) return AppColors.slate400;
    if (_lastPosition!.isMocked) return AppColors.amber600;
    if (_lastPosition!.accuracy > 100) return AppColors.amber600;
    return AppColors.brand600;
  }

  @override
  Widget build(BuildContext context) {
    final bool anyLoading = _clockingIn || _clockingOut;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ─── Header ───────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border(bottom: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: AppColors.brand600,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.person_rounded, color: Colors.white, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.worker.fullName,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          widget.worker.phone,
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _handleLogout,
                    icon: const Icon(Icons.logout_rounded, color: AppColors.slate400, size: 22),
                    tooltip: 'Log out',
                  ),
                ],
              ),
            ),

            // ─── Sync / Pending banner ────────────────────
            if (_pendingSyncCount > 0)
              Material(
                color: AppColors.amber50,
                child: InkWell(
                  onTap: _attemptSync,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Row(
                      children: [
                        const Icon(Icons.sync_problem_rounded, color: AppColors.amber700, size: 16),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '$_pendingSyncCount event${_pendingSyncCount == 1 ? '' : 's'} saved locally, not yet synced. Tap to retry.',
                            style: const TextStyle(color: AppColors.amber700, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ─── GPS Status Badge ──────────────────────
                    AppCard(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          Icon(
                            _gpsLoading
                                ? Icons.gps_not_fixed_rounded
                                : _lastPosition == null
                                    ? Icons.gps_off_rounded
                                    : Icons.gps_fixed_rounded,
                            color: _gpsBadgeColor,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _gpsBadgeText,
                              style: TextStyle(
                                color: _gpsBadgeColor,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (_gpsLoading)
                            SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: _gpsBadgeColor,
                              ),
                            ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // ─── Site Selector ────────────────────────
                    const Text(
                      'WORK SITE',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 8),
                    AppCard(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                      child: _loadingSites
                          ? const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Row(
                                children: [
                                  SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.brand600),
                                  ),
                                  SizedBox(width: 10),
                                  Text('Loading sites…', style: TextStyle(color: AppColors.textSecondary)),
                                ],
                              ),
                            )
                          : DropdownButton<WorkSite>(
                              value: _selectedSite,
                              isExpanded: true,
                              dropdownColor: AppColors.white,
                              underline: const SizedBox.shrink(),
                              icon: const Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.slate400),
                              items: _sites.map((site) {
                                return DropdownMenuItem<WorkSite>(
                                  value: site,
                                  child: Row(
                                    children: [
                                      const Icon(Icons.location_pin, color: AppColors.brand600, size: 16),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          site.name,
                                          style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              }).toList(),
                              onChanged: anyLoading
                                  ? null
                                  : (site) => setState(() {
                                      _selectedSite = site;
                                      _userSelectedSite = true;
                                    }),
                            ),
                    ),

                    const SizedBox(height: 32),

                    // ─── Clock IN Button ──────────────────────
                    SizedBox(
                      height: 64,
                      child: ElevatedButton.icon(
                        onPressed: anyLoading ? null : () => _handleClock('IN'),
                        icon: _clockingIn
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                              )
                            : const Icon(Icons.login_rounded, size: 24),
                        label: Text(
                          _clockingIn ? 'Getting GPS…' : 'CLOCK IN',
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, letterSpacing: 1),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.brand600,
                          disabledBackgroundColor: AppColors.brand600.withValues(alpha: 0.35),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          elevation: 0,
                        ),
                      ),
                    ),

                    const SizedBox(height: 12),

                    // ─── Clock OUT Button ─────────────────────
                    SizedBox(
                      height: 64,
                      child: ElevatedButton.icon(
                        onPressed: anyLoading ? null : () => _handleClock('OUT'),
                        icon: _clockingOut
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                              )
                            : const Icon(Icons.logout_rounded, size: 24),
                        label: Text(
                          _clockingOut ? 'Getting GPS…' : 'CLOCK OUT',
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, letterSpacing: 1),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.red600,
                          disabledBackgroundColor: AppColors.red600.withValues(alpha: 0.35),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          elevation: 0,
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // ─── Info card ────────────────────────────
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.info_outline_rounded, color: AppColors.brand600, size: 16),
                              SizedBox(width: 6),
                              Text(
                                'How it works',
                                style: TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          _infoRow('Select your current work site from the dropdown.'),
                          _infoRow('Tap CLOCK IN when you arrive at the site.'),
                          _infoRow('Tap CLOCK OUT when you leave.'),
                          _infoRow('GPS must be enabled for attendance to record.'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('• ', style: TextStyle(color: AppColors.brand600, fontSize: 13)),
          Expanded(
            child: Text(text, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
