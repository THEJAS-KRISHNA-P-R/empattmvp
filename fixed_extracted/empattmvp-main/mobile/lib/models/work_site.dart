/// WorkSite model for the site picker dropdown
class WorkSite {
  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final int radiusMeters;

  const WorkSite({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.radiusMeters,
  });

  factory WorkSite.fromJson(Map<String, dynamic> json) {
    return WorkSite(
      id: json['id'] as String,
      name: json['name'] as String,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      radiusMeters: (json['radius_meters'] as num?)?.toInt() ?? 200,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'latitude': latitude,
        'longitude': longitude,
        'radius_meters': radiusMeters,
      };
}
