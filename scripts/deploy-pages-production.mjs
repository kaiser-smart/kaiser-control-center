import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT_NAME = "kaiser-control-center-legacy";
const REQUIRED_BRANCH = "main";
const DATA_BOX_PLUS_TRIAGE_PREVIEW = "true";
const PROTECTED_COMMITS = [
  {
    sha: "16074246",
    label: "Trasy svozu: automaticky read-only Vistos snapshot"
  },
  {
    sha: "322469e3",
    label: "Trasy svozu: ochrana posledniho platneho snapshotu"
  },
  {
    sha: "1c309113",
    label: "Trasy svozu: internal Pages runner pres token"
  }
];

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check-only");
const skipFetch = args.has("--skip-fetch");

function run(command, args = [], options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    env: options.env || process.env
  }).trim();
}

function runVisible(command, args = [], options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    env: options.env || process.env
  });
}

function fail(message) {
  console.error(`\nDEPLOY ZASTAVEN: ${message}`);
  process.exit(1);
}

function git(args, options = {}) {
  return run("git", args, options);
}

function assertCleanWorktree() {
  const status = git(["status", "--porcelain"]);
  if (status) {
    fail([
      "repo neni ciste pred produkcnim deployem.",
      "Nejdriv commitni nebo odloz rozpracovane zmeny mimo tento deploy.",
      status
    ].join("\n"));
  }
}

function assertProductionHead() {
  if (!skipFetch) {
    runVisible("git", ["fetch", "origin", REQUIRED_BRANCH]);
  }

  const head = git(["rev-parse", "HEAD"]);
  const originMain = git(["rev-parse", `origin/${REQUIRED_BRANCH}`]);
  const branch = git(["branch", "--show-current"]);

  if (branch !== REQUIRED_BRANCH) {
    fail(`produkce se smi nasazovat jen z vetve ${REQUIRED_BRANCH}; aktualni vetev je ${branch || "detached HEAD"}.`);
  }

  if (head !== originMain) {
    fail([
      `HEAD musi presne odpovidat origin/${REQUIRED_BRANCH}.`,
      `HEAD: ${head}`,
      `origin/${REQUIRED_BRANCH}: ${originMain}`
    ].join("\n"));
  }

  for (const protectedCommit of PROTECTED_COMMITS) {
    try {
      git(["merge-base", "--is-ancestor", protectedCommit.sha, "HEAD"]);
    } catch {
      fail(`nasazovany commit neobsahuje chraneny commit ${protectedCommit.sha} (${protectedCommit.label}).`);
    }
  }

  return { head };
}

function buildDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function packageVersion() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  return pkg.version;
}

function assertBuiltMeta(head, version) {
  const metaSource = readFileSync("dist/src/data/buildMeta.js", "utf8");
  const routeHtml = readFileSync("dist/trasy-svozu/index.html", "utf8");
  const appSource = readFileSync("dist/src/app.js", "utf8");
  const versionNewsSource = readFileSync("dist/src/components/VersionNewsInfo.js", "utf8");
  const versionInfoSource = readFileSync("dist/src/data/versionInfo.js", "utf8");
  const runtimeConfigSource = readFileSync("dist/src/data/runtimeConfig.js", "utf8");
  const shortHead = head.slice(0, 7);

  if (!metaSource.includes(`"version": "${version}"`)) {
    fail(`buildMeta nema verzi ${version}.`);
  }
  if (!metaSource.includes('"branch": "main"')) {
    fail("buildMeta nema branch main.");
  }
  if (!metaSource.includes(`"commit": "${shortHead}"`)) {
    fail(`buildMeta nema commit ${shortHead}.`);
  }
  if (!routeHtml.includes(`src/app.js?v=${version}`) || !routeHtml.includes(`src/styles.css?v=${version}`)) {
    fail(`HTML /trasy-svozu nema asset cache-buster ${version}.`);
  }
  if (!appSource.includes(`./components/VersionNewsInfo.js?v=${version}`)) {
    fail(`app.js nema vnoreny cache-buster ${version} pro novinky.`);
  }
  if (!versionNewsSource.includes(`../data/versionInfo.js?v=${version}`)) {
    fail(`VersionNewsInfo.js nema vnoreny cache-buster ${version}.`);
  }
  if (!versionInfoSource.includes(`./buildMeta.js?v=${version}`)) {
    fail(`versionInfo.js nema vnoreny cache-buster ${version} pro buildMeta.`);
  }
  if (!runtimeConfigSource.includes('"dataBoxPlusTriagePreview": true')) {
    fail("produkční runtime nemá zapnutý interní read-only pilot Datových schránek Plus.");
  }
}

