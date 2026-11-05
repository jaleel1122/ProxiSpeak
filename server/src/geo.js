import {
  EARTH_RADIUS_M,
  METERS_PER_DEG_LAT,
  OFFICE,
  OFFICE_ANCHOR,
} from "./config.js";

/**
 * Office pixels become a real GeoJSON point so MongoDB's 2dsphere index
 * can answer "who is within N meters". One pixel is one meter.
 * Longitude is stored first, then latitude.
 */
export function pixelsToPoint(x, y) {
  const eastMeters = x - OFFICE.width / 2;
  const northMeters = -(y - OFFICE.height / 2);
  const lat = OFFICE_ANCHOR.lat + northMeters / METERS_PER_DEG_LAT;
  const metersPerDegLng =
    METERS_PER_DEG_LAT * Math.cos((OFFICE_ANCHOR.lat * Math.PI) / 180);
  const lng = OFFICE_ANCHOR.lng + eastMeters / metersPerDegLng;
  return { type: "Point", coordinates: [lng, lat] };
}

/** $centerSphere radius is in radians. */
export function metersToRadians(meters) {
  return meters / EARTH_RADIUS_M;
}

