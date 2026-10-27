import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { hasCurrentMotion, isOnline, ignitionState, ignitionName, clusterIgnition, markerName, ignitionHTML } from '../../src/vehicle-map/presentation.js';
import { labelMarkerRect,placeLabels,focusTarget,fittedCamera,overlaps,rect } from '../../src/vehicle-map/spatial.js';
const moving={point:{lat:49,lng:16},previousPoint:false,category:'moving',movement:'moving',age:30};
assert.equal(hasCurrentMotion(moving),true);
for(const patch of [{category:'stopped'},{category:'stale'},{category:'missing'},{movement:'unknown'},{point:null},{previousPoint:true},{age:null},{age:NaN},{age:120.001},{age:-1}])assert.equal(hasCurrentMotion({...moving,...patch}),false);
assert.equal(hasCurrentMotion({...moving,age:120}),true);
const rows=[{id:'a',x:200,y:150,vehicle:{label:'1AB 2345',heading:null}},{id:'b',x:280,y:150,vehicle:{label:'2AB 3456',heading:null}}];
const bounds={left:0,right:500,top:0,bottom:400},measure=()=>({width:100,height:26}),obstacles=rows.map(labelMarkerRect);
const first=placeLabels(rows,obstacles,bounds,measure,'a'),second=placeLabels(rows,obstacles,bounds,measure,'b');
assert.deepEqual([...first.keys()],['a']);assert.deepEqual([...second.keys()],['b']);
assert.equal(first.get('a').top,177);assert.equal(second.get('b').top,177);
assert.equal(first.get('a').left,150);assert.equal(second.get('b').left,230);
assert.equal(labelMarkerRect({...rows[0],vehicle:{heading:180}}).bottom,180);
// A selected plate must not stick to an edge after its vehicle leaves the view.
for(const [x,y] of [[-80,150],[580,150],[200,-10],[200,460],[20,150],[480,150],[200,20]]) {
  const p={...rows[0],x,y};
  assert.equal(placeLabels([p],[],bounds,measure,p.id).size,0,`clipped vehicle/plate at ${x},${y}`);
}
for(const x of [50,450]) {
  const p={...rows[0],x};
  assert.equal(placeLabels([p],[],bounds,measure,p.id).get(p.id).left,x-50);
}
console.log('PASS offscreen/clipped vehicles have no orphan plate; visible plates keep their exact anchor');
const hashes={'atlas.png':'d05712ae2dd761000135e33f8f47b6a84c40bcc005b19330daf0204701ad9f96','collection-truck.png':'95bd74b192c2cde146fad83e425ff71679447e5430f96bcd6100ae244d20699a','skip-loader.png':'81e0a59777996d732482463572868963f9acd512f778295acbc645baf7c186ee'};
for(const [file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile('public/vehicles/openart-2/'+file)).digest('hex'),hash);
console.log('PASS current-motion eligibility, 120-second boundary, stable plate priority, heading clearance, unchanged original PNG hashes');

