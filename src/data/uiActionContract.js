const UI_ACTION_STATES = new Set(["idle", "busy", "success", "error"]);

export const UI_ACTION_AUDIT_CASES = Object.freeze([
  Object.freeze({
    id: "collection-routes-vistos-refresh",
    moduleKey: "collection-routes",
    moduleName: "Svozové trasy",
    route: "/trasy-svozu#collection-routes-source-routes",
    actionLabel: "Servisní refresh z Vistosu",
    busyLabel: "Volám Vistos…",
    successLabel: "Obnoveno z Vistosu",
    errorLabel: "Refresh selhal · zkusit znovu",
    functionName: "refreshCollectionRoutesSitesReadOnlySnapshot",
    loadingToken: "collectionRoutesPilotState.kommunalPairingLoading = true;",
    renderToken: "uiActionContractAttributes(collectionRoutesRefreshAction)",
    triggerToken: "await refreshCollectionRoutesSitesReadOnlySnapshot();"
  }),
  Object.freeze({
    id: "system-check-refresh",
    moduleKey: "system-check",
    moduleName: "Kontrola systému",
    route: "/kontrola-systemu",
    actionLabel: "Obnovit stav",
    busyLabel: "Načítám…",
    successLabel: "Stav obnoven",
    errorLabel: "Obnovení selhalo · zkusit znovu",
    functionName: "loadSystemCheckStatus",
    loadingToken: "systemCheckState.loading = true;",
    renderToken: "uiActionContractAttributes(systemCheckRefreshAction)",
    triggerToken: "await loadSystemCheckStatus({ force: true });"
  }),
  Object.freeze({
    id: "self-repair-refresh",
    moduleKey: "self-repair",
    moduleName: "Samoopravy",
    route: "/samoopravy",
    actionLabel: "Obnovit seznam",
    busyLabel: "Načítám…",
    successLabel: "Seznam obnoven",
    errorLabel: "Obnovení selhalo · zkusit znovu",
    functionName: "loadSelfRepairData",
    loadingToken: "selfRepairState.loading = true;",
    renderToken: "uiActionContractAttributes(selfRepairRefreshAction)",
    triggerToken: "await loadSelfRepairData({ force: true });"
  }),
  Object.freeze({
    id: "driver-reports-refresh",
    moduleKey: "driver-reports",
    moduleName: "Hlášení řidičů",
    route: "/hlaseni-ridicu",
    actionLabel: "Obnovit hlášení",
    busyLabel: "Načítám…",
    successLabel: "Hlášení obnovena",
    errorLabel: "Obnovení selhalo · zkusit znovu",
    functionName: "loadDriverReports",
    loadingToken: "driverReportsState.loading = true;",
    renderToken: "uiActionContractAttributes(driverReportsRefreshAction)",
    triggerToken: "await loadDriverReports({ force: true });"
  })
]);

function normalizedState(value) {
  const state = String(value || "").trim().toLowerCase();
  return UI_ACTION_STATES.has(state) ? state : "idle";
}

export function uiActionContractView(options = {}) {
  const busy = options.busy === true;
  const outcome = normalizedState(options.outcome);
  const state = busy ? "busy" : outcome;
  const labels = {
    idle: String(options.idleLabel || "Provést"),
    busy: String(options.busyLabel || "Pracuji…"),
    success: String(options.successLabel || options.idleLabel || "Hotovo"),
    error: String(options.errorLabel || options.idleLabel || "Zkusit znovu")
  };

  return {
    id: String(options.id || "").trim(),
    state,
    label: labels[state],
    busy,
    disabled: busy || options.disabled === true
  };
}

export function uiActionContractAttributes(view = {}) {
  const id = String(view.id || "").replace(/[^a-z0-9_-]/gi, "");
  const state = normalizedState(view.state);
  const busy = view.busy === true;
  return [
    `data-ui-action-contract="${id}"`,
    `data-ui-action-state="${state}"`,
    `aria-busy="${busy ? "true" : "false"}"`,
    'aria-live="polite"',
    view.disabled ? "disabled" : ""
  ].filter(Boolean).join(" ");
}

