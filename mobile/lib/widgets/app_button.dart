import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

enum AppButtonVariant { primary, secondary, danger }

/// A hand-built button instead of pulling in a UI kit package — this app
/// ships as a sideloaded APK shared over WhatsApp, so keeping the
/// dependency list (and APK size) small is worth more here than reaching
/// for a component library for a handful of button styles.
///
/// Meets the 48dp minimum touch target (Material) via the fixed height,
/// and shows a spinner + disables itself during [loading] so a slow
/// network can't be tapped twice.
class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final AppButtonVariant variant;
  final IconData? icon;

  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.variant = AppButtonVariant.primary,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final bool disabled = onPressed == null || loading;
    final colors = _colorsFor(variant, disabled);

    return SizedBox(
      height: 52,
      child: Material(
        color: colors.background,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: disabled ? null : onPressed,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: colors.border != null ? Border.all(color: colors.border!) : null,
            ),
            alignment: Alignment.center,
            child: loading
                ? SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation(colors.foreground),
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, color: colors.foreground, size: 20),
                        const SizedBox(width: 10),
                      ],
                      Text(
                        label,
                        style: TextStyle(
                          color: colors.foreground,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  _ButtonColors _colorsFor(AppButtonVariant variant, bool disabled) {
    if (disabled) {
      return _ButtonColors(
        background: AppColors.slate100,
        foreground: AppColors.slate400,
        border: null,
      );
    }
    switch (variant) {
      case AppButtonVariant.primary:
        return const _ButtonColors(
          background: AppColors.brand600,
          foreground: AppColors.white,
          border: null,
        );
      case AppButtonVariant.secondary:
        return const _ButtonColors(
          background: AppColors.white,
          foreground: AppColors.slate600,
          border: AppColors.slate200,
        );
      case AppButtonVariant.danger:
        return const _ButtonColors(
          background: AppColors.red50,
          foreground: AppColors.red700,
          border: AppColors.red600,
        );
    }
  }
}

class _ButtonColors {
  final Color background;
  final Color foreground;
  final Color? border;
  const _ButtonColors({required this.background, required this.foreground, this.border});
}
