import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { startPreview } from '../vehicle-map/preview-server.mjs';
import { evaluateDay, CATEGORIES } from '../../functions/_lib/driver-rating-engine.js';
import { fixture, NOW } from './fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const engine = process.env.VEHICLE_MAP_BROWSER || 'chromium';
const output = `../outputs/driver-ratings/${engine}`;
await mkdir(output, { recursive: true });
const { server, url } = await startPreview(0);
const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ headless: true, channel: 'chrome' }));
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage(); page.setDefaultTimeout(8000);
const errors = [], results = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('https://**/*', r => r.abort());
let mode = 'waiting', own = false;
const evaluated = evaluateDay(fixture(), { now: NOW });
function response(period) {
  return { day: period === 'yesterday' ? '2026-10-26' : '2026-10-27', category: 'all', categories: CATEGORIES, mode: mode === 'shadow' ? 'shadow' : 'live', scope: own ? 'own' : 'audit', status: mode === 'scored' ? 'provisional' : 'waiting', lastCalculatedAt: mode === 'scored' ? fixture().asOf : null, lastSynchronizedAt: mode === 'scored' ? fixture().asOf : null, reasons: mode === 'shadow' ? ['shadow'] : mode === 'waiting' ? ['assignment'] : [], ranking: mode === 'scored' && !own ? evaluated.ranking : [], drivers: mode === 'scored' ? evaluated.results.map(d => ({ ...d, revision: 1 })) : [] };
}
await page.route('**/api/vehicle-tracking/driver-ratings?*', r => mode === 'error' ? r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Testovací výpadek' }) }) : r.fulfill({ contentType: 'application/json', body: JSON.stringify(response(new URL(r.request().url()).searchParams.get('period'))) }));
// Canonical vehicle identity is supplied explicitly, never matched using a name or a plate.
await page.route('**/api/vehicle-tracking/status', async r => { const answer = await r.fetch(); const body = await answer.json(); if (body.vehicles?.[0]) { body.vehicles[0].vehicleId = 'test-vehicle'; for (const l of body.locations || []) if (l.externalVehicleId === body.vehicles[0].externalVehicleId) { l.vehicleId = 'test-vehicle'; l.vehicle.vehicleId = 'test-vehicle'; } } await r.fulfill({ response: answer, json: body }); });
const test = async (name, run) => { await run(); results.push({ name, status: 'passed' }); console.log('PASS', name); };
const ready = async () => { await page.goto(`${url}/sledovani-vozidel`); await page.waitForSelector('[data-vm-row]', { state: 'attached' }); await page.waitForSelector('[data-dr-open]', { state: 'attached' }); };
const shot = name => page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
try {
  await ready();
  await test('No evidence shows no score or invented winner', async () => { assert.match(await page.locator('[data-vm-driver]').innerText(), /Čeká na data/); assert.equal(await page.locator('[data-vm-driver] progress').count(), 0); });
  await shot('desktop-waiting');
  await test('Desktop drawer, keyboard close and unchanged map instance', async () => {
    await page.evaluate(() => window.savedRatingMap = google.maps._instances.at(-1));
    await page.locator('[data-dr-open]').click(); await page.waitForSelector('.dr-content');
    assert.equal(Math.round((await page.locator('.dr-drawer').boundingBox()).width), 440);
    assert.match(await page.locator('.dr-content').innerText(), /nejsou k dispozici/);
    await shot('desktop-waiting-detail'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.dr-drawer').isVisible(), false);
    assert.equal(await page.evaluate(() => savedRatingMap === google.maps._instances.at(-1)), true);
  });
  mode = 'scored'; await ready();
  await test('Scored card is compact and independent of the selected map vehicle', async () => {
    await page.waitForSelector('[data-vm-driver] progress');
    assert.match(await page.locator('[data-vm-driver]').innerText(), /100 \/ 100/);
    const before = await page.locator('[data-vm-driver]').innerText();
    await page.locator('[data-vm-row]').last().click(); assert.equal(await page.locator('[data-vm-driver]').innerText(), before);
    const box = await page.locator('[data-vm-driver]').boundingBox(); assert(box.height <= 250, `Card height ${box.height}`);
    await shot('desktop-scored');
  });
  await test('Top 5, calculation detail, day and category controls', async () => {
    await page.locator('[data-dr-open]').click(); await page.waitForSelector('[data-dr-driver]');
    await page.locator('[data-dr-period="yesterday"]').click(); await page.waitForSelector('[data-dr-driver]');
    await page.locator('[data-dr-category]').selectOption('tanker'); await page.waitForSelector('[data-dr-driver]');
    await page.locator('[data-dr-driver]').first().click(); assert.match(await page.locator('.dr-content').innerText(), /Normovaná práce/);
    assert.match(await page.locator('.dr-content').innerText(), /Rozpis bodů/); await shot('desktop-driver-detail');
    await page.locator('[data-dr-vehicle]').click(); assert.equal(await page.locator('.dr-drawer').isVisible(), false);
    assert.equal(await page.locator('[data-vm-row$=":vehicle:test-vehicle"]').getAttribute('aria-pressed'), 'true');
  });
  await page.setViewportSize({ width: 390, height: 844 }); await ready();
  await page.locator('[data-vm-view="dashboard"]').click();
  await shot('mobile-scored');
  await test('Mobile fullscreen drawer, long names, >=44px targets and no horizontal scroll', async () => {
    await page.locator('[data-dr-open]').click(); await page.waitForSelector('[data-dr-driver]');
    const box = await page.locator('.dr-drawer').boundingBox(); assert.equal(Math.round(box.width), 390); assert.equal(Math.round(box.height), 844);
    assert.equal(await page.locator('.dr-drawer').evaluate(e => e.scrollWidth <= e.clientWidth), true);
    const targets = await page.locator('.dr-drawer button,.dr-drawer select').evaluateAll(es => es.map(e => ({ tag: e.tagName, text: e.textContent, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })));
    await shot('mobile-ranking'); assert(targets.every(b => b.height >= 44 && b.width >= 44), JSON.stringify(targets));
    await page.locator('[data-dr-driver]').first().click(); await shot('mobile-driver-detail');
    await page.locator('[data-dr-close]').click(); assert.equal(await page.locator('.dr-drawer').isVisible(), false);
  });
  mode = 'shadow'; await ready(); await page.locator('[data-vm-view="dashboard"]').click();
  await test('Shadow mode never leaks test scores', async () => { assert.equal(await page.locator('[data-vm-driver] progress').count(), 0); await page.locator('[data-dr-open]').click(); await page.waitForSelector('.dr-content'); assert.match(await page.locator('.dr-content').innerText(), /nejsou zveřejněné/); await shot('mobile-shadow'); await page.keyboard.press('Escape'); });
  mode = 'error'; await ready(); await page.locator('[data-vm-view="dashboard"]').click();
  await test('Source failure shows unavailable without disrupting the map', async () => { await page.waitForFunction(() => document.querySelector('[data-vm-driver]').textContent.includes('Nedostupné')); await page.locator('[data-dr-open]').click(); await page.waitForSelector('.dr-content [role=alert]'); await shot('mobile-unavailable'); await page.locator('[data-dr-close]').click(); assert(await page.locator('[data-vm-row]').count()); });
  mode = 'scored'; own = true; await ready(); await page.locator('[data-vm-view="dashboard"]').click();
  await test('Driver UI says own evaluation and exposes no ranking', async () => { assert.match(await page.locator('[data-vm-driver]').innerText(), /Moje hodnocení/i); await page.locator('[data-dr-open]').click(); await page.waitForSelector('[data-dr-driver]'); assert.doesNotMatch(await page.locator('.dr-content').innerText(), /TOP 5/); });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ engine, synthetic: true, results, errors }, null, 2));
} finally { await browser.close(); server.close(); }
