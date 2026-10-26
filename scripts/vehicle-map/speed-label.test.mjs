import assert from 'node:assert/strict';
import {currentSpeed,markerLabelHTML,markerName} from '../../src/vehicle-map/presentation.js';
const v={label:'3BN 3558',type:{label:'Vůz'},point:{lat:49,lng:16},previousPoint:false,age:30,speed:32,category:'moving',movement:'moving'};
assert.equal(currentSpeed(v),32);assert.equal(currentSpeed({...v,speed:0,category:'stopped'}),0);
assert.equal(currentSpeed({...v,age:120}),32);
for(const patch of [{age:120.001},{age:-1},{age:null},{age:NaN},{point:null},{previousPoint:true},{category:'stale'},{category:'missing'},{speed:null},{speed:NaN},{speed:-1},{speed:Infinity}]){
 const x={...v,...patch};assert.equal(currentSpeed(x),null);assert.match(markerLabelHTML(x),/>—<span/);
}
assert.match(markerLabelHTML(v),/>32<span/);assert.match(markerName(v),/32 km\/h/);
assert.match(markerLabelHTML({...v,label:'<img onerror="x">'}),/&lt;img/);
assert(!markerLabelHTML({...v,label:'<img onerror="x">'}).includes('<img'));
console.log('PASS speed label: current GPS, zero, 120 s boundary, historical/unavailable suppression, accessible name, escaping');
const {spreadPoints,overlaps,rect}=await import('../../src/vehicle-map/spatial.js');
const points=Array.from({length:6},(_,i)=>({id:String(i),x:400,y:300,vehicle:{heading:null}}));
const footprint=p=>({left:p.x-90,right:p.x+90,top:p.y-38,bottom:p.y+60});
const spread=spreadPoints(points,{x:400,y:300},rect(400,300,780,580),[],footprint);
assert.equal(spread.length,6);
assert(!spread.some((p,i)=>spread.slice(i+1).some(q=>overlaps(footprint(p),footprint(q),8))));
assert.deepEqual(spread,spreadPoints(points,{x:400,y:300},rect(400,300,780,580),[],footprint));
console.log('PASS expanded groups reserve full plate/speed footprint with deterministic positions');
