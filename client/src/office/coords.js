export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function toWorld(x, y, office) {
  return {
    x: (x - office.width / 2) / office.scale,
    z: (y - office.height / 2) / office.scale,
  };
}

export function toPixel(x, z, office) {
  return {
    x: clamp(x * office.scale + office.width / 2, office.minX, office.maxX),
    y: clamp(z * office.scale + office.height / 2, office.minY, office.maxY),
  };
}
