import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { target, loadRelease } from "./pwa-release.mjs";

export async function verifyPublished(release, request = fetch) {
  const get = async path => {
    const url = new URL(path, target.origin);
    url.searchParams.set("pwa-release-check", `${release.head}-${Date.now()}`);
    const response = await request(url, { cache:"no-store", redirect:"follow", signal:AbortSignal.timeout(15000) });
    if (response.url) assert.equal(new URL(response.url).origin, target.origin, "Unexpected redirect origin");
    return response;
  };
  const meta = await get("/src/data/buildMeta.js");
  assert.equal(meta.status,200,"build identity HTTP");
  const text = await meta.text();
  assert.ok(text.includes(`"commit": "${release.head.slice(0,7)}"`),"Wrong published commit");
  assert.ok(text.includes(`"version": "${release.version}"`),"Wrong published version");
  const manifest = await get("/manifest.webmanifest");
  assert.equal(manifest.status,200);
  assert.match(manifest.headers.get("content-type") || "",/application\/manifest\+json/);
  assert.match(manifest.headers.get("cache-control") || "",/no-cache|no-store/);
  const spec = await manifest.json();
  assert.equal(spec.name,"SMART ODPADY"); assert.equal(spec.display,"standalone");
  assert.equal(new URL(spec.scope,target.origin+"/manifest.webmanifest").href,target.origin+"/");
  for (const [path,sha] of Object.entries(release.assets)) {
    const res = await get(path); assert.equal(res.status,200,`Asset ${path}`);
    if (path.endsWith(".png")) assert.match(res.headers.get("content-type") || "",/image\/png/);
    assert.equal(createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex"),sha,`Hash ${path}`);
  }
  for (const path of release.routes) {
    const res=await get(path); assert.equal(res.status,200,`Route ${path}`);
    assert.match(res.headers.get("cache-control") || "",/no-cache|no-store/);
    const html=await res.text();
    assert.ok(html.includes('rel="manifest"'),`Manifest metadata ${path}`);
    assert.ok(html.includes('apple-touch-icon'),`iOS icon metadata ${path}`);
    assert.ok(html.includes(`src/app.js?v=${release.version}`),`Asset revision ${path}`);
  }
  for (const path of ["/api/me","/api/users"]) {
    const res=await get(path); assert.equal(res.status,401,`Anonymous request ${path}`);
    assert.match(res.headers.get("cache-control") || "",/no-store/,`Private API cache ${path}`);
  }
  return { status:"passed", commit:release.head, version:release.version, routes:release.routes.length, assets:Object.keys(release.assets).length, anonymousApi:"401/no-store" };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const release=loadRelease(process.argv[2]);
  console.log(JSON.stringify(await verifyPublished(release),null,2));
}
