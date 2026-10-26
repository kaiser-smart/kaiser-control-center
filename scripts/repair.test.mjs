import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { claimRepair,finishRepair,authorizeRunner } from '../functions/_lib/repair-queue.js';
import { assertImage,boundedForm,repairRoute,digest } from '../functions/_lib/repair-input.js';
import { validateCss } from './repair/gate.mjs';
import { verifyOrRollback,target } from './repair/production.mjs';
class Statement {
 constructor(db,sql,values=[]){Object.assign(this,{db,sql,values});}
 bind(...values){return new Statement(this.db,this.sql,values);}
 async first(){return this.db.prepare(this.sql).get(...this.values)||null;}
 async all(){return {results:this.db.prepare(this.sql).all(...this.values)};}
 async run(){return {meta:this.db.prepare(this.sql).run(...this.values)};}
}
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE self_repair_cases(id TEXT PRIMARY KEY,title TEXT,description TEXT,expected_behavior TEXT,source_route TEXT,module_key TEXT,client_request_id TEXT); CREATE TABLE cross_database_workflows(idempotency_key TEXT,status TEXT);');
sql.exec(readFileSync('migrations/modular/core/0008_repair_queue.sql','utf8'));
const db={prepare:s=>new Statement(sql,s)};
const now=new Date().toISOString();
for(let n=1;n<=3;n++){sql.prepare('INSERT INTO self_repair_cases VALUES(?,?,?,?,?,?,?)').run(`case-${n}`,'problem','description','','/','feedback',`request-${n}`);sql.prepare('INSERT INTO cross_database_workflows VALUES(?,?)').run(`self-repair-user-report:request-${n}`,'completed');sql.prepare('INSERT INTO repair_queue(case_id,reporter_id,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?)').run(`case-${n}`,'user',`key-${n}`,now,now);}
assert.throws(()=>sql.prepare('INSERT INTO repair_queue(case_id,reporter_id,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?)').run('other','user','key-1',now,now),/UNIQUE/);
const [first,second]=await Promise.all([claimRepair(db,'100-1'),claimRepair(db,'101-1')]);assert.ok(Boolean(first)!==Boolean(second),'One concurrent claimant only');
const job=first||second;const callback={caseId:job.caseId,runId:job.runId,lease:job.lease};
await assert.rejects(()=>claimRepair(db,job.runId),/již převzal/);
await assert.rejects(()=>finishRepair(db,{...callback,lease:'wrong',state:'failed'}));
await assert.rejects(()=>finishRepair(db,{...callback,state:'deployed'}));
await assert.rejects(()=>finishRepair(db,{...callback,state:'validated'}));
const base='a'.repeat(40),head='b'.repeat(40),patch='c'.repeat(64),rollback='11111111-1111-1111-1111-111111111111',deployment='22222222-2222-2222-2222-222222222222';
await finishRepair(db,{...callback,state:'validated',base_sha:base,patch_sha:patch});
await finishRepair(db,{...callback,state:'deploying',result_sha:head,rollback_id:rollback});
await assert.rejects(()=>finishRepair(db,{...callback,state:'deployed',result_sha:head,deployment_id:deployment}));
await finishRepair(db,{...callback,state:'deployed',result_sha:head,deployment_id:deployment,checks_passed:true});
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM repair_queue_events WHERE case_id=?').get(job.caseId).n,5);
const abandoned=await claimRepair(db,'102-1',now);
const future=new Date(Date.now()+60*60000).toISOString();
await claimRepair(db,'103-1',future);
assert.equal(sql.prepare('SELECT state FROM repair_queue WHERE case_id=?').get(abandoned.caseId).state,'needs_decision');
await assert.rejects(()=>finishRepair(db,{caseId:abandoned.caseId,runId:abandoned.runId,lease:abandoned.lease,state:'failed'},future));
await assert.rejects(()=>authorizeRunner(new Request('https://smart-odpady.ai/api/repair/runner'),{}));
await assert.rejects(()=>authorizeRunner(new Request('https://smart-odpady.ai/api/repair/runner'),{REPAIR_AUTOMATION_ENABLED:'true',REPAIR_RUNNER_TOKEN:'x'.repeat(32)}));
await authorizeRunner(new Request('https://smart-odpady.ai/api/repair/runner',{headers:{authorization:`Bearer ${'x'.repeat(32)}`}}),{REPAIR_AUTOMATION_ENABLED:'true',REPAIR_RUNNER_TOKEN:'x'.repeat(32)});
assert.equal(repairRoute('https://smart-odpady.ai/vozovy-park?token=private#password'),'/vozovy-park');
for(const value of ['https://evil.test','//evil.test','javascript:alert(1)','https://smart-odpady.ai@evil.test'])assert.throws(()=>repairRoute(value));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');const bytes=png.buffer.slice(png.byteOffset,png.byteOffset+png.length);assert.deepEqual(assertImage(bytes,'image/png'),{width:1,height:1});
assert.throws(()=>assertImage(new TextEncoder().encode('<svg onload="x"/>').buffer,'image/png'));
const bomb=bytes.slice(0);new DataView(bomb).setUint32(16,90000);assert.throws(()=>assertImage(bomb,'image/png'));
const good='.tyre-card {\n  padding: 16px;\n}\n';assert.equal(validateCss(good,good.replace('16px','18px')).changes,1);
for(const after of [good.replace('16px','100px'),good.replace('padding','display'),good+'body {display:none}',good.replace('.tyre-card','.login')])assert.throws(()=>validateCss(good,after));
assert.throws(()=>validateCss(good.replace('.tyre-card','.auth-dialog'),good.replace('.tyre-card','.auth-dialog').replace('16px','18px')));
const oversized=new Request('https://smart-odpady.ai',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=x'},body:new Uint8Array(5*1024*1024+65537)});await assert.rejects(()=>boundedForm(oversized));
let active=head,rollbackCalls=0;
const project=()=>({name:target.project,production_branch:'main',domains:['smart-odpady.ai'],canonical_deployment:{id:active===head?deployment:rollback,environment:'production',latest_stage:{status:'success'},deployment_trigger:{metadata:{commit_hash:active}}}});
const api=async(path,method)=>{if(method==='POST'){rollbackCalls++;active=base;}return project();};
const config={base,head,rollbackId:rollback,baselineCss:'old',patchedCss:'new'};
assert.equal((await verifyOrRollback(config,api,async()=>true)).state,'deployed');assert.equal(rollbackCalls,0);
assert.equal((await verifyOrRollback(config,api,async sha=>{if(sha===head)throw new Error('smoke failed');})).state,'rolled_back');assert.equal(rollbackCalls,1);
active='d'.repeat(40);await assert.rejects(()=>verifyOrRollback(config,api,async()=>{throw Error('bad');}),/outside this run/);assert.equal(rollbackCalls,1);
active=head;await assert.rejects(()=>verifyOrRollback(config,api,async()=>{throw Error('rollback also broken');}));
assert.match(await digest('test'),/^[a-f0-9]{64}$/);
console.log('Repair tests passed: concurrent claims, dedupe, lease expiry, audit, token scope, transitions, bounded uploads, image signatures, CSS gate, deploy smoke/rollback/concurrent-deploy protection.');
