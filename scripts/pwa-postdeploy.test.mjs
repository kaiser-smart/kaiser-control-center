import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyPublished } from "./pwa-postdeploy.mjs";
const png=Buffer.from("synthetic-fixture");
const release={head:"a".repeat(40),version:"1.0.0",assets:{"/icons/test.png":createHash("sha256").update(png).digest("hex")},routes:["/","/nested"]};
const mock=async url=> {
 const path=new URL(url).pathname;
 const headers={"cache-control":"no-cache"};
 if(path.startsWith("/api/")) return new Response('{}',{status:401,headers:{"cache-control":"no-store"}});
 if(path.includes("buildMeta")) return new Response('{"commit": "aaaaaaa", "version": "1.0.0"}');
 if(path.includes(".png")) return new Response(png,{headers:{...headers,"content-type":"image/png"}});
 if(path.includes("manifest")) return Response.json({name:"SMART ODPADY",display:"standalone",scope:"./"},{headers:{...headers,"content-type":"application/manifest+json"}});
 return new Response('<link rel="manifest"><link rel="apple-touch-icon"><script src="src/app.js?v=1.0.0"></script>',{headers});
};
assert.equal((await verifyPublished(release,mock)).status,"passed");
await assert.rejects(()=>verifyPublished({...release,head:"b".repeat(40)},mock));
await assert.rejects(()=>verifyPublished(release,async url=>new URL(url).pathname==="/api/me"?new Response('{}'):mock(url)));
await assert.rejects(()=>verifyPublished({...release,assets:{"/icons/test.png":"wrong"}},mock));
console.log("Postdeploy probes reject stale commits, altered assets and exposed anonymous API.");
