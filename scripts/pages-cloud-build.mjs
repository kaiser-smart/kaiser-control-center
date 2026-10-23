import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Cloudflare publishes dist only after this command succeeds. The existing
// production guard retains every branch, history, regression and metadata gate.
export function buildPagesCloud(env, run) {
  if (env.CF_PAGES !== "1" || !env.CF_PAGES_BRANCH) throw new Error("Cloudflare Pages build context required.");
  if (env.CF_PAGES_BRANCH !== "main") {
    run("npm", ["run", "build"]);
    return "preview";
  }
  const expected = env.CF_PAGES_COMMIT_SHA;
  if (!/^[a-f0-9]{40}$/i.test(expected || "")) throw new Error("Missing exact Pages commit SHA.");
  if (run("git", ["rev-parse", "HEAD"]).trim() !== expected) throw new Error("Pages checkout does not match requested commit.");
  if (run("git", ["status", "--porcelain"]).trim()) throw new Error("Dirty Pages checkout.");
  if (run("git", ["rev-parse", "--is-shallow-repository"]).trim() === "true") run("git", ["fetch", "--unshallow", "origin"]);
  run("git", ["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
  if (run("git", ["rev-parse", "origin/main"]).trim() !== expected) throw new Error("Pages commit is no longer origin/main.");
  run("git", ["checkout", "-B", "main", expected]);
  run("npm", ["run", "deploy:pages:production", "--", "--check-only"]);
  return "production-guard-verified";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const outcome = buildPagesCloud(process.env, (command, args) => {
      const result = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
      if (result) process.stdout.write(result);
      return result;
    });
    console.log("Pages cloud build: " + outcome);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
