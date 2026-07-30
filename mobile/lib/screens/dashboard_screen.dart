import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../models/worker.dart';
import '../models/work_site.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/location_service.dart';
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

  // Clock action state
  bool _clockingIn = false;
  bool _clockingOut = false;

  // Connectivity / sync
  bool _isPendingSync = false;

  @override
  void initState() {
    super.initState();
    _startGpsStream();
    _loadSites();
  }

  // ───────────────────────────────────────
  // GPS Stream
  // ───────────────────────────────────────
  void _startGpsStream() {
    try {
      LocationService.getPositionStream().listen(
        (pos) {
          if (mounted) setState(() => _lastPosition = pos);
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
          _selectedSite = sites.isNotEmpty ? sites.first : null;
          _loadingSites = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingSites = false);
      _showSnack('Could not load sites. Check connection.', isError: true);
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
      _isPendingSync = false;
    });

    try {
      // 1. Get GPS position
      final location = await LocationService.getCurrentLocation();

      setState(() => _gpsLoading = false);

      // 2. Send clock event
      final message = await ApiService.clockEvent(
        workerId: widget.worker.id,
        deviceUuid: widget.deviceUuid,
        siteId: _selectedSite!.id,
        eventType: eventType,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracyMeters: location.accuracyMeters,
        isMockLocation: location.isMocked,
        clientTimestamp: DateTime.now(),
      );

      _showSnack(message);
    } on ApiException catch (e) {
      setState(() => _isPendingSync = true);
      _showSnack(e.message, isError: true);
    } catch (e) {
      // Network failure — show pending sync banner
      setState(() => _isPendingSync = true);
      _showSnack(
        'No connection. Event will sync when online.',
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
        backgroundColor: const Color(0xFF1E1E2E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Logout?', style: TextStyle(color: Colors.white)),
        content: const Text(
          'You will be logged out of EmpAtt. Your device binding remains intact.',
          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF64748B))),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Logout', style: TextStyle(color: Color(0xFFEF4444))),
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
        backgroundColor: isError ? const Color(0xFFDC2626) : const Color(0xFF16A34A),
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
    if (_lastPosition == null || _gpsLoading) return const Color(0xFF475569);
    if (_lastPosition!.isMocked) return const Color(0xFFF59E0B);
    if (_lastPosition!.accuracy > 100) return const Color(0xFFF59E0B);
    return const Color(0xFF22C55E);
  }

  @override
  Widget build(BuildContext context) {
    final bool anyLoading = _clockingIn || _clockingOut;

    return Scaffold(
      backgroundColor: const Color(0xFF0F0F1A),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ─── Header ───────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              decoration: const BoxDecoration(
                color: Color(0xFF1A1A2E),
                border: Border(bottom: BorderSide(color: Color(0xFF2D2D3F))),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                      ),
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
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          widget.worker.phone,
                          style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _handleLogout,
                    icon: const Icon(Icons.logout_rounded, color: Color(0xFF475569), size: 22),
                    tooltip: 'Logout',
                  ),
                ],
              ),
            ),

            // ─── Sync / Pending banner ────────────────────
            if (_isPendingSync)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: const Color(0xFF451A03),
                child: const Row(
                  children: [
                    Icon(Icons.sync_problem_rounded, color: Color(0xFFF97316), size: 16),
                    SizedBox(width: 8),
                    Text(
                      'Pending Sync — Last event not saved. Retry when online.',
                      style: TextStyle(color: Color(0xFFF97316), fontSize: 12),
                    ),
                  ],
                ),
              ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ─── GPS Status Badge ──────────────────────
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E1E2E),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF2D2D3F)),
                      ),
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
                        color: Color(0xFF64748B),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E1E2E),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF2D2D3F)),
                      ),
                      child: _loadingSites
                          ? const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Row(
                                children: [
                                  SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6366F1)),
                                  ),
                                  SizedBox(width: 10),
                                  Text('Loading sites…', style: TextStyle(color: Color(0xFF64748B))),
                                ],
                              ),
                            )
                          : DropdownButton<WorkSite>(
                              value: _selectedSite,
                              isExpanded: true,
                              dropdownColor: const Color(0xFF1E1E2E),
                              underline: const SizedBox.shrink(),
                              icon: const Icon(Icons.keyboard_arrow_down_rounded, color: Color(0xFF475569)),
                              items: _sites.map((site) {
                                return DropdownMenuItem<WorkSite>(
                                  value: site,
                                  child: Row(
                                    children: [
                                      const Icon(Icons.location_pin, color: Color(0xFF6366F1), size: 16),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          site.name,
                                          style: const TextStyle(color: Colors.white, fontSize: 14),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              }).toList(),
                              onChanged: anyLoading
                                  ? null
                                  : (site) => setState(() => _selectedSite = site),
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
                          backgroundColor: const Color(0xFF16A34A),
                          disabledBackgroundColor: const Color(0xFF16A34A).withValues(alpha: 0.35),
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
                          backgroundColor: const Color(0xFFDC2626),
                          disabledBackgroundColor: const Color(0xFFDC2626).withValues(alpha: 0.35),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          elevation: 0,
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // ─── Info card ────────────────────────────
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E1E2E),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF2D2D3F)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.info_outline_rounded, color: Color(0xFF6366F1), size: 16),
                              SizedBox(width: 6),
                              Text(
                                'How it works',
                                style: TextStyle(
                                  color: Color(0xFF94A3B8),
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
          const Text('• ', style: TextStyle(color: Color(0xFF6366F1), fontSize: 13)),
          Expanded(
            child: Text(text, style: const TextStyle(color: Color(0xFF64748B), fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
