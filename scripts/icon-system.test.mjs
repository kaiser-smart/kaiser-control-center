import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { iconDefinitions } from '../src/components/icons/definitions.js';
import { SmartIcon, moduleIconNames } from '../src/components/icons/SmartIcon.js';
import { modules } from '../src/data/modules.js';
import { vehicleTrackingSvgIconSource, VEHICLE_TRACKING_ICON_TYPES, VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE, vehicleTrackingVisualHeading, vehicleTrackingHeadingOffsetForVehicle } from '../src/data/vehicleTracking.js';
const root=new URL('../',import.meta.url);
let totalBytes=0,maxBytes=0;
const provenance=JSON.parse(await readFile(new URL('docs/icon-provenance.json',root),'utf8'));
const approved=JSON.parse(await readFile(new URL('docs/openart-source-input.json',root),'utf8')).manifest.approvedReference;
assert.equal(approved.sourceType,'user-attachment','Approval belongs to the attached original, not a generated variation');
assert.equal(createHash('sha256').update(await readFile(new URL(approved.file,root))).digest('hex'),approved.attachmentSha256);
assert.deepEqual(provenance.map(item=>item.name).sort(),Object.keys(iconDefinitions).sort());
for(const name of Object.keys(iconDefinitions)){
  const svg=SmartIcon(name),saved=await readFile(new URL(`public/icons/ui/${name}.svg`,root),'utf8');
  assert.equal(saved.trim(),svg,`Regenerate outdated standalone icon ${name}`);
  assert.ok(!/<(?:image|filter|linearGradient|radialGradient|script|foreignObject|text)\b|data:image/i.test(svg),`Not pure vector: ${name}`);
  assert.match(svg, /fill="#243128"/);assert.match(svg, /fill="#75BD25"/);
  assert.match(svg,/stroke="none"/); // Source outlines are traced filled contours, never thickened by an extra stroke.
  assert.match(svg,/aria-hidden="true" focusable="false"/);
  assert.ok(Buffer.byteLength(saved)<8192,`Oversized ${name}`);
  const source=provenance.find(item=>item.name===name);
  if(source.sourceType!=='user-attachment')assert.match(source.sourceUrl,/^https:\/\/cdn\.openart\.ai\//);
  assert.equal(source.svgSha256,createHash('sha256').update(saved).digest('hex'),`Source provenance drift: ${name}`);
  assert.match(source.sourceSha256,/^[a-f0-9]{64}$/);
  if(approved.scope.includes(name)) {
    assert.equal(source.sourceType,'user-attachment',`Wrong approved source: ${name}`);
    assert.equal(source.sourceFile,approved.file);
    assert.equal(source.sourceSha256,approved.attachmentSha256);
    assert.equal(source.userApprovedExact,true);
  } else assert.equal(source.userApprovedExact,false,`Do not infer approval for ${name}`);
  if(source.vectorAdjustment){
    assert.equal(name,'pause');
    assert.equal(source.vectorAdjustment.type,'measured-straight-bars-uniform-width');
    assert.equal(source.vectorAdjustment.widthAt24,1);
    assert.equal(source.vectorAdjustment.bars.length,2);
    assert.equal((saved.match(/<rect /g)||[]).length,2);
    for(const bar of source.vectorAdjustment.bars){
      const [x0,y0,x1,y1]=bar.sourceBoundsAt24;
      assert.equal(bar.width,1);assert.equal(bar.rx,.5);
      assert.equal(bar.x+.5,(x0+x1)/2);
      assert.equal(bar.y,y0);assert.equal(bar.y+bar.height,y1);
    }
  }
  totalBytes+=Buffer.byteLength(saved);maxBytes=Math.max(maxBytes,Buffer.byteLength(saved));
}
assert.throws(()=>SmartIcon('<script>'));
for(const module of modules){assert.ok(Object.hasOwn(moduleIconNames,module.id),`Unmapped existing module ${module.id}`);assert.match(module.icon(),/class="smart-icon/);}
for(const source of [...VEHICLE_TRACKING_ICON_TYPES.flatMap(i=>[i.primary,i.webp]),...Object.values(VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE)]){
  assert.match(source,/\.svg$/);assert.ok((await stat(new URL(`public${source}`,root))).size<20000);
}
// The north-facing map artwork must not retain the old 3D diagonal correction.
for(const type of VEHICLE_TRACKING_ICON_TYPES){assert.equal(vehicleTrackingHeadingOffsetForVehicle({iconType:type.key}),0);assert.equal(vehicleTrackingVisualHeading(90,20,vehicleTrackingHeadingOffsetForVehicle({iconType:type.key})),90);}
assert.equal(vehicleTrackingSvgIconSource('/vehicles/icons/man-abroll.png'),'/vehicles/icons/man-abroll.svg');
assert.equal(vehicleTrackingSvgIconSource('/vehicles/icons/dodavka.webp'),'/vehicles/icons/dodavka.svg');
assert.equal(vehicleTrackingSvgIconSource('https://custom.example/car.png'),'https://custom.example/car.png');
const css=await readFile(new URL('src/icon-system.css',root),'utf8');
for(const [,relative] of css.matchAll(/url\('([^']+)'\)/g))await stat(new URL(relative,new URL('public/src/',root)));
const app=await readFile(new URL('src/app.js',root),'utf8');
assert.ok(!app.includes('<svg viewBox="0 0 32 32"'),'Legacy driver SVG family removed');
const luminance=hex=>{const c=hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
assert.ok(contrast('243128','ffffff')>=7);
const report={icons:Object.keys(iconDefinitions).length,modules:modules.length,totalBytes,maxBytes,libraryGzipBytes:gzipSync(await readFile(new URL('src/components/icons/definitions.js',root))).length,graphiteOnWhite:contrast('243128','ffffff'),greenOnWhite:contrast('75BD25','ffffff'),greenOnGraphite:contrast('75BD25','243128'),note:'Green is the approved accent, not an independently contrast-compliant foreground on white. Labels remain necessary.'};
console.log(JSON.stringify(report,null,2));
