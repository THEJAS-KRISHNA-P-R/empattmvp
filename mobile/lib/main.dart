import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/auth_service.dart';
import 'services/device_service.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'theme/app_colors.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Force portrait orientation only
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Check for existing session
  final session = await AuthService.loadSession();
  final isLoggedIn = session != null;

  runApp(EmpAttApp(isLoggedIn: isLoggedIn, session: session));
}

class EmpAttApp extends StatelessWidget {
  final bool isLoggedIn;
  final Map<String, String>? session;

  const EmpAttApp({super.key, required this.isLoggedIn, this.session});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EmpAtt',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.brand600,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.background,
        useMaterial3: true,
      ),
      home: isLoggedIn && session != null
          ? _SessionRestoreScreen(session: session!)
          : const LoginScreen(),
    );
  }
}

/// Restores a persisted session by reconstructing the Worker + deviceUuid
/// from SharedPreferences and navigating directly to DashboardScreen.
class _SessionRestoreScreen extends StatefulWidget {
  final Map<String, String> session;
  const _SessionRestoreScreen({required this.session});

  @override
  State<_SessionRestoreScreen> createState() => _SessionRestoreScreenState();
}

class _SessionRestoreScreenState extends State<_SessionRestoreScreen> {
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    try {
      final worker = await AuthService.getLoggedInWorker();
      // Deliberately re-read the live hardware ID rather than trusting the
      // cached one from SharedPreferences — this is what actually gets
      // sent on the next clock event, so it should reflect the real
      // device right now, not what it was when the session was saved.
      final deviceUuid = await DeviceService.getHardwareUuid();

      if (!mounted) return;

      if (worker == null) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
        return;
      }

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => DashboardScreen(worker: worker, deviceUuid: deviceUuid),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: CircularProgressIndicator(color: AppColors.brand600),
      ),
    );
  }
}
