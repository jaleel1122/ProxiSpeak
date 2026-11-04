import dotenv from "dotenv";

dotenv.config();

export const PORT = Number(process.env.PORT) || 3001;
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || "http://localhost:5173";

export const ALLOWED_ORIGINS = [
  ...new Set([CLIENT_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"]),
];

export const MONGODB_URI = process.env.MONGODB_URI?.trim() || "";
export const MONGODB_DB = process.env.MONGODB_DB?.trim() || "proxispeak";
export const JWT_SECRET = process.env.JWT_SECRET?.trim() || "";

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing. Add it to server/.env.");
}
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error("JWT_SECRET is missing or too short. Add a long random value to server/.env.");
}

/** Floor size in pixels. One pixel is stored as one meter. */
export const OFFICE = {
  id: "infotact-hq",
  name: "Infotact HQ",
  width: 2400,
  height: 1400,
  minX: 30,
  maxX: 2370,
  minY: 30,
  maxY: 1370,
  /** World units per pixel is 1/scale. The 3D floor is 48 by 28 units. */
  scale: 50,
  earshot: 280,
  leave: 320,
  loud: 60,
};

/** Fastest accepted walk, in pixels per second. Sprint in the 3D office is 305. */
export const MAX_SPEED = 380;

/** Simultaneous audio peers per person. */
export const MAX_PEERS = 8;

export const EARTH_RADIUS_M = 6_378_100;
export const OFFICE_ANCHOR = { lng: 77.5946, lat: 12.9716 };
export const METERS_PER_DEG_LAT = 111_320;

