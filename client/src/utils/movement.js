/**
 * Movement & World Configuration Utilities for ProxiSpeak
 */

export const WORLD_CONFIG = {
  width: 1600,
  height: 900,
  gridSize: 40,
  playerRadius: 22,
  playerSpeed: 280, // pixels per second
};

export const ZONES = [
  {
    id: 'boardroom',
    name: 'BOARDROOM',
    subtitle: 'Executive & Sync Meetings',
    x: 60,
    y: 60,
    width: 480,
    height: 340,
    accent: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.05)',
    border: 'rgba(99, 102, 241, 0.25)',
  },
  {
    id: 'lounge',
    name: 'LOUNGE',
    subtitle: 'Casual & Breakout Space',
    x: 1060,
    y: 60,
    width: 480,
    height: 340,
    accent: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.05)',
    border: 'rgba(6, 182, 212, 0.25)',
  },
  {
    id: 'focus-area',
    name: 'FOCUS AREA',
    subtitle: 'Quiet / Deep Work Pods',
    x: 60,
    y: 500,
    width: 480,
    height: 340,
    accent: '#10b981',
    bg: 'rgba(16, 185, 129, 0.05)',
    border: 'rgba(16, 185, 129, 0.25)',
  },
  {
    id: 'open-workspace',
    name: 'OPEN WORKSPACE',
    subtitle: 'Team Collaboration Desks',
    x: 1060,
    y: 500,
    width: 480,
    height: 340,
    accent: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.05)',
    border: 'rgba(129, 140, 248, 0.25)',
  },
];

/**
 * Extracts 1-2 initials from a username.
 * Example:
 *   "Arnob Mondal" -> "AM"
 *   "Alice" -> "AL"
 *   "Bob" -> "BO"
 */
export function getInitials(name) {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

/**
 * Normalizes keyboard input into a unit direction vector (dx, dy).
 * Normalizes diagonal movement so moving W+D is not faster than W alone.
 */
export function getMovementVector(keys) {
  let dx = 0;
  let dy = 0;

  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;

  if (dx !== 0 && dy !== 0) {
    // Diagonal normalization: 1 / sqrt(2) ≈ 0.7071
    const invLength = 1 / Math.hypot(dx, dy);
    dx *= invLength;
    dy *= invLength;
  }

  return { dx, dy };
}

/**
 * Clamps player coordinates within the world boundaries based on avatar radius.
 */
export function clampPosition(x, y, radius, worldWidth, worldHeight) {
  const clampedX = Math.max(radius, Math.min(worldWidth - radius, x));
  const clampedY = Math.max(radius, Math.min(worldHeight - radius, y));
  return { x: clampedX, y: clampedY };
}

/**
 * Updates player position given key states and delta time (seconds).
 * Returns true if position actually changed.
 */
export function updatePlayerPosition(player, keys, deltaTime, worldWidth, worldHeight) {
  const { dx, dy } = getMovementVector(keys);
  if (dx === 0 && dy === 0) return false;

  const newX = player.x + dx * player.speed * deltaTime;
  const newY = player.y + dy * player.speed * deltaTime;

  const clamped = clampPosition(newX, newY, player.radius, worldWidth, worldHeight);
  const moved = clamped.x !== player.x || clamped.y !== player.y;

  player.x = clamped.x;
  player.y = clamped.y;

  return moved;
}

/**
 * Identifies which zone the player is currently inside (or Central Plaza).
 */
export function getCurrentZone(x, y) {
  for (const zone of ZONES) {
    if (
      x >= zone.x &&
      x <= zone.x + zone.width &&
      y >= zone.y &&
      y <= zone.y + zone.height
    ) {
      return zone;
    }
  }
  return {
    id: 'central-plaza',
    name: 'MAIN HALL',
    subtitle: 'Central Atrium & Walkways',
    accent: '#94a3b8',
  };
}
