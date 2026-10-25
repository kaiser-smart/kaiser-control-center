import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(await readFile(path.join(dist, "manifest.webmanifest"), "utf8"));
assert.equal(manifest.name, "SMART ODPADY");
assert.equal(manifest.short_name, "SMART ODPADY");
assert.equal(manifest.display, "standalone");

// Resolve the installed identity and every icon on both supported hosting bases.
for (const base of ["https://smart-odpady.ai/", "https://example.github.io/kaiser-control-center/"]) {
  const manifestUrl = new URL("manifest.webmanifest", base);
  for (const key of ["id", "start_url", "scope"]) {
    assert.equal(new URL(manifest[key], manifestUrl).href, base, key);
  }
  for (const icon of manifest.icons) {
    assert.ok(new URL(icon.src, manifestUrl).href.startsWith(base));
  }
}

for (const [filename, size] of [
  ["icons/apple-touch-icon.png", 180],
  ["icons/icon-192.png", 192],
  ["icons/icon-512.png", 512]
]) {
  const png = await readFile(path.join(dist, filename));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
  assert.equal(png[25], 2, "Icon must be opaque RGB, not transparent RGBA");
}

const routes = JSON.parse(await readFile(path.join(dist, "route-manifest.json"), "utf8")).routes;
for (const route of [...routes, { path: "/404.html" }]) {
  const filename = route.path === "/404.html" ? "404.html" : path.join(route.path.slice(1), "index.html");
  const html = await readFile(path.join(dist, filename), "utf8");
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon\.png"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="SMART ODPADY"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="default"/);
  assert.ok(html.indexOf("<base href=") < html.indexOf('rel="manifest"'));
  assert.match(html, /src="src\/app\.js\?v=[^"]+"/);
  assert.match(html, /href="src\/styles\.css\?v=[^"]+"/);
}
const headers = await readFile(path.join(dist, "_headers"), "utf8");
assert.match(headers, /\/\*\n  Cache-Control: no-cache/);
assert.match(headers, /\/manifest\.webmanifest\n  Content-Type: application\/manifest\+json/);

async function checkNoOfflineCache(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) await checkNoOfflineCache(filename);
    else if (/\.(?:js|html)$/.test(item.name)) {
      assert.doesNotMatch(await readFile(filename, "utf8"), /serviceWorker\s*\.\s*register\s*\(|caches\s*\.\s*open\s*\(/, filename);
    }
  }
}
await checkNoOfflineCache(dist);
console.log(`PWA contract passed: ${routes.length} routes + 404, same-origin identity, 3 opaque PNGs, metadata, revalidation and no offline cache.`);
