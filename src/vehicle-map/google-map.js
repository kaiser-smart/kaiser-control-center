import { CZECH_BOUNDARY } from "./czech-boundary.js";
import { clusterPoints, clusterRect, markerRect, overlaps, inside, rect, spreadPoints, placeLabels } from "./spatial.js";
import { markerHTML, markerName, escape } from "./presentation.js";

export const ROAD_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#15232e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#899ca6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#101b24" }, { weight: 2 }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#384951" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#263b43" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#627937" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#324c31" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#bacba5" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#20333d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#09151d" }] }
];

export function createGoogleMap(node, maps, callbacks) {
  // Existing module has no mapId. Raster roadmap supports inline styles; no cloud
  // styling, new provider/key or ignored styles+mapId combination is introduced.
  const map = new maps.Map(node, {
    center: { lat: 49.2, lng: 16.6 }, zoom: 11, heading: 0, tilt: 0,
    renderingType: maps.RenderingType?.RASTER || "RASTER",
    mapTypeId: "roadmap", styles: ROAD_STYLES, clickableIcons: false,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    rotateControl: false, headingInteractionEnabled: false, tiltInteractionEnabled: false,
    zoomControl: false, gestureHandling: "greedy", keyboardShortcuts: true
  });
  let vehicles = [], selectedId = "", highlightedId = "", labelMode = "auto", groupIds = [], spider = false;
  let destroyed = false, initialFit = false, frame = 0, drawn = [], resizeFrame = 0;
  let history = null;
  const polygons = CZECH_BOUNDARY.type === 'MultiPolygon' ? CZECH_BOUNDARY.coordinates : [CZECH_BOUNDARY.coordinates];
  const countryBorder = polygons.flatMap(p => p.map(ring => new maps.Polyline({ map, path: ring.map(([lng,lat]) => ({lat,lng})), strokeColor:'#b4e52b', strokeOpacity:1, strokeWeight:2, clickable:false, zIndex:5 })));

  const elements = new Map(), labels = new Map(), measurements = new Map(), listeners = [];
  const measureNode = document.createElement("span");
  measureNode.className = "vm-label vm-measure";
  node.parentElement.append(measureNode);
  const bounds = () => ({ left: 6, top: 6, right: node.clientWidth - 6, bottom: node.clientHeight - 30 });
  const controls = () => {
    const n = node.getBoundingClientRect();
    return [...node.parentElement.querySelectorAll("[data-vm-obstacle]")].filter((el) => !el.hidden).map((el) => {
      const r = el.getBoundingClientRect(); return { left: r.left - n.left - 4, top: r.top - n.top - 4, right: r.right - n.left + 4, bottom: r.bottom - n.top + 4 };
    });
  };
  class FleetOverlay extends maps.OverlayView {
    onAdd() {
      this.layer = document.createElement("div"); this.layer.className = "vm-overlay";
      this.lines = document.createElementNS("http://www.w3.org/2000/svg", "svg"); this.lines.classList.add("vm-connectors");
      this.layer.append(this.lines); this.getPanes().overlayMouseTarget.append(this.layer);
      maps.OverlayView.preventMapHitsAndGesturesFrom?.(this.layer);
      scheduleLayout();
    }
    draw() { positionNodes(); }
    onRemove() { this.layer?.remove(); }
  }
  const overlay = new FleetOverlay();
  const project = (v) => {
    const p = overlay.getProjection()?.fromLatLngToContainerPixel(new maps.LatLng(v.point.lat, v.point.lng));
    return p ? { id: v.id, vehicle: v, x: p.x, y: p.y } : null;
  };
  function measure(text) {
    const cacheKey = `${getComputedStyle(measureNode).font}:${text}`;
    if (!measurements.has(cacheKey)) { measureNode.textContent = text; const r = measureNode.getBoundingClientRect(); measurements.set(cacheKey, { width: r.width, height: r.height }); }
    return measurements.get(cacheKey);
  }
  function scheduleLayout() { if (!destroyed && !frame) frame = requestAnimationFrame(() => { frame = 0; layout(); }); }
  function positionNodes() {
    if (!overlay.layer || destroyed) return;
    const projection = overlay.getProjection();
    if (!projection) return;
    // Overlay panes move during panning. Anchor our container to their pixel origin.
    const center = map.getCenter(); if (!center) return;
    const div = projection.fromLatLngToDivPixel(center), container = projection.fromLatLngToContainerPixel(center);
    overlay.layer.style.left = `${div.x - container.x}px`; overlay.layer.style.top = `${div.y - container.y}px`;
    overlay.layer.style.width = `${node.clientWidth}px`; overlay.layer.style.height = `${node.clientHeight}px`;
    for (const d of drawn) {
      const points = d.members.map((v) => project(v)).filter(Boolean); if (!points.length) continue;
      const x = points.reduce((sum, p) => sum + p.x, 0) / points.length + (d.offsetX || 0);
      const y = points.reduce((sum, p) => sum + p.y, 0) / points.length + (d.offsetY || 0);
      const el = elements.get(d.id); if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
    }
  }
  function layout() {
    if (destroyed || !overlay.layer || !overlay.getProjection()) return;
    const points = vehicles.filter((v) => v.point).map(project).filter(Boolean);
    if (!initialFit && points.length) { initialFit = true; fitCountry(); }
    const groups = clusterPoints(points), obstacleRects = controls(), visibleBounds = bounds();
    let plans = groups.map((g) => ({ id: g.members.length > 1 ? `group:${g.id}` : g.members[0].id, x: g.x, y: g.y, members: g.members.map((p) => p.vehicle), bounds: g.bounds }));
    const active = points.filter((p) => groupIds.includes(p.id));
    if (spider && active.length && active.length <= 8) {
      // Include a whole colliding component: never leave its count over a spread icon.
      const touching = groups.filter((g) => g.members.some((p) => groupIds.includes(p.id)));
      const members = touching.flatMap((g) => g.members);
      if (members.length <= 8) {
        const memberIds = new Set(members.map((p) => p.id));
        const other = plans.filter((p) => !p.members.some((v) => memberIds.has(v.id)));
        const center = { x: members.reduce((s, p) => s + p.x, 0) / members.length, y: members.reduce((s, p) => s + p.y, 0) / members.length };
        const spread = spreadPoints(members, center, visibleBounds, [...obstacleRects, ...other.map((p) => p.bounds)]);
        if (spread) plans = [...other, ...spread.map((p) => ({ id: p.id, x: p.x, y: p.y, members: [p.vehicle], bounds: markerRect(p), offsetX: p.x - p.anchor.x, offsetY: p.y - p.anchor.y, anchor: p.anchor }))];
      }
    }
    // A selected member is always a vehicle, never an opaque count. Remaining
    // members get a separate count (excluding the selection) linked to their point.
    const selectedGroup = plans.find((p) => p.members.length > 1 && p.members.some((v) => v.id === selectedId));
    if (selectedGroup) {
      const selected = points.find((p) => p.id === selectedId);
      const rest = selectedGroup.members.filter((v) => v.id !== selectedId);
      const blockers = [...obstacleRects, ...plans.filter((p) => p !== selectedGroup).map((p) => p.bounds), markerRect(selected)];
      const candidate = spreadPoints([{ id: "remaining", vehicle: { heading: null }, x: selectedGroup.x, y: selectedGroup.y }], selected, visibleBounds, blockers)?.[0];
      plans = plans.filter((p) => p !== selectedGroup);
      plans.push({ id: selected.id, x: selected.x, y: selected.y, members: [selected.vehicle], bounds: markerRect(selected) });
      if (candidate) {
        const restPoints = rest.map(project);
        const cx = restPoints.reduce((s, p) => s + p.x, 0) / rest.length, cy = restPoints.reduce((s, p) => s + p.y, 0) / rest.length;
        plans.push({ id: `group:remaining:${rest.map((v) => v.id).join("|")}`, x: candidate.x, y: candidate.y, members: rest, forceGroup: true, bounds: clusterRect(candidate.x, candidate.y), offsetX: candidate.x - cx, offsetY: candidate.y - cy, anchor: { x: cx, y: cy } });
      }
      callbacks.onSelectedGroup?.(selectedGroup.members);
    } else callbacks.onSelectedGroup?.([]);
    drawn = plans;
    const ids = new Set(plans.map((p) => p.id));
    for (const [id, el] of elements) if (!ids.has(id)) { el.remove(); elements.delete(id); }
    const labelItems = [], occupied = [...obstacleRects, ...plans.map((p) => p.bounds)];
    overlay.lines.replaceChildren();
    overlay.lines.setAttribute("width", node.clientWidth); overlay.lines.setAttribute("height", node.clientHeight);
    for (const p of plans) {
      const cluster = p.members.length > 1 || p.forceGroup, v = p.members[0];
      let el = elements.get(p.id);
      if (!el) {
        el = document.createElement("button"); el.type = "button"; el.dataset.vmMarker = p.id;
        el.addEventListener("pointerdown", (event) => {
          if (event.button === 0) { event.preventDefault(); el.focus({ preventScroll: true }); }
        });
        el.addEventListener("click", () => {
          const current = drawn.find((d) => d.id === p.id); if (!current) return;
          if (current.members.length > 1 || current.forceGroup) openGroup(current.members); else callbacks.onSelect(current.members[0].id);
        });
        el.addEventListener("mouseenter", () => callbacks.onHighlight(v.id));
        el.addEventListener("mouseleave", () => callbacks.onHighlight(""));
        el.addEventListener("focus", () => callbacks.onHighlight(v.id));
        el.addEventListener("blur", () => callbacks.onHighlight(""));
        elements.set(p.id, el); overlay.layer.append(el);
      }
      const stale = p.members.filter((m) => m.category === "stale").length;
      const html = cluster ? `<b>${p.members.length}</b><span class="vm-cluster-word">vozidel</span>${stale ? '<span class="vm-cluster-clock" aria-hidden="true">◷</span>' : ""}` : markerHTML(v);
      if (el.dataset.htmlSignature !== html) { el.innerHTML = html; el.dataset.htmlSignature = html; }
      el.className = `vm-marker ${cluster ? "vm-cluster" : `vm-marker--${v.category}`} ${!cluster && v.ignition === true && v.movement === "stopped" && v.category !== "stale" ? "vm-marker--ignition" : ""} ${!cluster && v.emergency ? "vm-marker--emergency" : ""} ${!cluster && selectedId === v.id ? "is-selected" : ""} ${p.members.some((m) => m.id === highlightedId) ? "is-highlighted" : ""}`;
      el.setAttribute("aria-label", cluster ? `${p.members.length} vozidel, ${stale} se starou polohou. Otevřít skupinu.` : markerName(v));
      el.setAttribute("aria-pressed", String(!cluster && selectedId === v.id));
      el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
      if (!cluster) labelItems.push({ id: v.id, vehicle: v, x: p.x, y: p.y });
      if (p.anchor) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        for (const [attr, value] of Object.entries({ x1: p.anchor.x, y1: p.anchor.y, x2: p.x, y2: p.y })) line.setAttribute(attr, value);
        overlay.lines.append(line);
      }
    }
    const placements = placeLabels(labelItems, occupied, visibleBounds, measure, selectedId, highlightedId, labelMode);
    for (const [id, el] of labels) if (!placements.has(id)) { el.hidden = true; }
    for (const [id, r] of placements) {
      let el = labels.get(id);
      if (!el) { el = document.createElement("span"); el.className = "vm-label"; labels.set(id, el); overlay.layer.append(el); }
      const v = vehicles.find((item) => item.id === id);
      el.textContent = v.label; el.classList.toggle("is-selected", id === selectedId);
      el.hidden = false; el.style.left = `${r.left}px`; el.style.top = `${r.top}px`;
    }
    for (const [id, el] of labels) if (!vehicles.some((v) => v.id === id)) { el.remove(); labels.delete(id); }
    overlay.layer.classList.remove("is-moving");
    positionNodes();
    const visible = points.filter((p) => p.x >= 0 && p.x <= node.clientWidth && p.y >= 0 && p.y <= node.clientHeight).length;
    callbacks.onViewport(visible, points.length, vehicles.length - points.length, map.getZoom());
  }
  function fitCountry() {
    const b = new maps.LatLngBounds();
    polygons.forEach(p => p.forEach(ring => ring.forEach(([lng,lat]) => b.extend({lat,lng}))));
    // Include authorized outliers without fabricating a position or hiding them.
    vehicles.filter(v => v.point).forEach(v => b.extend(v.point));
    map.fitBounds(b, 36); map.setHeading?.(0); map.setTilt?.(0);
  }
  function fit(items) {
    const valid = items.filter((v) => v.point); if (!valid.length) return;
    const b = new maps.LatLngBounds(); valid.forEach((v) => b.extend(v.point));
    map.fitBounds(b, 64); map.setHeading?.(0); map.setTilt?.(0);
  }
  function openGroup(members) {
    groupIds = members.map((v) => v.id);
    callbacks.onGroup(members);
    const unique = new Set(members.map((v) => `${v.point.lat}:${v.point.lng}`));
    spider = members.length <= 8 && (unique.size === 1 || (map.getZoom() || 0) >= 20);
    if (!spider && unique.size > 1) {
      const before = map.getZoom(); fit(members);
      maps.event.addListenerOnce(map, "idle", () => {
        if (destroyed || !groupIds.length) return;
        const groups = clusterPoints(members.map(project).filter(Boolean));
        if (members.length <= 8 && (map.getZoom() === before || groups.length === 1)) spider = true;
        scheduleLayout();
      });
    }
    scheduleLayout();
  }
  function select(id, force = false) {
    const v = vehicles.find((v) => v.id === id); if (!v?.point) return;
    const p = project(v); if (!p) return;
    const safe = { left: 50, top: 76, right: node.clientWidth - 50, bottom: node.clientHeight - 60 };
    const detail = node.parentElement.querySelector(".vm-panel-detail:not([hidden])");
    if (detail && getComputedStyle(detail).visibility !== "hidden" && detail.getBoundingClientRect().left < node.getBoundingClientRect().right) {
      const n = node.getBoundingClientRect(), r = detail.getBoundingClientRect();
      if (r.width < n.width * .8) safe.right = Math.max(safe.left + 20, r.left - n.left - 40);
      else safe.bottom = Math.max(safe.top + 20, r.top - n.top - 40);
    }
    if (force) {
      map.panTo(v.point);
      map.panBy(node.clientWidth / 2 - (safe.left + safe.right) / 2, node.clientHeight / 2 - (safe.top + safe.bottom) / 2);
    } else {
      const dx = p.x < safe.left ? p.x - safe.left : p.x > safe.right ? p.x - safe.right : 0;
      const dy = p.y < safe.top ? p.y - safe.top : p.y > safe.bottom ? p.y - safe.bottom : 0;
      if (dx || dy) map.panBy(dx, dy);
    }
  }
  listeners.push(maps.event.addListener(map, "idle", scheduleLayout));
  for (const event of ["dragstart", "zoom_changed"]) listeners.push(maps.event.addListener(map, event, () => overlay.layer?.classList.add("is-moving")));
  overlay.setMap(map);
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { maps.event.trigger(map, "resize"); measurements.clear(); scheduleLayout(); });
  }); observer.observe(node);
  return {
    map,
    update(next, state) { vehicles = next; selectedId = state.selectedId; highlightedId = state.highlightedId; labelMode = state.labelMode; scheduleLayout(); },
    // Age-only updates touch accessible names, never marker HTML or layout.
    age(next) {
      const byId = new Map(next.map((v) => [v.id, v]));
      for (const d of drawn) {
        if (d.members.length !== 1 || d.forceGroup) continue;
        const v = byId.get(d.members[0].id), el = elements.get(d.id);
        if (v && el) { const name = markerName(v); if (el.getAttribute("aria-label") !== name) el.setAttribute("aria-label", name); }
      }
    },
    fit, fitCountry, select, openGroup,
    closeGroup() { groupIds = []; spider = false; scheduleLayout(); },
    zoomTo(value) { map.setZoom(Math.max(3, Math.min(20, Number(value)))); },
    zoom(delta) { map.setZoom((map.getZoom() || 11) + delta); },
    setLayer(layer) { map.setMapTypeId(layer === "satellite" ? "hybrid" : "roadmap"); map.setTilt?.(0); map.setHeading?.(0); },
    history(points) {
      history?.setMap(null); history = null;
      if (points.length > 1) history = new maps.Polyline({ map, path: points, strokeColor: "#b4e52b", strokeWeight: 3, clickable: false });
    },
    destroy() { destroyed = true; observer.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame); listeners.forEach((l) => l.remove()); overlay.setMap(null); history?.setMap(null); countryBorder.forEach(line => line.setMap(null)); measureNode.remove(); elements.clear(); labels.clear(); vehicles = []; }
  };
}
