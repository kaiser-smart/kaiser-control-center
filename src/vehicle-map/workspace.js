import { reconcile, normalize, filterVehicles, CATEGORIES, SYMBOLS, ageText, gpsTime, statusText, validateSample } from "./model.js";
import { escape, artwork, legendHTML } from "./presentation.js";
import { createGoogleMap } from "./google-map.js";

export function createVehicleWorkspace({ scope, loadMaps, refresh, readHistory, now = () => Date.now(), mapFactory = createGoogleMap }) {
  const root = document.createElement("section");
  root.className = "vm"; root.dataset.trackingOperationalView = "";
  root.innerHTML = `<header class="vm-header"><div><h1>Poloha vozidel</h1><p data-vm-refresh-status role="status">Načítám polohy…</p></div><div class="vm-header-actions"><button type="button" data-vm-refresh>Obnovit</button><button type="button" data-vm-legend>Ikony a stavy</button></div></header>
    <div class="vm-filters" role="group" aria-label="Stav vozidel">${Object.entries(CATEGORIES).map(([key, label]) => `<button type="button" data-vm-filter="${key}" aria-pressed="${key === "all"}">${key !== "all" ? `<span aria-hidden="true">${SYMBOLS[key]}</span> ` : ""}${label} <b>0</b></button>`).join("")}</div>
    <div class="vm-work"><aside class="vm-panel" aria-label="Vozidla"><div class="vm-panel-list"><div class="vm-search"><label for="vm-search">Hledat vozidlo</label><input id="vm-search" type="search" placeholder="Hledat SPZ nebo typ vozidla…" autocomplete="off"></div>
      <div class="vm-list-heading"><strong data-vm-count></strong><button type="button" class="vm-expand" data-vm-expand aria-expanded="false">Rozbalit seznam</button></div><div class="vm-group-heading" hidden><button type="button" data-vm-close-group>Zpět na flotilu</button><span></span></div><div class="vm-list" role="list" aria-label="Seznam vozidel"></div></div>
      <div class="vm-panel-detail" hidden></div></aside>
      <div class="vm-map-shell"><div class="vm-map" aria-label="Mapa vozidel"></div><div class="vm-map-message" role="status">Připravuji mapový podklad…</div>
        <div class="vm-map-tools" data-vm-obstacle><button type="button" class="vm-fit" data-vm-fit>⌖ Celá flotila</button><label><span class="vm-sr">Popisky</span><select data-vm-labels aria-label="Popisky"><option value="auto">Popisky: automaticky</option><option value="selected">Popisky: jen vybrané</option></select></label><label><span class="vm-sr">Mapová vrstva</span><select data-vm-layer aria-label="Mapová vrstva"><option value="road">Mapa</option><option value="satellite">Satelit</option></select></label></div>
        <div class="vm-map-zoom" data-vm-obstacle><button type="button" data-vm-zoom="1" aria-label="Přiblížit">+</button><button type="button" data-vm-zoom="-1" aria-label="Oddálit">−</button></div>
        <div class="vm-viewport" data-vm-obstacle></div></div></div>
    <p class="vm-sr" data-vm-announcement aria-live="polite"></p>
    <dialog class="vm-legend"><button type="button" data-vm-close-legend>Zavřít</button>${legendHTML()}</dialog>`;
  const $ = (selector) => root.querySelector(selector);
  const state = { selectedId: "", highlightedId: "", labelMode: "auto", query: "", category: "all", expanded: false, groupIds: [], listScroll: 0 };
  let records = new Map(), vehicles = [], filtered = [], payloadRef = null, staleAfterSeconds = 1800;
  let map = null, mapLoading = false, destroyed = false, error = "", loading = true, lastSuccess = null;
  let dataSignature = "", detailSignature = "", detailVehicleId = "", historyRequest = 0, resizeFrame = 0, selectedGroup = [];
  let historyState = { open: false, range: "24h", text: "", points: [], vehicleId: "" };
  const rows = new Map();
  const announce = (message) => { $("[data-vm-announcement]").textContent = message; };
  function fit() { map?.fit(filtered); announce(`Celá flotila: ${filtered.filter((v) => v.point).length} poloh odpovídajících filtru.`); }
  function select(id) {
    const v = filtered.find((v) => v.id === id); if (!v) return;
    if (!state.selectedId) state.listScroll = $(".vm-list").scrollTop;
    if (state.selectedId !== id) { historyRequest++; historyState = { ...historyState, open: false, text: "", points: [], vehicleId: "" }; map?.history([]); }
    state.selectedId = id; updatePanel(); updateMap(); map?.select(id);
    $("[data-vm-back]")?.focus({ preventScroll: true }); resize();
  }
  function back() {
    const previous = state.selectedId; state.selectedId = ""; historyRequest++; historyState.open = false; map?.history([]);
    updatePanel(); updateMap(); $(".vm-list").scrollTop = state.listScroll;
    rows.get(previous)?.focus({ preventScroll: true }); resize();
  }
  function closeGroup() { state.groupIds = []; map?.closeGroup(); updatePanel(); updateMap(); }
  function highlight(id) { if (state.highlightedId !== id) { state.highlightedId = id; updateMap(); } }
  function updateMap() { map?.update(filtered, state); }
  function updateStatus() {
    const time = lastSuccess ? new Intl.DateTimeFormat("cs-CZ", { timeStyle: "medium", timeZone: "Europe/Prague" }).format(lastSuccess) : "dosud žádná";
    $("[data-vm-refresh-status]").textContent = error ? `Obnova se nezdařila · poslední úspěšná aktualizace ${time}` : loading ? "Načítám polohy…" : `Obnoveno ${time} · obnova po 60 s`;
    $("[data-vm-refresh]").disabled = loading;
  }
  function rowHTML(v) {
    return `${artwork(v.type)}<span class="vm-row-main"><strong>${escape(v.label)}</strong><span>${escape(v.type.label)}</span><span class="vm-state vm-state--${v.category}">${SYMBOLS[v.category]} ${escape(statusText(v))}</span>${v.previousPoint ? '<span>Poslední známá poloha</span>' : ""}</span><span class="vm-row-meta">${v.speed !== null ? `<span>${v.speed} km/h</span>` : ""}<span data-vm-age="${escape(v.id)}" class="${v.age > 120 ? "vm-old-time" : ""}">${escape(ageText(v))}</span><time data-vm-gps="${escape(v.id)}" datetime="${escape(v.lastGpsAt)}">${escape(gpsTime(v))}</time></span>`;
  }
  function updateRows() {
    const list = $(".vm-list"); const scroll = list.scrollTop; const shown = state.groupIds.length ? filtered.filter((v) => state.groupIds.includes(v.id)) : filtered;
    const ids = new Set(shown.map((v) => v.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    list.querySelector(".vm-empty")?.remove();
    for (const v of shown) {
      let row = rows.get(v.id);
      if (!row) {
        row = document.createElement("button"); row.type = "button"; row.className = "vm-row";
        row.dataset.vmRow = v.id;
        row.addEventListener("click", () => select(v.id));
        row.addEventListener("mouseenter", () => highlight(v.id)); row.addEventListener("mouseleave", () => highlight(""));
        row.addEventListener("focus", () => highlight(v.id)); row.addEventListener("blur", () => highlight(""));
        rows.set(v.id, row);
      }
      const html = rowHTML(v); if (row.innerHTML !== html) row.innerHTML = html;
      row.setAttribute("aria-label", `${v.label}, ${v.type.label}, ${statusText(v)}, ${ageText(v)}, GPS ${gpsTime(v)}`);
      list.append(row);
    }
    if (!shown.length) list.innerHTML = `<p class="vm-empty">${loading ? "Načítám vozidla…" : records.size ? "Žádná vozidla neodpovídají hledání a filtru." : "Nejsou dostupná žádná oprávněná vozidla."}</p>`;
    list.scrollTop = scroll;
    $("[data-vm-count]").textContent = `${shown.length} z ${vehicles.length} vozidel`;
    const heading = $(".vm-group-heading"); heading.hidden = !state.groupIds.length;
    heading.querySelector("span").textContent = `${shown.length} vozidel ve skupině`;
  }
  function detailHTML(v) {
    const field = (label, value) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
    const historical = !v.point || v.previousPoint || v.age > 120;
    return `<header class="vm-detail-head"><button type="button" data-vm-back>Zpět na ${state.groupIds.length ? "skupinu" : "seznam"}</button><span>Detail vozidla</span></header>
      <div class="vm-detail-scroll"><div class="vm-detail-identity">${artwork(v.type, "detail")}<span>${escape(v.type.label)}</span><h2>${escape(v.label)}</h2>${v.name ? `<p>${escape(v.name)}</p>` : ""}</div>
      <p class="vm-detail-state vm-state--${v.category}">${SYMBOLS[v.category]} ${escape(statusText(v))}</p>
      ${v.emergency ? '<p class="vm-emergency">! Hlášená mimořádná událost</p>' : ""}
      ${v.previousPoint ? `<p class="vm-old-time">Poslední známá poloha · ${escape(v.reason)}</p>` : !v.point ? `<p>${escape(v.reason)}</p>` : ""}
      <p class="vm-status-qualifier">${historical ? "Poslední hlášený stav" : "Poslední GPS vzorek"}</p>
      <dl class="vm-detail-fields">${v.speed !== null ? field("Rychlost", `${v.speed} km/h`) : field("Rychlost", "Neověřeno")}
      <div><dt>Poslední GPS</dt><dd class="${v.age > 120 ? "vm-old-time" : ""}"><time datetime="${escape(v.lastGpsAt)}">${escape(gpsTime(v))}</time><span data-vm-age="${escape(v.id)}">${escape(ageText(v))}</span></dd></div>
      ${field("Poloha", v.address || (v.point ? `${v.point.lat.toFixed(6)}, ${v.point.lng.toFixed(6)}` : "Bez ověřené polohy"))}
      ${field("Zapalování", v.ignition === null ? "Neověřeno" : v.ignition ? "Zapnuto" : "Vypnuto")}
      ${field("Řidič právě ve vozidle", "Neověřeno")}${v.assignedDriver ? field("Přiřazený řidič", v.assignedDriver) : ""}</dl>
      <button type="button" class="vm-primary" data-vm-center ${!v.point || !map ? "disabled" : ""}>Zobrazit polohu</button>
      ${selectedGroup.length ? `<button type="button" data-vm-selected-group>Vozidla v této skupině (${selectedGroup.length})</button>` : ""}
      <details class="vm-more"><summary>Další údaje</summary><dl>${field("Jednoznačná identita", v.id)}${v.internal ? field("Interní číslo", v.internal) : ""}${v.odometer !== null ? field("Tachometr", `${v.odometer} km`) : ""}${v.voltage !== null ? field("Napětí", `${v.voltage} V`) : ""}${historical ? field("Historický provozní stav", CATEGORIES[v.movement]) : ""}</dl></details>
      <details class="vm-history" ${historyState.open ? "open" : ""}><summary>Historie trasy</summary><label>Období <select data-vm-history-range><option value="24h" ${historyState.range === "24h" ? "selected" : ""}>24 hodin</option><option value="7d" ${historyState.range === "7d" ? "selected" : ""}>7 dní</option><option value="30d" ${historyState.range === "30d" ? "selected" : ""}>30 dní</option></select></label><button type="button" data-vm-history-load ${!v.historyKey ? "disabled" : ""}>Načíst historii</button><p data-vm-history-status role="status">${escape(historyState.text || "Historie z uložených GPS bodů.")}</p></details></div>`;
  }
  function updatePanel() {
    const v = filtered.find((v) => v.id === state.selectedId);
    $(".vm-panel-list").hidden = !!v; $(".vm-panel-detail").hidden = !v;
    root.classList.toggle("is-detail", !!v); root.classList.toggle("is-expanded", state.expanded);
    $("[data-vm-expand]").textContent = state.expanded ? "Sbalit seznam" : "Rozbalit seznam";
    $("[data-vm-expand]").setAttribute("aria-expanded", String(state.expanded));
    if (v) {
      const signature = JSON.stringify([v, selectedGroup.map((v) => v.id), !!map, state.groupIds.length, historyState]);
      if (signature !== detailSignature) {
        const sameVehicle = detailVehicleId === v.id;
        const oldScroll = sameVehicle ? $(".vm-detail-scroll")?.scrollTop || 0 : 0, moreOpen = sameVehicle && $(".vm-more")?.open;
        $(".vm-panel-detail").innerHTML = detailHTML(v); detailSignature = signature; detailVehicleId = v.id;
        $(".vm-detail-scroll").scrollTop = oldScroll; $(".vm-more").open = !!moreOpen;
      }
    } else { detailSignature = ""; detailVehicleId = ""; updateRows(); }
  }
  function update({ tick = false } = {}) {
    vehicles = normalize(records, { now: now(), staleAfterSeconds });
    const result = filterVehicles(vehicles, state.query, state.category); filtered = result.vehicles;
    if (state.selectedId && !filtered.some((v) => v.id === state.selectedId)) {
      state.selectedId = ""; map?.history([]); historyRequest++;
      announce("Výběr byl zrušen, vozidlo již není v aktuálním filtru nebo oprávněném seznamu.");
    }
    const ids = new Set(filtered.map((v) => v.id)); state.groupIds = state.groupIds.filter((id) => ids.has(id));
    root.querySelectorAll("[data-vm-filter]").forEach((button) => {
      const key = button.dataset.vmFilter; button.querySelector("b").textContent = result.counts[key];
      button.setAttribute("aria-pressed", String(key === state.category));
      button.hidden = key === "unknown" && !result.counts.unknown && state.category !== "unknown";
    });
    const pointCount = filtered.filter((v) => v.point).length;
    $("[data-vm-fit]").disabled = !pointCount || !map;
    $("[data-vm-fit]").title = !pointCount ? "Filtru neodpovídá žádná ověřená poloha" : `Přizpůsobit ${pointCount} polohám podle filtru`;
    const signature = JSON.stringify(filtered.map(({ age, ...v }) => ({ ...v, softAge: age > 120 })));
    if (!tick || signature !== dataSignature) { dataSignature = signature; updatePanel(); updateMap(); }
    else map?.age(filtered);
    // Time text updates never replace marker DOM or trigger collision measurement.
    root.querySelectorAll("[data-vm-age]").forEach((el) => {
      const v = vehicles.find((v) => v.id === el.dataset.vmAge); if (!v) return;
      el.textContent = ageText(v); el.classList.toggle("vm-old-time", v.age > 120);
    });
    updateStatus();
    if (!map) $(".vm-viewport").textContent = `${pointCount} s polohou · bez polohy ${filtered.length - pointCount}`;
  }
  async function ensureMap() {
    if (destroyed || map || mapLoading) return;
    mapLoading = true;
    try {
      const maps = await loadMaps(); if (destroyed) return;
      map = mapFactory($(".vm-map"), maps, {
        onSelect: select, onHighlight: highlight,
        onGroup(members) { state.groupIds = members.map((v) => v.id); state.selectedId = ""; state.expanded = true; updatePanel(); updateMap(); resize(); },
        onSelectedGroup(members) { const changed = members.map((v) => v.id).join() !== selectedGroup.map((v) => v.id).join(); selectedGroup = members; if (changed && state.selectedId) updatePanel(); },
        onViewport(x, y, z) { $(".vm-viewport").textContent = `Ve výřezu ${x} z ${y} s polohou · bez polohy ${z}`; }
      });
      $(".vm-map-message").hidden = true; update();
    } catch { if (!destroyed) $(".vm-map-message").textContent = "Mapový podklad není dostupný. Seznam vozidel zůstává použitelný."; }
    finally { mapLoading = false; }
  }
  async function loadHistory() {
    const v = filtered.find((v) => v.id === state.selectedId); if (!v?.historyKey || !readHistory) return;
    const request = ++historyRequest; historyState.open = true; historyState.text = "Načítám historii…"; updatePanel();
    try {
      const response = await readHistory(v.historyKey, historyState.range);
      if (destroyed || request !== historyRequest || state.selectedId !== v.id) return;
      const points = (Array.isArray(response.points) ? response.points : []).map((p) => ({ ...p, lastGpsAt: p.lastGpsAt || p.recordedAt }))
        .filter((p) => validateSample(p, now()).valid).map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }));
      historyState.points = points; historyState.text = points.length ? `${points.length} uložených GPS bodů` : "Pro toto období nejsou uložené platné GPS body.";
      historyState.vehicleId = v.id; map?.history(points);
    } catch { if (request === historyRequest) historyState.text = "Historii se nepodařilo načíst."; }
    if (!destroyed && request === historyRequest) updatePanel();
  }
  function resize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (!root.isConnected) return;
      const viewport = window.visualViewport, height = viewport?.height || window.innerHeight;
      const keyboard = height < window.innerHeight * .75 && root.contains(document.activeElement);
      root.classList.toggle("has-keyboard", keyboard);
      const top = $(".vm-work").getBoundingClientRect().top - (viewport?.offsetTop || 0);
      root.style.setProperty("--vm-work-height", `${Math.max(keyboard ? 388 : 480, height - top - 10)}px`);
      if (keyboard && document.activeElement === $("#vm-search")) $("#vm-search").scrollIntoView({ block: "nearest" });
    });
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.hasAttribute("data-vm-refresh")) void refresh();
    if (button.hasAttribute("data-vm-filter")) {
      const category = button.dataset.vmFilter; state.category = category === state.category ? "all" : category;
      closeGroup(); update();
    }
    if (button.hasAttribute("data-vm-fit")) fit();
    if (button.hasAttribute("data-vm-back")) back();
    if (button.hasAttribute("data-vm-center")) map?.select(state.selectedId, true);
    if (button.hasAttribute("data-vm-selected-group")) map?.openGroup(selectedGroup);
    if (button.hasAttribute("data-vm-close-group")) closeGroup();
    if (button.hasAttribute("data-vm-expand")) { state.expanded = !state.expanded; updatePanel(); resize(); }
    if (button.hasAttribute("data-vm-zoom")) map?.zoom(Number(button.dataset.vmZoom));
    if (button.hasAttribute("data-vm-legend")) $(".vm-legend").showModal();
    if (button.hasAttribute("data-vm-close-legend")) $(".vm-legend").close();
    if (button.hasAttribute("data-vm-history-load")) void loadHistory();
  });
  root.addEventListener("input", (event) => { if (event.target.id === "vm-search") { state.query = event.target.value; closeGroup(); update(); } });
  root.addEventListener("change", (event) => {
    if (event.target.hasAttribute("data-vm-labels")) { state.labelMode = event.target.value; updateMap(); }
    if (event.target.hasAttribute("data-vm-layer")) map?.setLayer(event.target.value);
    if (event.target.hasAttribute("data-vm-history-range")) historyState.range = event.target.value;
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$(".vm-legend").open) { if (state.selectedId) back(); else if (state.groupIds.length) closeGroup(); else { state.expanded = false; updatePanel(); resize(); } }
  });
  const tickTimer = setInterval(() => { if (root.isConnected && !document.hidden) update({ tick: true }); }, 1000);
  const observer = new ResizeObserver(resize); observer.observe($(".vm-header")); observer.observe($(".vm-filters"));
  window.addEventListener("resize", resize); window.visualViewport?.addEventListener("resize", resize);
  return {
    root, state,
    update(payload, options = {}) {
      loading = !!options.loading; error = options.error || ""; lastSuccess = options.lastSuccess || lastSuccess;
      if (payload && payload !== payloadRef && !error) {
        if (state.selectedId.startsWith("unverified:")) { state.selectedId = ""; announce("Výběr bez ověřené identity byl při obnově zrušen."); }
        records = reconcile(payload, records, { now: now(), scope }); payloadRef = payload;
        staleAfterSeconds = payload.staleAfterSeconds || payload.summary?.staleAfterSeconds || 1800;
        const skewCount = normalize(records, { now: now(), staleAfterSeconds }).filter((v) => v.clockSkew).length;
        if (skewCount) console.info("vehicle_map.clock_skew_tolerated", { count: skewCount });
      }
      update(); resize(); if (options.mapsReady) void ensureMap();
    },
    destroy() { destroyed = true; historyRequest++; clearInterval(tickTimer); observer.disconnect(); window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); cancelAnimationFrame(resizeFrame); map?.destroy(); records.clear(); vehicles = []; filtered = []; payloadRef = null; root.remove(); }
  };
}
