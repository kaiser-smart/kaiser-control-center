import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const PROJECT_NAME = "kaiser-control-center-legacy";
const REQUIRED_BRANCH = "main";
const PUBLISH_LOCK_FILE = ".publish-lock";
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

function assertPublishingUnlocked() {
  if (!existsSync(PUBLISH_LOCK_FILE)) {
    return;
  }

  const reason = readFileSync(PUBLISH_LOCK_FILE, "utf8").trim();
  fail([
    `zverejnovani je zamknute souborem ${PUBLISH_LOCK_FILE}.`,
    reason || "Odemknuti vyzaduje novy vyslovny pokyn."
  ].join("\n"));
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
}

assertPublishingUnlocked();
assertCleanWorktree();
const { head } = assertProductionHead();
const version = packageVersion();
const backupDate = buildDate();

runVisible("node", ["scripts/check-syntax.mjs"]);
runVisible("node", ["scripts/collection-route-source-parser.test.mjs"]);
runVisible("node", ["scripts/build.mjs"], {
  env: {
    ...process.env,
    VITE_APP_BRANCH: REQUIRED_BRANCH,
    VITE_APP_COMMIT: head,
    VITE_BACKUP_DATE: backupDate
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
