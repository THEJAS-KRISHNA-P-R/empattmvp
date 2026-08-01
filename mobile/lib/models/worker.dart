/// Worker model for session storage and display
class Worker {
  final String id;
  final String fullName;
  final String phone;
  final String employeeId;

  const Worker({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.employeeId,
  });

  factory Worker.fromJson(Map<String, dynamic> json) {
    return Worker(
      id: json['id'] as String,
      fullName: json['full_name'] as String,
      phone: json['phone'] as String,
      // Older cached sessions (saved before this field existed) won't have
      // it — default to empty rather than crashing on a null cast.
      employeeId: json['employee_id'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'full_name': fullName,
        'phone': phone,
        'employee_id': employeeId,
      };
}
