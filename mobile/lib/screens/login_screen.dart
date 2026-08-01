import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/device_service.dart';
import '../theme/app_colors.dart';
import '../widgets/app_button.dart';
import '../widgets/app_dialog.dart';
import '../widgets/app_logo_mark.dart';
import '../widgets/app_text_field.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final _phoneController = TextEditingController();
  final _employeeIdController = TextEditingController();
  final _passcodeController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _isLoading = false;
  bool _obscurePasscode = true;
  late AnimationController _fadeCtrl;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _fadeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);
    _fadeCtrl.forward();
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _employeeIdController.dispose();
    _passcodeController.dispose();
    _fadeCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();

    setState(() => _isLoading = true);

    try {
      // 1. Get hardware ID
      final deviceUuid = await DeviceService.getHardwareUuid();

      // 2. Call login API — phone + employee ID + PIN, all three must
      //    match the same worker record.
      final worker = await ApiService.login(
        phone: _phoneController.text.trim(),
        employeeId: _employeeIdController.text.trim(),
        passcode: _passcodeController.text.trim(),
        deviceUuid: deviceUuid,
      );

      // 3. Persist session
      await AuthService.saveSession(worker: worker, deviceUuid: deviceUuid);

      if (!mounted) return;

      // 4. Navigate to dashboard
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => DashboardScreen(worker: worker, deviceUuid: deviceUuid),
        ),
      );
    } on ApiException catch (e) {
      _showError(e.message);
    } on UnsupportedError catch (e) {
      _showError(e.message ?? 'Unsupported device.');
    } catch (e) {
      _showError('Network error. Check your internet connection and try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    showAppAlert(
      context,
      title: 'Login Failed',
      message: message,
      icon: Icons.error_outline_rounded,
      iconColor: AppColors.red600,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: FadeTransition(
          opacity: _fadeAnim,
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: AppLogoMark(size: 72)),
                    const SizedBox(height: 24),

                    const Text(
                      'EmpAtt',
                      style: TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 30,
                        fontWeight: FontWeight.bold,
                        letterSpacing: -0.5,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Field Worker GPS Attendance',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
                      textAlign: TextAlign.center,
                    ),

                    const SizedBox(height: 40),

                    AppTextField(
                      label: 'Phone Number',
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      hint: '9812345678',
                      prefixText: '+91 ',
                      maxLength: 10,
                      icon: Icons.phone_rounded,
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Enter your phone number';
                        if (v.trim().length != 10) return 'Phone number must be exactly 10 digits';
                        return null;
                      },
                    ),
                    const SizedBox(height: 18),

                    AppTextField(
                      label: 'Employee ID / Email',
                      controller: _employeeIdController,
                      keyboardType: TextInputType.text,
                      textCapitalization: TextCapitalization.none,
                      hint: 'e.g. EMP001',
                      icon: Icons.badge_outlined,
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Enter your employee ID or email';
                        return null;
                      },
                    ),
                    const SizedBox(height: 18),

                    AppTextField(
                      label: 'PIN / Password',
                      controller: _passcodeController,
                      obscureText: _obscurePasscode,
                      hint: 'Enter your PIN',
                      icon: Icons.lock_outline_rounded,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePasscode ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                          color: AppColors.slate400,
                          size: 20,
                        ),
                        onPressed: () => setState(() => _obscurePasscode = !_obscurePasscode),
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Enter your PIN';
                        if (v.trim().length < 4) return 'PIN must be at least 4 characters';
                        return null;
                      },
                    ),

                    const SizedBox(height: 28),

                    AppButton(
                      label: 'Log In',
                      icon: Icons.login_rounded,
                      loading: _isLoading,
                      onPressed: _handleLogin,
                    ),

                    const SizedBox(height: 20),
                    const Text(
                      'The first time you log in, this account will be permanently linked to this phone.',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