function functionSource(source, functionName) {
  const start = source.indexOf(`async function ${functionName}(`);
  if (start < 0) return "";
  const candidates = [
    source.indexOf("\nasync function ", start + 1),
    source.indexOf("\nfunction ", start + 1),
    source.indexOf("\nconst ", start + 1)
  ].filter((index) => index > start);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

function actionFinding(action, code, actual) {
  return {
    key: `ui_action_contract:${action.id}:${code}`,
    type: "ui_action_contract",
    route: action.route,
    moduleKey: action.moduleKey,
    moduleName: action.moduleName,
    title: `${action.actionLabel}: chybí viditelná odezva tlačítka`,
    description: `Denní read-only audit našel porušení společného kontraktu asynchronní akce ${action.actionLabel}.`,
    expected: "Tlačítko se před prvním await okamžitě překreslí do busy stavu, zamkne opakovaný klik a po dokončení ukáže výsledek.",
    actual,
    reproductionSteps: `Otevřít ${action.route}, spustit akci ${action.actionLabel} a ověřit okamžitý busy stav, blokaci dvojkliku a čitelný výsledek.`
  };
}

export function auditUiActionContractSources(appSource = "", stylesSource = "") {
  const findings = [];
  for (const action of UI_ACTION_AUDIT_CASES) {
    const source = functionSource(String(appSource || ""), action.functionName);
    if (!source) {
      findings.push(actionFinding(action, "handler_missing", `Handler ${action.functionName} v produkčním app.js chybí.`));
      continue;
    }

    const loadingIndex = source.indexOf(action.loadingToken);
    const firstAwaitIndex = source.indexOf("await ");
    const renderIndex = source.indexOf("render();", Math.max(0, loadingIndex));
    if (
      loadingIndex < 0 ||
      firstAwaitIndex < 0 ||
      renderIndex < 0 ||
      loadingIndex > renderIndex ||
      renderIndex > firstAwaitIndex
    ) {
      findings.push(actionFinding(
        action,
        "busy_render_late",
        `Handler ${action.functionName} nepřekreslí busy stav po nastavení loading a před prvním await.`
      ));
    }

    if (!String(appSource || "").includes(action.renderToken)) {
      findings.push(actionFinding(
        action,
        "contract_attributes_missing",
        `Tlačítko nepoužívá povinné atributy kontraktu (${action.renderToken}).`
      ));
    }
    if (!String(appSource || "").includes(action.triggerToken)) {
      findings.push(actionFinding(
        action,
        "trigger_contract_missing",
        `Klikací handler nepoužívá očekávaný bezpečný vstup (${action.triggerToken}).`
      ));
    }
  }

  const css = String(stylesSource || "");
  if (!css.includes('.ui-action-contract[data-ui-action-state="busy"]')) {
    findings.push(actionFinding(
      UI_ACTION_AUDIT_CASES[0],
      "busy_style_missing",
      "Produkční CSS neobsahuje viditelný busy stav společného kontraktu."
    ));
  }
  if (!css.includes("button:not(:disabled):active")) {
    findings.push(actionFinding(
      UI_ACTION_AUDIT_CASES[0],
      "press_style_missing",
      "Produkční CSS neobsahuje viditelnou odezvu fyzického stisku tlačítka."
    ));
  }

  return findings;
}

export function uiActionAuditHarnessHtml(stylesSource = "") {
  const safeStyles = String(stylesSource || "")
    .replace(/@import[^;]+;/gi, "")
    .replace(/url\([^)]*\)/gi, "none")
    .replace(/<\/style/gi, "<\\/style");
  const casesJson = JSON.stringify(UI_ACTION_AUDIT_CASES).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Izolovaný audit odezvy tlačítek</title>
    <style>${safeStyles}</style>
  </head>
  <body>
    <main class="app-shell module-theme-scope" style="padding:24px">
      <h1>Izolovaný audit odezvy tlačítek</h1>
      <div id="audit-actions"></div>
    </main>
    <script>
      const cases = ${casesJson};
      const root = document.getElementById("audit-actions");
      for (const item of cases) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-link ui-action-contract";
        button.dataset.uiAuditCase = item.id;
        button.dataset.uiActionContract = item.id;
        button.dataset.uiActionState = "idle";
        button.dataset.uiActionCount = "0";
        button.dataset.uiDuplicateBlocked = "0";
        button.setAttribute("aria-busy", "false");
        button.setAttribute("aria-live", "polite");
        button.textContent = item.actionLabel;
        button.addEventListener("click", () => {
          if (button.dataset.uiActionState === "busy") {
            button.dataset.uiDuplicateBlocked = String(Number(button.dataset.uiDuplicateBlocked || 0) + 1);
            return;
          }
          button.dataset.uiActionCount = String(Number(button.dataset.uiActionCount || 0) + 1);
          button.dataset.uiActionState = "busy";
          button.dataset.uiBusyObserved = "true";
          button.setAttribute("aria-busy", "true");
          button.disabled = true;
          button.textContent = item.busyLabel;
          window.setTimeout(() => {
            button.dataset.uiActionState = "success";
            button.setAttribute("aria-busy", "false");
            button.disabled = false;
            button.textContent = item.successLabel;
          }, 3000);
        });
        root.appendChild(button);
      }
    <\/script>
  </body>
</html>`;
}
