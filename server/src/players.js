import { MAX_SPEED, OFFICE } from "./config.js";

/** @type {Map<string, Player>} */
const players = new Map();
/** @type {Map<string, { x: number, y: number, at: number }>} */
const recent = new Map();

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function randomSpawn() {
  return {
    x: OFFICE.width / 2 + (Math.random() - 0.5) * 160,
    y: OFFICE.height / 2 + (Math.random() - 0.5) * 120,
  };
}

function spawnFor(userId) {
  const prev = recent.get(userId);
  if (prev && Date.now() - prev.at < 20_000) return { x: prev.x, y: prev.y };
  return randomSpawn();
}

export function toClient(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
  };
}

export function getPlayer(id) {
  return players.get(id) || null;
}

export function listPlayers() {
  return [...players.values()];
}

export function playerCount() {
  return players.size;
}

/**
 * @param {string} socketId
 * @param {{ id: string, displayName: string, color: string }} user
 */
export function addPlayer(socketId, user) {
  const existing = players.get(user.id);
  const replacedSocketId =
    existing && existing.socketId !== socketId ? existing.socketId : null;
  const spot = existing ? { x: existing.x, y: existing.y } : spawnFor(user.id);
  const player = {
    id: user.id,
    name: user.displayName,
    color: user.color,
    x: round1(clamp(spot.x, OFFICE.minX, OFFICE.maxX)),
    y: round1(clamp(spot.y, OFFICE.minY, OFFICE.maxY)),
    socketId,
    linked: existing?.linked ? [...existing.linked] : [],
    audioKey: "",
    movedAt: Date.now(),
  };
  players.set(user.id, player);
  recent.delete(user.id);
  return { player, replacedSocketId };
}

export function removePlayer(id) {
  const player = players.get(id);
  if (!player) return false;
  recent.set(id, { x: player.x, y: player.y, at: Date.now() });
  players.delete(id);
  for (const other of players.values()) {
    if (other.linked.includes(id)) {
      other.linked = other.linked.filter((peerId) => peerId !== id);
      other.audioKey = "";
    }
  }
  return true;
}

/**
 * Accept a step only when it stays on the floor and could be walked
 * since the previous accepted position. Anything else is rejected and
 * the caller should send the player back to the last good pixel.
 */
export function tryMove(id, x, y) {
  const player = players.get(id);
  if (!player) return { ok: false };
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, correct: { x: player.x, y: player.y } };
  }

  const nx = round1(clamp(x, OFFICE.minX, OFFICE.maxX));
  const ny = round1(clamp(y, OFFICE.minY, OFFICE.maxY));
  const now = Date.now();
  // Cap the window so standing still does not turn into permission to teleport.
  const elapsed = Math.min(0.2, Math.max(0.016, (now - player.movedAt) / 1000));
  const allowed = MAX_SPEED * elapsed + 36;
  const jumped = Math.hypot(nx - player.x, ny - player.y);

  if (jumped > allowed) {
    return { ok: false, correct: { x: player.x, y: player.y } };
  }
  if (jumped < 0.4) return { ok: true, unchanged: true, player };

  player.x = nx;
  player.y = ny;
  player.movedAt = now;
  return { ok: true, player };
}