assertCleanWorktree();
const { head } = assertProductionHead();
const version = packageVersion();
const backupDate = buildDate();

runVisible("node", ["scripts/check-syntax.mjs"]);
runVisible("node", ["scripts/version-module-imports.test.mjs"]);
runVisible("node", ["scripts/sarlota-mandatory-reading.test.mjs"]);
runVisible("node", ["scripts/collection-route-source-parser.test.mjs"]);
runVisible("node", ["scripts/collection-daily-routes.test.mjs"]);
runVisible("node", ["scripts/collection-routes-admin-tablet-test.test.mjs"]);
runVisible("node", ["scripts/collection-daily-routes-scale.test.mjs"]);
runVisible("node", ["scripts/collection-routes-test-data.test.mjs"]);
runVisible("node", ["scripts/collection-routes-test-store.test.mjs"]);
runVisible("node", ["scripts/collection-routes-readonly-calculator.test.mjs"]);
runVisible("node", ["scripts/collection-routes-here-map-image.test.mjs"]);
runVisible("node", ["scripts/collection-routes-test-incidents.test.mjs"]);
runVisible("node", ["scripts/collection-routes-incident-reminder-runner.test.mjs"]);
runVisible("node", ["scripts/collection-routes-test-ui.test.mjs"]);
runVisible("node", ["scripts/elevenlabs-signed-url-options.test.mjs"]);
runVisible("node", ["scripts/sarlota-collection-route-gps.test.mjs"]);
runVisible("node", ["scripts/collection-routes-sarlota-context.test.mjs"]);
runVisible("node", ["scripts/sarlota-tools-sync-plan.test.mjs"]);
runVisible("node", ["scripts/sarlota-prompt-sync-plan.test.mjs"]);
runVisible("node", ["scripts/sarlota-voice-smoke.test.mjs"]);
runVisible("node", ["scripts/customer-messaging.test.mjs"]);
runVisible("node", ["scripts/rcs-consent.test.mjs"]);
runVisible("node", ["scripts/data-box-plus-triage.test.mjs"]);
runVisible("node", ["scripts/data-box-plus-triage-ui.test.mjs"]);
runVisible("node", ["scripts/build.mjs"], {
  env: {
    ...process.env,
    VITE_APP_BRANCH: REQUIRED_BRANCH,
    VITE_APP_COMMIT: head,
    VITE_BACKUP_DATE: backupDate,
    DATA_BOX_PLUS_TRIAGE_PREVIEW
  }
});
assertBuiltMeta(head, version);

if (checkOnly) {
  console.log(`Deploy guard OK: ${version} / ${REQUIRED_BRANCH} / ${head.slice(0, 7)} / ${backupDate}`);
  process.exit(0);
}

runVisible("pnpm", [
  "dlx",
  "wrangler",
  "pages",
  "deploy",
  "dist",
  "--project-name",
  PROJECT_NAME,
  "--branch",
  REQUIRED_BRANCH,
  "--commit-dirty=true"
]);

console.log(`Produkce nasazena pres deploy guard: ${version} / ${REQUIRED_BRANCH} / ${head.slice(0, 7)} / ${backupDate}`);
