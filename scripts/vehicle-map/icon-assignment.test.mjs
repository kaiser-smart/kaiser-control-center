import assert from 'node:assert/strict';
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
assert.equal(ICON_CHOICES.length,13);
console.log('PASS assignment export/import: stable IDs, plate mismatch, cross-scope isolation, allowlist, bounds, duplicates, no GPS or driver data');
