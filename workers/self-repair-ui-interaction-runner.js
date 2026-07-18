import { launch } from "@cloudflare/playwright";

import { runSelfRepairDailyUiInteractionScan } from "../functions/_lib/self-repair-ui-interaction-runner.js";
import {
  SELF_REPAIR_UI_SCAN_CRON,
  SELF_REPAIR_UI_SCAN_RUNNER_NAME
} from "../functions/_lib/self-repair-ui-interaction-config.js";
import { uiActionAuditHarnessHtml } from "../src/data/uiActionContract.js";

function cleanString(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function browserFinding(action, code, actual) {
  return {
    key: `ui_action_browser:${action.id}:${code}`,
    type: "ui_action_browser",
    route: action.route,
    moduleKey: action.moduleKey,
    moduleName: action.moduleName,
    title: `${action.actionLabel}: izolovaný klikací test selhal`,
    description: `Denní Browser Run audit našel problém při bezpečné syntetické zkoušce akce ${action.actionLabel}.`,
    expected: "Syntetické tlačítko okamžitě přejde do busy stavu, zamkne dvojklik, nevyvolá síť a po dokončení ukáže úspěch.",
    actual: cleanString(actual, 4000),
    reproductionSteps: `Spustit lokální test kontraktu pro ${action.id}. Neklikat produkční akci.`
  };
}

async function runIsolatedBrowserAudit(env, input = {}) {
  if (!env?.BROWSER) {
    throw new Error("Cloudflare Browser Run binding BROWSER není dostupný.");
  }
  const cases = Array.isArray(input.cases) ? input.cases : [];
  const findings = [];
  const consoleErrors = [];
  const pageErrors = [];
  const browserRequests = [];
  const browser = await launch(env.BROWSER);

  try {
    const context = await browser.newContext({
      javaScriptEnabled: true,
      serviceWorkers: "block"
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(cleanString(message.text(), 1000));
    });
    page.on("pageerror", (error) => pageErrors.push(cleanString(error?.message, 1000)));
    await page.route("**/*", async (route) => {
      browserRequests.push(cleanString(route.request().url(), 500));
      await route.abort("blockedbyclient");
    });

    await page.setContent(uiActionAuditHarnessHtml(input.stylesSource), {
      waitUntil: "domcontentloaded",
      timeout: 15_000
    });

    for (const action of cases) {
      const selector = `[data-ui-audit-case="${action.id}"]`;
      const button = page.locator(selector);
      if (await button.count() !== 1) {
        findings.push(browserFinding(action, "button_missing", "Syntetické tlačítko nebylo jednoznačně vykresleno."));
        continue;
      }

      await button.click({ timeout: 5_000 });
      const busyObserved = await button.getAttribute("data-ui-busy-observed");
      const busyState = await button.getAttribute("data-ui-action-state");
      const ariaBusy = await button.getAttribute("aria-busy");
      const disabled = await button.isDisabled();
      if (busyObserved !== "true" || busyState !== "busy" || ariaBusy !== "true" || !disabled) {
        findings.push(browserFinding(
          action,
          "busy_feedback_missing",
          `Busy stav nebyl okamžitě viditelný (observed=${busyObserved}, state=${busyState}, ariaBusy=${ariaBusy}, disabled=${disabled}).`
        ));
      }

      await button.evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      const duplicateBlocked = Number(await button.getAttribute("data-ui-duplicate-blocked") || 0);
      const actionCount = Number(await button.getAttribute("data-ui-action-count") || 0);
      if (duplicateBlocked !== 1 || actionCount !== 1) {
        findings.push(browserFinding(
          action,
          "duplicate_lock_missing",
          `Opakovaný klik nebyl bezpečně zablokovaný (blocked=${duplicateBlocked}, actionCount=${actionCount}).`
        ));
      }

      await page.waitForFunction(
        (targetSelector) => document.querySelector(targetSelector)?.dataset.uiActionState === "success",
        selector,
        { timeout: 5_000 }
      );
      const finalState = await button.getAttribute("data-ui-action-state");
      const finalAriaBusy = await button.getAttribute("aria-busy");
      const finalDisabled = await button.isDisabled();
      const finalLabel = cleanString(await button.textContent(), 500);
      if (finalState !== "success" || finalAriaBusy !== "false" || finalDisabled || finalLabel !== action.successLabel) {
        findings.push(browserFinding(
          action,
          "result_feedback_missing",
          `Výsledek není čitelný (state=${finalState}, ariaBusy=${finalAriaBusy}, disabled=${finalDisabled}, label=${finalLabel}).`
        ));
      }
    }

    const fallbackAction = cases[0] || {
      id: "ui-action-contract",
      route: "/samoopravy",
      moduleKey: "self-repair",
      moduleName: "Samoopravy",
      actionLabel: "Bezpečný UI kontrakt"
    };
    if (browserRequests.length) {
      findings.push(browserFinding(
        fallbackAction,
        "browser_network_attempt",
        `Izolovaná stránka se pokusila o ${browserRequests.length} síťových požadavků; všechny byly zablokované.`
      ));
    }
    if (consoleErrors.length || pageErrors.length) {
      findings.push(browserFinding(
        fallbackAction,
        "browser_console_error",
        `Konzole: ${consoleErrors.join(" | ") || "bez chyby"}; stránka: ${pageErrors.join(" | ") || "bez chyby"}.`
      ));
    }

    await context.close();
    return {
      actionsChecked: cases.length,
      findings,
      realProductionClicks: false,
      authenticatedSession: false,
      browserNetwork: browserRequests.length ? "attempted-and-blocked" : "blocked-no-attempt"
    };
  } finally {
    await browser.close();
  }
}

export default {
  async scheduled(controller, env, ctx) {
    if (controller.cron !== SELF_REPAIR_UI_SCAN_CRON) {
      console.log("self_repair_ui_scan.skipped_unknown_cron", { cron: controller.cron });
      return;
    }
    ctx.waitUntil(runSelfRepairDailyUiInteractionScan(env, {
      scheduledTime: controller.scheduledTime,
      triggeredBy: "cloudflare-cron",
      browserAudit: (input) => runIsolatedBrowserAudit(env, input)
    }).then((summary) => {
      console.log("self_repair_daily_ui_interaction_scan.completed", {
        status: summary.status,
        runnerRunId: summary.runnerRunId,
        actionsChecked: summary.actionsChecked,
        findingsTotal: summary.findingsTotal,
        newCases: summary.newCases,
        deduplicatedCases: summary.deduplicatedCases,
        realProductionClicks: false,
        authenticatedSession: false,
        browserNetwork: "blocked",
        codexExecuted: false,
        repoWrite: false,
        deploymentStarted: false,
        notificationSent: false
      });
    }));
  },

  async fetch() {
    return Response.json({
      status: "ready",
      runner: SELF_REPAIR_UI_SCAN_RUNNER_NAME,
      cron: SELF_REPAIR_UI_SCAN_CRON,
      mode: "daily-synthetic-ui-interaction-scan",
      manualRun: "disabled",
      productionAssetReads: "GET-only",
      realProductionClicks: "disabled",
      authenticatedSession: "disabled",
      browserNetwork: "blocked",
      codexExecution: "disabled",
      repoWrite: "disabled",
      deployment: "disabled",
      notification: "disabled"
    });
  }
};
