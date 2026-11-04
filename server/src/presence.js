import { MAX_PEERS, OFFICE } from "./config.js";
import { presenceCol } from "./db.js";
import { metersToRadians, pixelsToPoint } from "./geo.js";

function locationFields(player) {
  return {
    socketId: player.socketId,
    officeId: OFFICE.id,
    displayName: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    location: pixelsToPoint(player.x, player.y),
    updatedAt: new Date(),
  };
}

export async function clearPresence() {
  await presenceCol().deleteMany({ officeId: OFFICE.id });
}

export async function upsertPresence(player) {
  await presenceCol().updateOne(
    { userId: player.id },
    { $set: locationFields(player) },
    { upsert: true }
  );
}

export async function syncPositions(players) {
  if (!players.length) return;
  await presenceCol().bulkWrite(
    players.map((player) => ({
      updateOne: {
        filter: { userId: player.id },
        update: { $set: locationFields(player) },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

export async function removePresence(userId) {
  await presenceCol().deleteOne({ userId });
}

/** Drop presence rows for anyone who is no longer in the office. */
export async function retainLive(players) {
  const ids = players.map((player) => player.id);
  await presenceCol().deleteMany({
    officeId: OFFICE.id,
    userId: { $nin: ids },
  });
}

/**
 * Two index-backed checks, then their intersection:
 * - $geoWithin / $centerSphere: who is inside the leave circle
 * - $geoNear: the same people, ordered, with distance in meters
 * A person counts only when both queries return them.
 */
export async function nearbyUsers(player) {
  const point = pixelsToPoint(player.x, player.y);
  const presence = presenceCol();
  const circle = {
    userId: { $ne: player.id },
    officeId: OFFICE.id,
    location: {
      $geoWithin: {
        $centerSphere: [point.coordinates, metersToRadians(OFFICE.leave)],
      },
    },
  };

  const within = await presence
    .find(circle, { projection: { userId: 1 } })
    .limit(32)
    .toArray();
  if (!within.length) return [];

  const ids = within.map((doc) => doc.userId);
  return presence
    .aggregate([
      {
        $geoNear: {
          near: point,
          key: "location",
          distanceField: "distanceMeters",
          maxDistance: OFFICE.leave,
          spherical: true,
          query: { officeId: OFFICE.id, userId: { $in: ids } },
        },
      },
      { $limit: 32 },
      { $project: { userId: 1, distanceMeters: 1, x: 1, y: 1 } },
    ])
    .toArray();
}

/**
 * Latest pixels are written first, then MongoDB decides whether `toId`
 * is inside the leave circle around the sender.
 */
/**
 * Writes both players' current pixels, then asks MongoDB whether the
 * target is inside the leave circle. Signaling uses this on every message.
 */
export async function pairWithinLeave(fromPlayer, toPlayer) {
  await syncPositions([fromPlayer, toPlayer]);
  const point = pixelsToPoint(fromPlayer.x, fromPlayer.y);
  const hit = await presenceCol().findOne(
    {
      userId: toPlayer.id,
      officeId: OFFICE.id,
      location: {
        $geoWithin: {
          $centerSphere: [point.coordinates, metersToRadians(OFFICE.leave)],
        },
      },
    },
    { projection: { userId: 1 } }
  );
  return Boolean(hit);
}

export function proximityFor(player, hits) {
  const rows = hits
    .map((hit) => ({
      id: hit.userId,
      distance: hit.distanceMeters,
      dx: hit.x - player.x,
      dy: hit.y - player.y,
    }))
    .filter((row) => Number.isFinite(row.distance))
    .sort((a, b) => a.distance - b.distance);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const keep = [];

  for (const id of player.linked) {
    const row = byId.get(id);
    if (row && row.distance <= OFFICE.leave && keep.length < MAX_PEERS) keep.push(id);
  }
  for (const row of rows) {
    if (keep.length >= MAX_PEERS) break;
    if (keep.includes(row.id)) continue;
    if (row.distance <= OFFICE.earshot) keep.push(row.id);
  }

  player.linked = keep;
  const peers = keep.map((id) => {
    const row = byId.get(id);
    return {
      id,
      distance: Math.round(row.distance * 10) / 10,
      dx: Math.round(row.dx * 10) / 10,
      dy: Math.round(row.dy * 10) / 10,
    };
  });
  return { hearable: keep, peers };
}

