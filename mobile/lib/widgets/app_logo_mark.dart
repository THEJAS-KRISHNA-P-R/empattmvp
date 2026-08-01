import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// The EmpAtt brand mark — a rounded square with a location pin, matching
/// the web admin dashboard's header icon and the app icon design. Built as
/// a widget (not an image asset) so it stays crisp at any size with zero
/// asset weight.
class AppLogoMark extends StatelessWidget {
  final double size;

  const AppLogoMark({super.key, this.size = 72});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.brand600,
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand600.withValues(alpha: 0.25),
            blurRadius: size * 0.3,
            offset: Offset(0, size * 0.1),
          ),
        ],
      ),
      child: Center(
        child: Icon(
          Icons.near_me_rounded,
          color: AppColors.white,
          size: size * 0.5,
        ),
      ),
    );
  }
}
