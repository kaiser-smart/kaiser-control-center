import assert from 'node:assert/strict';
import { onRequestGet as serve } from '../functions/zamestnanci/[[path]].js';
import { onRequestGet as redirect } from '../functions/dovolena-nemoc/zamestnanci/[[path]].js';
for(const suffix of ['', '/', '/employee-1', '/employee-1?from=bookmark']) {
  const old = new Request(`https://example.test/dovolena-nemoc/zamestnanci${suffix}`);
  const moved = redirect({request:old});
  assert.equal(moved.status,302);
  assert.equal(moved.headers.get('Location'),`https://example.test/zamestnanci${suffix}`);
  assert.equal(moved.headers.get('Cache-Control'),'no-store');
  let requestedAsset;
  const shell = await serve({request:new Request(moved.headers.get('Location')),env:{ASSETS:{fetch:async url=>{requestedAsset=url.href;return new Response('<main>app shell</main>',{headers:{'Content-Type':'text/html'}});}}}});
  assert.equal(requestedAsset,'https://example.test/index.html');
  assert.equal(shell.status,200);
  assert.equal(await shell.text(),'<main>app shell</main>');
}
console.log('Employee direct links and legacy redirects passed.');
