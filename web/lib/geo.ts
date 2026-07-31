/**
 * Haversine great-circle distance between two lat/lng points, in meters.
 *
 * This is a plain-JS approximation, not a PostGIS spatial query. That's a
 * deliberate MVP-scale tradeoff — see the comment in supabase/schema.sql.
 * Accurate to within ~0.5% at these distances, which is far tighter than
 * consumer GPS accuracy itself (typically 5-50m), so it's not the limiting
 * factor in geofence correctness.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS_METERS = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}
