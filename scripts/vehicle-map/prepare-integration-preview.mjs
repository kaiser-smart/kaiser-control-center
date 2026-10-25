// Build with scripts/build.mjs first. This writes only the isolated preview package.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(root, '../preview-deploy/site');
await mkdir(out, { recursive: true });
for (const name of ['src', 'icons']) await cp(path.join(root, 'dist', name), path.join(out, name), { recursive: true });
await cp(path.join(root, 'dist/vehicles/openart'), path.join(out, 'vehicles/openart'), { recursive: true });
for (const name of ['manifest.webmanifest', 'logo-kaiser.svg', 'logo-kaiser.png', 'smart-odpady-logo.png']) await cp(path.join(root, 'dist', name), path.join(out, name));
const html = (await readFile(path.join(root, 'dist/index.html'), 'utf8')).replace('<body>', '<body><div style="padding:8px 14px;background:#202821;color:white;font:12px Quicksand,sans-serif" role="note">CHRÁNĚNÝ INTEGRAČNÍ NÁHLED · skutečný backend · pouze čtení · bez produkčního nasazení</div>');
await writeFile(path.join(out, 'index.html'), html);
const worker = (await readFile(path.join(root, 'scripts/vehicle-map/integration-worker.mjs'), 'utf8')).replace('./integration-proxy.mjs', './_integration-proxy.js');
await writeFile(path.join(out, '_worker.js'), worker);
await cp(path.join(root, 'scripts/vehicle-map/integration-proxy.mjs'), path.join(out, '_integration-proxy.js'));
await writeFile(path.join(out, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: [] }));
console.log(`Protected preview package: ${out}. No deployment performed.`);
