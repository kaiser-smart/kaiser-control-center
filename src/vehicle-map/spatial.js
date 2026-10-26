// Screen-space geometry, in CSS pixels. Independent of Google and testable.
export function rect(x, y, width, height) { return { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 }; }
export function overlaps(a, b, gap = 0) { return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top; }
export function inside(a, bounds) { return a.left >= bounds.left && a.right <= bounds.right && a.top >= bounds.top && a.bottom <= bounds.bottom; }
export function markerRect(p) {
  // Includes touch target, status badge, ring, and the external heading arrow.
  return rect(p.x, p.y, Math.max(p.vehicle?.heading != null ? 76 : 70, p.width || 0), Math.max(p.vehicle?.heading !== null && p.vehicle?.heading !== undefined ? 76 : 58, p.height || 0));
}
export const clusterRect = (x, y) => ({ left: x - 30, top: y - 30, right: x + 30, bottom: y + 46 });
const groupNode = (members) => {
  const x = members.reduce((s, p) => s + p.x, 0) / members.length;
  const y = members.reduce((s, p) => s + p.y, 0) / members.length;
  return { id: members.map((p) => p.id).sort().join("|"), members, x, y,
    bounds: members.length === 1 ? markerRect(members[0]) : clusterRect(x, y) };
};
/** Initial grid union, followed by convergence of actual marker/cluster rectangles. */
export function clusterPoints(points) {
  const sorted = [...points].sort((a, b) => a.id.localeCompare(b.id));
  const parent = sorted.map((_, i) => i), grid = new Map();
  const root = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { parent[root(j)] = root(i); };
  sorted.forEach((p, i) => {
    const gx = Math.floor(p.x / 72), gy = Math.floor(p.y / 64);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -2; dy <= 2; dy++) {
      for (const j of grid.get(`${gx + dx}:${gy + dy}`) || []) {
        const q = sorted[j];
        if ((Math.abs(p.x - q.x) < 72 && Math.abs(p.y - q.y) < 64) || overlaps(markerRect(p), markerRect(q), 3)) union(i, j);
      }
    }
    const key = `${gx}:${gy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  const initial = new Map();
  sorted.forEach((p, i) => { const r = root(i); if (!initial.has(r)) initial.set(r, []); initial.get(r).push(p); });
  let nodes = [...initial.values()].map(groupNode), changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (overlaps(nodes[i].bounds, nodes[j].bounds, 6)) {
        nodes[i] = groupNode([...nodes[i].members, ...nodes[j].members]);
        nodes.splice(j, 1); changed = true; break outer;
      }
    }
  }
  return nodes;
}
/** Try radial positions, then a bounded grid. No vehicle coordinates are changed.
 * If physical space is insufficient, the group list remains the complete access path. */
export function spreadPoints(points, center, bounds, obstacles = []) {
  if (points.length > 8) return null;
  const placed = [], occupied = [...obstacles];
  const candidates = [];
  for (let radius = 96; radius <= 288; radius += 48) for (let i = 0; i < 16; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 8;
    candidates.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  for (let y = bounds.top + 42; y < bounds.bottom - 40; y += 86) for (let x = bounds.left + 38; x < bounds.right - 36; x += 82) candidates.push({ x, y });
  for (const point of points) {
    const candidate = candidates.find((p) => {
      const r = markerRect({ ...point, ...p });
      return inside(r, bounds) && !occupied.some((o) => overlaps(r, o, 8));
    });
    if (!candidate) return null;
    const p = { ...point, ...candidate, anchor: { x: point.x, y: point.y } };
    placed.push(p); occupied.push(markerRect(p));
  }
  return placed;
}
// Visible marker geometry for plate collisions; clustering keeps its larger
// conservative envelope. A faint pulse is allowed behind the higher label layer.
export function labelMarkerRect(p) {
  const r = rect(p.x, p.y, 48, 44);
  if (p.vehicle.heading == null) return r;
  const angle = p.vehicle.heading * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  for (const [x,y] of [[0,-30],[-3,-24],[3,-24]]) {
    const px = p.x + x*c - y*s, py = p.y + x*s + y*c;
    r.left = Math.min(r.left,px); r.right = Math.max(r.right,px);
    r.top = Math.min(r.top,py); r.bottom = Math.max(r.bottom,py);
  }
  return r;
}
// Camera target only: keep the selected marker and its plate clear of controls.
// Does not change the vehicle's position or the marker/plate offsets.
export function focusTarget(vehicle, safe, bounds, obstacles, label) {
  const center = { x: (safe.left + safe.right) / 2, y: (safe.top + safe.bottom) / 2 };
  const candidates = [center];
  for (let y = safe.top; y <= safe.bottom; y += 24) for (let x = safe.left; x <= safe.right; x += 24) candidates.push({ x, y });
  candidates.sort((a, b) => Math.hypot(a.x-center.x,a.y-center.y) - Math.hypot(b.x-center.x,b.y-center.y));
  return candidates.find(p => {
    const marker = markerRect({ ...p, vehicle }), foot = labelMarkerRect({ ...p, vehicle });
    const plate = rect(p.x, foot.bottom + 5 + label.height / 2, label.width, label.height);
    return inside(marker, bounds) && inside(plate, bounds) && !obstacles.some(o => overlaps(marker, o, 4) || overlaps(plate, o, 4));
  }) || center;
}
export function placeLabels(items, obstacles, bounds, measure, selectedId = "", highlightedId = "", mode = "auto") {
  const occupied = [], output = new Map();
  const rank = (p) => p.id === selectedId ? 0 : p.id === highlightedId ? 1 : p.vehicle.emergency ? 2 : p.vehicle.age > 120 ? 3 : 4;
  const ordered = [...items].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  for (const p of ordered) {
    if (mode === "selected" && p.id !== selectedId) continue;
    const { width, height } = measure(p.vehicle.label);
    const own = labelMarkerRect(p), gap = 5;
    // Never detach a plate from a vehicle clipped by the map viewport.
    if (!inside(own, bounds)) continue;
    // One fixed anchor, even when selection changes label priority.
    const left = p.x - width / 2;
    const candidate = { left, top: own.bottom + gap, right: left + width, bottom: own.bottom + gap + height };
    const valid = inside(candidate, bounds) && !obstacles.some(o => overlaps(candidate,o))
      && !occupied.some(o => overlaps(candidate,o,3)) ? candidate : null;
    if (valid) { occupied.push(valid); output.set(p.id, valid); }
  }
  return output;
}

// Fit Czech vehicle coordinates with one atomic Google camera update. Splitting
// center and zoom through fitBounds can leave the center clamped at the old zoom.
export function fittedCamera(points, width, height, minZoom, padding = 64) {
  if (!points.length) return null;
  const y = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
  const west = Math.min(...points.map(p => p.lng)), east = Math.max(...points.map(p => p.lng));
  const south = Math.min(...points.map(p => y(p.lat))), north = Math.max(...points.map(p => y(p.lat)));
  const zoomX = Math.log2(Math.max(1, width - padding * 2) * 360 / (256 * (east - west)));
  const zoomY = Math.log2(Math.max(1, height - padding * 2) / (256 * (north - south)));
  return {
    center: { lat: (2 * Math.atan(Math.exp((north + south) * Math.PI)) - Math.PI / 2) * 180 / Math.PI, lng: (west + east) / 2 },
    zoom: Math.max(minZoom, Math.min(east === west && north === south ? 16 : 20, zoomX, zoomY)),
    heading: 0, tilt: 0
  };
}
