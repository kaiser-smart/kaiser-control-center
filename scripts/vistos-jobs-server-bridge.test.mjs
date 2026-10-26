import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runVistosJobsServerBridge,jobsRunnerTokenMatches} from '../functions/_lib/vistos-jobs-server-bridge.js';
import {handleJobsServerRun,onRequestGet} from '../functions/api/integrations/vistos/jobs-run-internal.js';
import {runVistosJobsPayments} from '../functions/_lib/vistos-jobs-runner.js';
const token='fixture-job-runner-token-at-least-32-characters';
const flags={VISTOS_JOBS_RUNNER_TOKEN:token,VISTOS_JOBS_RUNNER_ENABLED:'true',VISTOS_READ_SYNC_ENABLED:'true'};
test('internal jobs route requires its dedicated token and never accepts a user-selected operation',async()=>{
 let calls=0;
 const run=async(env,options)=>{calls++;assert.equal(env.VISTOS_PAYMENT_WRITE_ENABLED,'false');assert.equal(env.VISTOS_JOB_EXECUTION_ENABLED,'false');assert.equal(options.onlyJobs,true);return {status:'partial',reads:[{status:'partial'},{status:'blocked',secret:'not returned'}]};};
 const request=t=>new Request('https://smart-odpady.ai/api/integrations/vistos/jobs-run-internal',{method:'POST',headers:t?{Authorization:'Bearer '+t}:{},body:JSON.stringify({entity:'Payment',operation:'create',onlyJobs:false})});
 for(const t of [undefined,'wrong'])assert.equal((await handleJobsServerRun({request:request(t),env:flags},run)).status,401);
 assert.equal(calls,0);assert.equal(jobsRunnerTokenMatches('', ''),false);
 const off=await handleJobsServerRun({request:request(token),env:{...flags,VISTOS_READ_SYNC_ENABLED:'false'}},run);assert.equal((await off.json()).status,'disabled');assert.equal(calls,0);
 const r=await handleJobsServerRun({request:request(token),env:{...flags,VISTOS_PAYMENT_WRITE_ENABLED:'true',VISTOS_JOB_EXECUTION_ENABLED:'true'}},run);
 assert.deepEqual(await r.json(),{status:'partial',reads:2,blocked:1});assert.equal(calls,1);assert.equal((await onRequestGet()).status,405);
});
test('scheduler uses the fixed Pages origin, no redirects and no raw response or credentials in output',async()=>{
 let calls=0;const fetcher=async(url,init)=>{calls++;assert.equal(url,'https://smart-odpady.ai/api/integrations/vistos/jobs-run-internal');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer '+token);assert.equal(init.body,'{}');return Response.json({status:'partial',reads:2,blocked:0,secret:token});};
 assert.equal((await runVistosJobsServerBridge({}, {fetcher})).status,'disabled');
 assert.equal((await runVistosJobsServerBridge({...flags,APP_BASE_URL:'https://untrusted.invalid'},{fetcher})).code,'vistos_jobs_runner_origin_invalid');assert.equal(calls,0);
 assert.deepEqual(await runVistosJobsServerBridge(flags,{fetcher}),{status:'partial',reads:2,blocked:0});assert.equal(calls,1);
 assert.equal((await runVistosJobsServerBridge(flags,{fetcher:async()=>{throw Error(token);}})).code,'vistos_jobs_server_unavailable');
});
test('jobs-only scheduler cannot query payment commands or invoice refresh even with financial contracts enabled',async()=>{
 const sqls=[];
 const db={prepare(sql){sqls.push(sql);assert.ok(!sql.includes('FROM vistos_payment_commands'));assert.ok(!sql.includes('FROM vistos_detail_refresh_queue'));
 return {bind(){return this;},async first(){if(sql.includes('vistos_integration_contracts'))return {installation:'test',revision:'test',contract_json:JSON.stringify({entities:{Payment:{readVerified:true},InvoiceIssued:{readVerified:true}}})};return null;},async all(){if(sql.includes('SELECT installation FROM'))return {results:[{installation:'test'}]};if(sql.includes('module_rules'))return {results:[{id:'jobs-vistos-read'},{id:'receivables-vistos-writer'}]};return {results:[]};}};}};
 const result=await runVistosJobsPayments({...flags,DB_CORE:db,DB_ARCHIVE:db,DB_AUDIT:db},{onlyJobs:true});
 assert.equal(result.reads.length,0);assert.equal(result.commands.length,0);
 assert.ok(sqls.some(s=>s.includes("entity IN ('ServiceList','ServiceListItem')")));
});

test('worker-compatible manual mode rejects redirects without forwarding the service token',async()=>{let calls=0;const result=await runVistosJobsServerBridge(flags,{fetcher:async(url,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response('',{status:302,headers:{Location:'https://untrusted.invalid'}});}});assert.deepEqual(result,{status:'blocked',code:'vistos_jobs_redirect_rejected'});assert.equal(calls,1);});
