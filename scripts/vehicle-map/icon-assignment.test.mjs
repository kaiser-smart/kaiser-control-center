import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {artwork} from '../../src/vehicle-map/presentation.js';
import { assignmentDocument, readAssignments, ICON_CHOICES } from '../../src/vehicle-map/icon-assignment.js';
const vehicles = [
 { id:'company:vehicle:1', stable:true, plate:'1AB 2345', name:'Svoz A', latitude:50, assignedDriver:'Do not export' },
 { id:'company:vehicle:2', stable:true, plate:'2AB 3456', name:'RAM B' },
 { id:'unverified:3', stable:false, plate:'3AB 4567', name:'Unknown' }
];
const choices = new Map([[vehicles[0].id,'collection_truck'],[vehicles[1].id,'skip_loader'],[vehicles[2].id,'tanker']]);
const doc = assignmentDocument(vehicles, choices);
assert.equal(doc.assignments.length,2);
assert.equal(doc.purpose,'proposal');
assert.equal(JSON.stringify(doc).includes('Do not export'),false);
assert.equal(JSON.stringify(doc).includes('latitude'),false);
assert.deepEqual([...readAssignments(doc,vehicles).choices], [...choices].slice(0,2));
assert.equal(readAssignments(doc,[{...vehicles[0],plate:'9ZZ 9999'}]).skipped,2);
assert.equal(readAssignments(doc,[{...vehicles[0],id:'other:vehicle:1'}]).choices.size,0);
assert.throws(()=>readAssignments({...doc,version:2},vehicles));
assert.throws(()=>readAssignments({...doc,assignments:[{...doc.assignments[0],icon:'<script>'}]},vehicles));
assert.throws(()=>readAssignments({...doc,assignments:[doc.assignments[0],doc.assignments[0]]},vehicles));
assert.throws(()=>readAssignments({...doc,assignments:Array(1001).fill(doc.assignments[0])},vehicles));
assert.throws(()=>readAssignments({...doc,assignments:[null]},vehicles));
assert.equal(ICON_CHOICES.length,16);
console.log('PASS assignment export/import: stable IDs, plate mismatch, cross-scope isolation, allowlist, bounds, duplicates, no GPS or driver data');

for (const [key,file,hash] of [
 ['box_body_compact','container-compact.png','f8c7a98185d1a02ce2928207c2f4a065c56b9ea786a4b52a46148253a6530635'],
 ['van_passenger','van-passenger.png','80e6d742630b86f7dee1839e4fcd6fc2a0fd9f228dd824d5c70657bb39f7a261'],
 ['tanker_compact','tanker-compact.png','0482162f1d927e35272ab94cf948261eb21da6cce2360c91a311848d20c58336']
]) {
 const proposal=assignmentDocument(vehicles,new Map([[vehicles[0].id,key]]));
 assert.equal(readAssignments(proposal,vehicles).choices.get(vehicles[0].id),key);
 assert.ok(artwork({key}).includes(file));
 assert.equal(createHash('sha256').update(await readFile('public/vehicles/openart-2/'+file)).digest('hex'),hash);
}
console.log('PASS three added variants: original PNG hashes, rendered source and proposal export/import');

// Approved artwork never changes fleet type, telemetry or permissions.
const { APPROVED_ICON_ASSIGNMENTS, approvedArtworkKey } = await import('../../src/vehicle-map/approved-icons.js');
const { reconcile, normalize } = await import('../../src/vehicle-map/model.js');
const { markerHTML } = await import('../../src/vehicle-map/presentation.js');
const { vehiclePictureHTML, overviewHTML } = await import('../../src/vehicle-map/dashboard.js');
assert.equal(APPROVED_ICON_ASSIGNMENTS.length,50);
assert.equal(new Set(APPROVED_ICON_ASSIGNMENTS.map(row=>row[0])).size,50);
const now=Date.parse('2026-10-26T10:00:00Z');
for(const [id,plate,key] of APPROVED_ICON_ASSIGNMENTS) {
 assert.ok(ICON_CHOICES.some(icon=>icon.key===key));
 const vehicle={externalProvider:'tcars',externalVehicleId:id,licensePlate:plate,type:'special'};
 const sample={...vehicle,latitude:49.2,longitude:16.6,speedKmh:23,lastGpsAt:new Date(now).toISOString()};
 const record={stable:true,vehicle,latest:sample};
 assert.equal(approvedArtworkKey(record),key);
 for(const bad of [
  {...record,stable:false},
  {...record,vehicle:{...vehicle,externalVehicleId:'unassigned'}},
  {...record,vehicle:{...vehicle,licensePlate:'OTHER'}},
  {...record,latest:{...sample,externalProvider:'other'}},
  {...record,latest:{...sample,externalVehicleId:'different'}},
  {...record,latest:{...sample,licensePlate:'CHANGED'}},
 ]) assert.equal(approvedArtworkKey(bad),'');
 const [v]=normalize(reconcile({vehicles:[vehicle],locations:[sample]},new Map(),{scope:'another-authorized-user',now}),{now});
 assert.equal(v.artworkKey,key);
 const [without]=normalize(reconcile({vehicles:[{...vehicle,externalVehicleId:'unassigned'}],locations:[{...sample,externalVehicleId:'unassigned'}]},new Map(),{now}),{now});
 assert.deepEqual(v.type,without.type);
 for(const field of ['point','speed','category','movement','lastGpsAt'])assert.deepEqual(v[field],without[field]);
 const sprite=artwork({key},'map');assert.ok(markerHTML(v).startsWith(sprite));assert.ok(overviewHTML([v]).includes(sprite));
 assert.equal(vehiclePictureHTML(v),artwork({key},'detail'));
}
assert.equal(approvedArtworkKey({stable:true,vehicle:{licensePlate:'3BN3558',externalUnitId:'891'}}),'');
assert.equal(approvedArtworkKey({stable:true,vehicle:{externalVehicleId:'891'}}),'');
console.log('PASS 50 approved assignments: exact ID + plate, conflict rejection, all renderers, original fleet type/GPS unchanged');
