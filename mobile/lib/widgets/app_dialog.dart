import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Shows a light-mode alert dialog with a consistent look, instead of
/// repeating AlertDialog theming at every call site.
Future<void> showAppAlert(
  BuildContext context, {
  required String title,
  required String message,
  IconData icon = Icons.warning_amber_rounded,
  Color iconColor = AppColors.amber600,
}) {
  return showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: [
          Icon(icon, color: iconColor, size: 24),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
      content: Text(message, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('OK', style: TextStyle(color: AppColors.brand600, fontWeight: FontWeight.w600)),
        ),
      ],
    ),
  );
}
