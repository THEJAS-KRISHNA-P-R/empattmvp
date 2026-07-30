/// Worker model for session storage and display
class Worker {
  final String id;
  final String fullName;
  final String phone;

  const Worker({
    required this.id,
    required this.fullName,
    required this.phone,
  });

  factory Worker.fromJson(Map<String, dynamic> json) {
    return Worker(
      id: json['id'] as String,
      fullName: json['full_name'] as String,
      phone: json['phone'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'full_name': fullName,
        'phone': phone,
      };
}