assert.equal(isOnline(moving),true);
assert.equal(isOnline({...moving,category:'stopped',movement:'stopped'}),true);
for(const patch of [{category:'stale'},{category:'missing'},{point:null},{previousPoint:true},{age:null},{age:NaN}])assert.equal(isOnline({...moving,...patch}),false);
assert.equal(markerName({...moving,label:'TEST 001',type:{label:'Vůz'}}),'TEST 001, Vůz, Jede, Zapalování nezjištěno');
assert.equal(markerName({...moving,category:'stale',label:'TEST 002',type:{label:'Vůz'}}),'TEST 002, Vůz, Zapalování nezjištěno');
assert.match(ignitionHTML({...moving,category:'stale'}),/vm-ignition-unknown/);
for (const ignition of [true,false]) {
  for (const movement of ['moving','stopped','unknown']) {
    const v={...moving,ignition,category:movement,movement,speed:movement==='moving'?50:0};
    assert.equal(ignitionState(v),ignition);
    assert.match(ignitionHTML(v),ignition ? /vm-ignition-on/ : /vm-ignition-off/);
  }
  for (const patch of [{category:'stale'},{category:'missing'},{previousPoint:true},{point:null},{age:null}]) {
    assert.equal(ignitionState({...moving,ignition,...patch}),ignition);
    assert.match(ignitionHTML({...moving,ignition,...patch}),ignition ? /vm-ignition-on/ : /vm-ignition-off/);
  }
}
for (const ignition of [null,undefined,0,1,'false','true']) assert.equal(ignitionState({...moving,ignition}),null);
assert.match(clusterIgnition([{...moving,ignition:true},{...moving,ignition:true}]).html,/vm-ignition-on/);
assert.match(clusterIgnition([{...moving,ignition:false},{...moving,ignition:false}]).html,/vm-ignition-off/);
assert.equal(clusterIgnition([{...moving,ignition:true},{...moving,ignition:false}]).html,'');
assert.equal(clusterIgnition([{...moving,ignition:false},{...moving,ignition:null}]).html,'');
console.log('PASS explicit ignition on/off independent of motion, retained stale state, no inference for missing data, homogeneous clusters only');

const tabletBounds={left:6,top:6,right:302,bottom:404},tabletSafe={left:50,top:76,right:258,bottom:374},legend={left:12,top:245,right:138,bottom:400};
const target=focusTarget({heading:0},tabletSafe,tabletBounds,[legend],{width:100,height:26});
const footprint=labelMarkerRect({...target,vehicle:{heading:0}});
assert.equal(overlaps(rect(target.x,footprint.bottom+18,100,26),legend,4),false);
assert(target.y<(tabletSafe.top+tabletSafe.bottom)/2 || target.x!==154);
console.log('PASS focus target keeps the selected plate clear of tablet controls without moving its GPS anchor');

const fitted=fittedCamera([{lat:49.15,lng:16.5},{lat:49.22,lng:16.695}],1200,800,7);
assert.ok(fitted.center.lat>49.15&&fitted.center.lat<49.22);
assert.equal(fitted.center.lng,16.5975);
assert.ok(fitted.zoom>12&&fitted.zoom<13);
const single=fittedCamera([{lat:49,lng:16}],400,600,7);
assert.ok(Math.abs(single.center.lat-49)<1e-10);assert.equal(single.center.lng,16);assert.equal(single.zoom,16);
assert.equal(fittedCamera([],400,600,7),null);
console.log('PASS group camera fits real bounds atomically, including coincident points');

const captionNow = Date.parse('2026-10-27T12:00:00+01:00');
assert.equal(ignitionName({ignition:false, ignitionAt:'2026-10-27T08:42:00+01:00'}, captionNow), 'Zapalování vypnuto · poslední stav dnes 08:42');
assert.equal(ignitionName({ignition:true, ignitionAt:'2026-10-26T08:42:00+01:00'}, captionNow), 'Zapalování zapnuto · poslední stav 26. 10. 2026 08:42');
assert.equal(ignitionName({ignition:false, ignitionAt:'2026-10-26T23:30:00Z'}, captionNow), 'Zapalování vypnuto · poslední stav dnes 00:30');
assert.equal(ignitionName({ignition:false, ignitionAt:'2026-07-01T06:42:00Z'}, Date.parse('2026-07-01T10:00:00Z')), 'Zapalování vypnuto · poslední stav dnes 08:42');
for (const ignitionAt of [undefined,'','bad','2026-10-28T08:00:00Z']) assert.equal(ignitionName({ignition:false,ignitionAt},captionNow),'Zapalování vypnuto · čas posledního stavu nezjištěn');
assert.equal(ignitionName({ignition:null,ignitionAt:'2026-10-27T08:42:00+01:00'},captionNow),'Zapalování nezjištěno');
console.log('PASS exact approved wording, Prague date/day boundary and summer time, missing/future timestamp');
