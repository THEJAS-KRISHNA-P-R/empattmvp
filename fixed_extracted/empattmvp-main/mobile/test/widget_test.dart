// Basic smoke tests for the EmpAtt mobile app.
//
// The previous version of this file was the unmodified Flutter counter-app
// template — it referenced `MyApp`, a class that doesn't exist in this
// project (`EmpAttApp` does), so `flutter test` would fail to even compile
// it. These replacements actually exercise this app's code.

import 'package:flutter_test/flutter_test.dart';

import 'package:empatt_mobile/main.dart';
import 'package:empatt_mobile/services/device_service.dart';

void main() {
  testWidgets('Unauthenticated app launch shows the login screen', (WidgetTester tester) async {
    await tester.pumpWidget(const EmpAttApp(isLoggedIn: false));
    // Let the login screen's fade-in AnimationController advance past its
    // first frame — we don't need the animation to finish, just enough
    // frames for the widget tree to settle.
    await tester.pump();

    expect(find.text('EmpAtt'), findsOneWidget);
    expect(find.text('Field Worker GPS Attendance'), findsOneWidget);
    expect(find.text('Phone Number'), findsOneWidget);
  });

  test('DeviceService.getHardwareUuid throws UnsupportedError off-Android', () async {
    // `flutter test` runs on the host machine (Linux/macOS/Windows CI),
    // not on an Android device, so Platform.isAndroid is false here and
    // this exercises the explicit unsupported-platform branch. This is a
    // deliberately narrow test: it is NOT verifying that the real
    // Settings.Secure.ANDROID_ID lookup works (that requires an actual
    // Android device/emulator via an integration test), only that the
    // non-Android path fails loudly instead of silently.
    await expectLater(
      DeviceService.getHardwareUuid(),
      throwsA(isA<UnsupportedError>()),
    );
  });
}
