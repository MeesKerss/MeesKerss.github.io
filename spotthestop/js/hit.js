// Screen-space hit test: the closest dot centre within radiusPx wins.
export function nearestStop(points, click, radiusPx) {
  let best = null;
  let bestD = radiusPx * radiusPx;
  for (const p of points) {
    const d = (p.x - click.x) ** 2 + (p.y - click.y) ** 2;
    if (d <= bestD) { bestD = d; best = p.id; }
  }
  return best;
}
