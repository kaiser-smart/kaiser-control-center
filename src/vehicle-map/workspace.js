import { createIconAssignment } from "./icon-assignment.js";
import { fleetStatsHTML, driverHTML, telemetryHTML, vehiclePictureHTML, activityHTML, overviewHTML } from "./dashboard.js";
import { reconcile, normalize, filterVehicles, CATEGORIES, validateSample } from "./model.js";
import { escape, artwork, vehicleArtworkType, artworkFilterHTML, legendHTML, connectionHTML, connectionName, isOnline, stateHTML, markerName, movementText } from "./presentation.js";
import { SmartIcon } from "../components/icons/SmartIcon.js";
import { isMobileViewport, mobileViewportQuery } from "../mobileViewport.js";
import { createGoogleMap } from "./google-map.js";

export function createVehicleWorkspace({ scope, loadMaps, refresh, readHistory, readAnalytics, now = () => Date.now(), mapFactory = createGoogleMap }) {
  const root = document.createElement("section");
  root.className = "vm"; root.dataset.trackingOperationalView = "";
  const filter = (key, label = CATEGORIES[key]) => `<button type="button" data-vm-filter="${key}" aria-pressed="${key === "all"}">${label}<b>0</b></button>`;
  root.innerHTML = `${artworkFilterHTML}<header class="vm-header"><h1>Poloha vozidel</h1>
      <div class="vm-view-switch" role="group" aria-label="Zobrazení polohy vozidel"><button type="button" data-vm-view="map" aria-pressed="true">${SmartIcon("tracking")}Mapa</button><button type="button" data-vm-view="list" aria-pressed="false">${SmartIcon("fleet")}Vozidla</button><button type="button" data-vm-view="dashboard" aria-pressed="false">${SmartIcon("dashboard")}Přehled</button></div>
      <div class="vm-header-actions"><p data-vm-refresh-status role="status">Načítám polohy…</p><button type="button" data-vm-refresh aria-label="Obnovit polohy" title="Obnovit polohy">${SmartIcon("refresh")}</button></div></header>
    <div class="vm-work"><aside class="vm-panel" aria-label="Vozidla"><div class="vm-panel-list">
      <div class="vm-list-heading"><h2>Vozidla <span data-vm-total></span></h2><button type="button" data-vm-assign-icons>Přiřadit ikony</button><button type="button" data-vm-legend aria-label="Ikony a stavy" title="Ikony a stavy">${SmartIcon("info")}</button></div>
      <div class="vm-search">${SmartIcon("search")}<label for="vm-search" class="vm-sr">Hledat vozidlo, SPZ nebo řidiče</label><input id="vm-search" type="search" placeholder="Hledat vozidlo, SPZ nebo řidiče" autocomplete="off"></div>
      <div class="vm-filters" role="group" aria-label="Stav vozidel">${filter("all")}${filter("moving")}${filter("stopped")}${filter("missing", "Bez GPS")}</div>
      <details class="vm-extra-filters"><summary>Další stavy</summary><div class="vm-filters" role="group" aria-label="Další stavy vozidel">${filter("stale", "Offline")}${filter("unknown")}</div></details>
      <div class="vm-group-heading" hidden><button type="button" data-vm-close-group>${SmartIcon("arrow-left")}Celá flotila</button><span></span></div>
      <div class="vm-list" role="group" aria-label="Seznam vozidel"></div>
      <footer class="vm-list-footer"><span data-vm-count></span><div class="vm-pagination mobile-pager"><button type="button" data-vm-page="-1" aria-label="Předchozí vozidla">${SmartIcon("chevron-left")}</button><span data-vm-page-number></span><button type="button" data-vm-page="1" aria-label="Další vozidla">${SmartIcon("chevron-right")}</button></div></footer>
      </div></aside>
      <div class="vm-map-shell"><div class="vm-map" aria-label="Mapa vozidel"></div><div class="vm-map-message" role="status">Připravuji mapový podklad…</div>
        <details class="vm-map-tools" data-vm-obstacle><summary>${SmartIcon("settings")}Mapa</summary><div class="vm-map-options"><button type="button" data-vm-country>Celá Česká republika</button><label>Přiblížení<input type="range" min="5" max="20" value="7" step="1" data-vm-zoom-range aria-label="Přiblížení mapy"></label><label>Podklad<select data-vm-layer aria-label="Mapová vrstva"><option value="road">Mapa</option><option value="satellite">Satelit</option></select></label></div></details>
        <div class="vm-map-zoom" data-vm-obstacle><button type="button" class="vm-fit" data-vm-fit aria-label="Vystředit celou flotilu" title="Celá flotila">${SmartIcon("navigate")}</button><button type="button" data-vm-zoom="1" aria-label="Přiblížit">${SmartIcon("plus")}</button><button type="button" data-vm-zoom="-1" aria-label="Oddálit">${SmartIcon("minus")}</button></div>
        <aside class="vm-insights" aria-label="Provozní přehled"><section class="vm-stats-card" data-vm-stats></section><section class="vm-selection-empty"><header><h2>Stav vozidla</h2></header>${artwork({key:'truck'})}<p>Vyberte vozidlo v seznamu nebo na mapě.</p></section><aside class="vm-panel-detail" aria-label="Detail vozidla" data-vm-obstacle hidden></aside><section class="vm-driver-card" data-vm-driver></section></aside><div class="vm-dashboard-bottom"><section class="vm-activity" data-vm-activity></section><section class="vm-overview" data-vm-overview></section></div>
        </div></div>
    <p class="vm-sr" data-vm-announcement aria-live="polite"></p>
    <dialog class="vm-legend"><button type="button" data-vm-close-legend aria-label="Zavřít legendu">${SmartIcon("close")}</button>${legendHTML()}</dialog>`;
  const $ = (selector) => root.querySelector(selector);
  const state = { selectedId: "", highlightedId: "", labelMode: "auto", query: "", category: "all", view: "map", page: 0, groupIds: [], listScroll: 0 };
  let records = new Map(), vehicles = [], filtered = [], payloadRef = null, staleAfterSeconds = 1800;
  let map = null, mapLoading = false, destroyed = false, error = "", loading = true, lastSuccess = null;
  let detailMobile = null;
  let dataSignature = "", detailSignature = "", detailVehicleId = "", historyRequest = 0, resizeFrame = 0, selectedGroup = [];
  let analytics = null, analyticsError = "", analyticsLoading = false;
  let historyState = { open: false, range: "24h", text: "", points: [], vehicleId: "" };
  const rows = new Map();
  const iconAssignment = createIconAssignment({ root, getVehicles: () => vehicles });
  let openAssignmentsOnLoad = new URLSearchParams(location.search).get("ikony") === "1";
  const announce = (message) => { $("[data-vm-announcement]").textContent = message; };
  function fit() {
    if (state.selectedId) {
      const v = filtered.find(v => v.id === state.selectedId);
      if (!v?.point) return;
      map?.select(v.id); announce(`Vystředěno vozidlo ${v.label}.`);
    } else {
      map?.fit(filtered); announce(`Celá flotila: ${filtered.filter(v => v.point).length} poloh odpovídajících filtru.`);
    }
  }
  function select(id) {
    const v = filtered.find((v) => v.id === id); if (!v) return;
    if (!state.selectedId) state.listScroll = $(".vm-list").scrollTop;
    if (state.selectedId !== id) { historyRequest++; historyState = { ...historyState, open: false, text: "", points: [], vehicleId: "" }; map?.history([]); }
    state.selectedId = id; state.view = "map"; updatePanel(); updateMap(); map?.select(id);
    $("[data-vm-back]")?.focus({ preventScroll: true }); resize();
  }
  function back() {
    const previous = state.selectedId; state.selectedId = ""; historyRequest++; historyState.open = false; map?.history([]);
    updatePanel(); updateMap(); $(".vm-list").scrollTop = state.listScroll;
    (isMobileViewport() ? $('[data-vm-view="list"]') : rows.get(previous))?.focus({ preventScroll: true }); resize();
  }
  function closeGroup() { state.groupIds = []; state.page = 0; map?.closeGroup(); updatePanel(); updateMap(); }
  function highlight(id) { if (state.highlightedId !== id) { state.highlightedId = id; updateMap(); } }
  function updateMap() { map?.update(filtered, state); }
  function updateStatus() {
    const time = lastSuccess ? new Intl.DateTimeFormat("cs-CZ", { timeStyle: "medium", timeZone: "Europe/Prague" }).format(lastSuccess) : "dosud žádná";
    $("[data-vm-refresh-status]").textContent = error ? `Obnova se nezdařila · poslední úspěšná aktualizace ${time}` : loading ? "Načítám polohy…" : `Živá data · ${time}`;
    root.classList.toggle("has-error", !!error);
    $("[data-vm-refresh-status]").title = "Čas načtení dat z API. Dostupnost GPS označuje zelený nebo červený bod. Obnova po 60 s.";
    $("[data-vm-refresh]").disabled = loading;
  }
  function rowHTML(v) {
    return `${artwork(vehicleArtworkType(v))}<span class="vm-row-main"><strong>${escape(v.name || v.label)}</strong><span class="vm-row-identity">${escape(v.name ? v.label : v.type.label)}</span>${stateHTML(v, true)}</span>`;
  }

  function updateRows() {
    const list = $(".vm-list"); const scroll = list.scrollTop; const matching = state.groupIds.length ? filtered.filter((v) => state.groupIds.includes(v.id)) : filtered;
    const mobile = isMobileViewport();
    const pages = Math.max(1, Math.ceil(matching.length / 8)); state.page = Math.min(state.page, pages - 1);
    const shown = mobile ? matching.slice(state.page * 8, state.page * 8 + 8) : matching;
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
      row.setAttribute("aria-label", `${v.name ? v.name + ", " : ""}${markerName(v)}`);
      row.setAttribute("aria-pressed", String(state.selectedId === v.id));
      const index = shown.indexOf(v); if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
    }
    if (!shown.length) list.innerHTML = `<p class="vm-empty">${loading ? "Načítám vozidla…" : records.size ? "Žádná vozidla neodpovídají hledání a filtru." : "Nejsou dostupná žádná oprávněná vozidla."}</p>`;
    list.scrollTop = scroll;
    $("[data-vm-total]").textContent = vehicles.length;
    $("[data-vm-count]").textContent = `${matching.length} z ${vehicles.length} vozidel`;
    $("[data-vm-page-number]").textContent = `${state.page + 1} / ${pages}`;
    $('[data-vm-page="-1"]').disabled = state.page === 0;
    $('[data-vm-page="1"]').disabled = state.page >= pages - 1;
    const heading = $(".vm-group-heading"); heading.hidden = !state.groupIds.length;
    heading.querySelector("span").textContent = `${matching.length} ve skupině`;
  }
  function detailHTML(v) {
    const field = (label, value) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
    const historical = !v.point || v.previousPoint || v.age > 120;
    return `<header class="vm-detail-head"><div class="vm-detail-identity">${vehiclePictureHTML(v)}<div><h2>${escape(v.name || v.label)}</h2><p class="vm-detail-meta">${connectionHTML(v)}<span>${escape(v.name ? `${v.label} · ${v.type.label}` : v.type.label)}</span></p><span class="vm-state">${escape(movementText(v))}</span></div></div><button type="button" data-vm-back aria-label="Zavřít detail vozidla" title="Zavřít detail">${SmartIcon("close")}</button></header>
      <div class="vm-detail-scroll">
      ${v.emergency ? '<p class="vm-emergency">Hlášená mimořádná událost</p>' : ""}
      ${!v.point ? `<p>${escape(v.reason)}</p>` : ""}
      <dl class="vm-detail-metrics">${field("Rychlost", v.speed !== null ? `${v.speed} km/h` : "Neověřeno")}<div class="vm-location-metric"><dt>Poloha</dt><dd>${SmartIcon("tracking")}<span>${escape(v.address || (v.point ? `${v.point.lat.toFixed(6)}, ${v.point.lng.toFixed(6)}` : "Bez ověřené polohy"))}</span></dd></div></dl>
      ${v.assignedDriver ? `<p class="vm-driver">${SmartIcon("users")}<span>Přiřazený řidič: ${escape(v.assignedDriver)}</span></p>` : ""}
      <div class="vm-detail-actions"><button type="button" class="vm-primary" data-vm-history-show ${!v.historyKey ? "disabled" : ""}>${SmartIcon("routes")}Zobrazit trasu</button><button type="button" data-vm-history-toggle aria-expanded="${historyState.open}" ${!v.historyKey ? "disabled" : ""}>${SmartIcon("reports")}Historie jízd</button></div>

      <details class="vm-telemetry-box" ><summary>Obrázek a telemetrie</summary>${telemetryHTML(v)}</details>
      <details class="vm-history" ${historyState.open ? "open" : ""}><summary>Období a GPS body trasy</summary><label>Období <select data-vm-history-range><option value="24h" ${historyState.range === "24h" ? "selected" : ""}>24 hodin</option><option value="7d" ${historyState.range === "7d" ? "selected" : ""}>7 dní</option><option value="today" ${historyState.range === "today" ? "selected" : ""}>Dnes</option></select></label><button type="button" data-vm-history-load ${!v.historyKey ? "disabled" : ""}>Načíst historii</button><p data-vm-history-status role="status">${escape(historyState.text || "Trasa z uložených GPS bodů za zvolené období.")}</p></details>
      <details class="vm-more"><summary>Další údaje a ovládání</summary><div class="vm-detail-secondary"><button type="button" data-vm-center ${!v.point || !map ? "disabled" : ""}>${SmartIcon("navigate")}Vystředit vozidlo</button>${selectedGroup.length ? `<button type="button" data-vm-selected-group>Vozidla ve skupině (${selectedGroup.length})</button>` : ""}</div><dl>${field("Typ", v.type.label)}${field("SPZ", v.plate || "Neověřeno")}${field("Řidič právě ve vozidle", "Neověřeno")}${field("Zapalování", v.ignition === null ? "Neověřeno" : v.ignition ? "Zapnuto" : "Vypnuto")}${v.internal ? field("Interní číslo", v.internal) : ""}${v.odometer !== null ? field("Tachometr", `${v.odometer} km`) : ""}${v.voltage !== null ? field("Napětí", `${v.voltage} V`) : ""}${historical ? field("Historický provozní stav", CATEGORIES[v.movement]) : ""}${field("Jednoznačná identita", v.id)}</dl></details></div>`;
  }

  function updatePanel() {
    const v = filtered.find((v) => v.id === state.selectedId);
    const fitButton = $("[data-vm-fit]"), pointCount = filtered.filter(v => v.point).length;
    fitButton.disabled = !map || (v ? !v.point : !pointCount);
    fitButton.setAttribute("aria-label", v ? "Vystředit vybrané vozidlo" : "Vystředit celou flotilu");
    fitButton.title = v ? (v.point ? `Vystředit ${v.label}` : "Vybrané vozidlo nemá ověřenou polohu")
      : pointCount ? `Přizpůsobit ${pointCount} polohám podle filtru` : "Filtru neodpovídá žádná ověřená poloha";
    $(".vm-panel-detail").hidden = !v;
    $(".vm-selection-empty").hidden = !!v;
    $("[data-vm-driver]").innerHTML = driverHTML(v);
    root.dataset.view = state.view;
    root.querySelectorAll("[data-vm-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.vmView === state.view)));
    updateRows();
    root.classList.toggle("is-detail", !!v);
    if (v) {
      const signature = JSON.stringify([v, selectedGroup.map((v) => v.id), !!map, state.groupIds.length, historyState, isMobileViewport()]);
      if (signature !== detailSignature) {
        const sameVehicle = detailVehicleId === v.id;
        const oldScroll = sameVehicle ? $(".vm-detail-scroll")?.scrollTop || 0 : 0, moreOpen = sameVehicle && $(".vm-more")?.open, telemetryOpen = sameVehicle && detailMobile === isMobileViewport() ? $(".vm-telemetry-box")?.open : false;
        const active = document.activeElement;
        const focusAttribute = sameVehicle && $(".vm-panel-detail").contains(active)
          ? Array.from(active.attributes).find((attribute) => attribute.name.startsWith("data-vm-"))?.name : null;
        $(".vm-panel-detail").innerHTML = detailHTML(v); detailSignature = signature; detailVehicleId = v.id; detailMobile = isMobileViewport();
        $(".vm-more").open = !!moreOpen; $(".vm-telemetry-box").open = !!telemetryOpen; $(".vm-detail-scroll").scrollTop = oldScroll;
        if (focusAttribute) $(`.vm-panel-detail [${focusAttribute}]`)?.focus({ preventScroll: true });
      }
    } else { detailSignature = ""; detailVehicleId = ""; }
  }
  function update({ tick = false } = {}) {
    vehicles = normalize(records, { now: now(), staleAfterSeconds });
    const result = filterVehicles(vehicles, state.query, state.category === "stale" ? "all" : state.category);
    // Keep the internal filter key, but Offline includes every red dot.
    result.counts.stale = filterVehicles(vehicles, state.query).vehicles.filter(v => !isOnline(v)).length;
    filtered = state.category === "stale" ? result.vehicles.filter(v => !isOnline(v)) : result.vehicles;
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
    const signature = JSON.stringify(filtered.map(({ age, ...v }) => ({ ...v, softAge: age > 120 })));
    if (!tick || signature !== dataSignature) { dataSignature = signature; updatePanel(); updateMap(); }
    else map?.age(filtered);
    // Availability dots update without repainting vehicle images or map geometry.
    const byId = new Map(vehicles.map(v => [v.id, v]));
    root.querySelectorAll("[data-vm-connection]").forEach(el => {
      const v = byId.get(el.dataset.vmConnection); if (!v) return;
      el.classList.toggle("vm-online", isOnline(v)); el.classList.toggle("vm-offline", !isOnline(v));
      el.setAttribute("aria-label", connectionName(v)); el.title = connectionName(v);
    });
    updateStatus();
    if (!tick) { iconAssignment.update(); if (openAssignmentsOnLoad && vehicles.length) { openAssignmentsOnLoad = false; iconAssignment.open(); } }
    $("[data-vm-stats]").innerHTML = fleetStatsHTML(vehicles, analytics, analyticsError);
    if (!tick) {
      $("[data-vm-activity]").innerHTML = activityHTML(vehicles);
      $("[data-vm-overview]").innerHTML = overviewHTML(filtered);
    }
  }
  async function ensureMap() {
    if (destroyed || map || mapLoading) return;
    mapLoading = true;
    try {
      const maps = await loadMaps(); if (destroyed) return;
      map = mapFactory($(".vm-map"), maps, {
        onSelect: select, onHighlight: highlight,
        onGroup(members) { state.groupIds = members.map((v) => v.id); state.selectedId = ""; state.view = "list"; state.page = 0; updatePanel(); updateMap(); resize(); },
        onSelectedGroup(members) { const changed = members.map((v) => v.id).join() !== selectedGroup.map((v) => v.id).join(); selectedGroup = members; if (changed && state.selectedId) updatePanel(); },
        onViewport(x, y, z, zoom) { if (Number.isFinite(zoom) && document.activeElement !== $("[data-vm-zoom-range]")) $("[data-vm-zoom-range]").value = zoom; }
      });
      $(".vm-map-message").hidden = true; update();
    } catch { if (!destroyed) $(".vm-map-message").textContent = "Mapový podklad není dostupný. Seznam vozidel zůstává použitelný."; }
    finally { mapLoading = false; }
  }
  async function loadAnalytics() {
    if (!readAnalytics || analyticsLoading || destroyed) return;
    analyticsLoading = true;
    try { const response = await readAnalytics(); if (!destroyed) { analytics = response; analyticsError = ""; } }
    catch { if (!destroyed) { analytics = null; analyticsError = "Denní analytiku se nepodařilo načíst."; } }
    finally { analyticsLoading = false; if (!destroyed) $("[data-vm-stats]").innerHTML = fleetStatsHTML(vehicles, analytics, analyticsError); }
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
      const viewport = window.visualViewport;
      if (viewport && Math.abs(viewport.scale - 1) > .05) return;
      const height = viewport?.height || window.innerHeight;
      const keyboard = window.innerHeight - height > 120 && root.contains(document.activeElement);
      root.classList.toggle("has-keyboard", keyboard);
      const top = $(".vm-work").getBoundingClientRect().top - (viewport?.offsetTop || 0);
      const nav = document.querySelector(".mobile-bottom-nav");
      const navHeight = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().height : 0;
      root.style.setProperty("--vm-work-height", `${Math.max(120, height - top - navHeight - 2)}px`);
      if (keyboard && document.activeElement === $("#vm-search")) $("#vm-search").scrollIntoView({ block: "nearest" });

    });
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.hasAttribute("data-vm-refresh")) { void refresh(); void loadAnalytics(); }
    if (button.hasAttribute("data-vm-select")) select(button.dataset.vmSelect);
    if (button.hasAttribute("data-vm-filter")) {
      const category = button.dataset.vmFilter; state.category = category === state.category ? "all" : category;
      closeGroup(); update();
    }
    if (button.hasAttribute("data-vm-fit")) fit();
    if (button.hasAttribute("data-vm-country")) map?.fitCountry();
    if (button.hasAttribute("data-vm-back")) back();
    if (button.hasAttribute("data-vm-center")) map?.select(state.selectedId, true);
    if (button.hasAttribute("data-vm-selected-group")) map?.openGroup(selectedGroup);
    if (button.hasAttribute("data-vm-close-group")) closeGroup();
    if (button.hasAttribute("data-vm-view")) { state.view = button.dataset.vmView; document.activeElement?.blur(); updatePanel(); resize(); }
    if (button.hasAttribute("data-vm-page")) { state.page = Math.max(0, state.page + Number(button.dataset.vmPage)); updateRows(); $(".vm-list").scrollTop = 0; }
    if (button.hasAttribute("data-vm-history-show")) void loadHistory();
    if (button.hasAttribute("data-vm-history-toggle")) { historyState.open = !historyState.open; updatePanel(); }
    if (button.hasAttribute("data-vm-zoom")) map?.zoom(Number(button.dataset.vmZoom));
    if (button.hasAttribute("data-vm-assign-icons")) iconAssignment.open(state.selectedId);
    if (button.hasAttribute("data-vm-legend")) $(".vm-legend").showModal();
    if (button.hasAttribute("data-vm-close-legend")) $(".vm-legend").close();
    if (button.hasAttribute("data-vm-history-load")) void loadHistory();
  });
  root.addEventListener("input", (event) => { if (event.target.hasAttribute("data-vm-zoom-range")) map?.zoomTo(event.target.value); if (event.target.id === "vm-search") { state.query = event.target.value; closeGroup(); update(); } });
  root.addEventListener("change", (event) => {
    if (event.target.hasAttribute("data-vm-layer")) map?.setLayer(event.target.value);
    if (event.target.hasAttribute("data-vm-history-range")) historyState.range = event.target.value;
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$(".vm-legend").open) { if (state.selectedId) back(); else if (state.groupIds.length) closeGroup(); else { state.view = "map"; updatePanel(); resize(); } }
  });
  root.addEventListener("toggle", (event) => {
    if (event.target.matches(".vm-history")) historyState.open = event.target.open;
    if (event.target.matches("details")) updateMap();
  }, true);
  const onViewportChange = () => { updatePanel(); resize(); };
  const mobileQuery = matchMedia(mobileViewportQuery); mobileQuery.addEventListener("change", onViewportChange);
  const tickTimer = setInterval(() => { if (root.isConnected && !document.hidden) update({ tick: true }); }, 1000);
  void loadAnalytics();
  const observer = new ResizeObserver(resize); observer.observe($(".vm-header")); observer.observe(root);
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
    destroy() { iconAssignment.destroy(); destroyed = true; historyRequest++; clearInterval(tickTimer); observer.disconnect(); mobileQuery.removeEventListener("change", onViewportChange); window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); cancelAnimationFrame(resizeFrame); map?.destroy(); records.clear(); vehicles = []; filtered = []; payloadRef = null; root.remove(); }
  };
}
