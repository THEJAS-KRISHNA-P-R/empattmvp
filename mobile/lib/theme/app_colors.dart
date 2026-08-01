import 'package:flutter/material.dart';

/// EmpAtt design tokens — light mode only, deliberately (matches the web
/// admin dashboard's globals.css). No purple/violet/indigo anywhere.
/// Brand green mirrors the existing YourFee brand color (#1BA67E); the
/// darker 600/700 shades exist because the raw brand color doesn't clear
/// WCAG AA contrast for white text on a filled button.
class AppColors {
  AppColors._();

  // Brand green (primary/interactive)
  static const brand50 = Color(0xFFECFDF5);
  static const brand100 = Color(0xFFD1FAE5);
  static const brand400 = Color(0xFF1BA67E);
  static const brand600 = Color(0xFF0F8060);
  static const brand700 = Color(0xFF0D6E52);

  // Neutrals
  static const slate50 = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate400 = Color(0xFF94A3B8);
  static const slate500 = Color(0xFF64748B);
  static const slate600 = Color(0xFF475569);
  static const slate900 = Color(0xFF0F172A);

  // Semantic status
  static const red50 = Color(0xFFFEF2F2);
  static const red600 = Color(0xFFDC2626);
  static const red700 = Color(0xFFB91C1C);
  static const amber50 = Color(0xFFFFFBEB);
  static const amber600 = Color(0xFFD97706);
  static const amber700 = Color(0xFFB45309);

  static const white = Color(0xFFFFFFFF);

  // Semantic aliases used throughout the app — change the meaning here,
  // not at each call site.
  static const background = slate50;
  static const surface = white;
  static const border = slate200;
  static const textPrimary = slate900;
  static const textSecondary = slate500;
  static const textMuted = slate400;
  static const primary = brand600;
  static const primaryHover = brand700;
  static const danger = red600;
  static const warning = amber600;
}
