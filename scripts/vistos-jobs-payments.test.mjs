import {createSessionCookie} from '../functions/_lib/auth.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {decimal,addDecimal,compareDecimal,exactJsonParse,referenceIds,invoiceAccountingState,fingerprint} from '../functions/_lib/vistos-values.js';
import {mergeSourceFields,discloseFields,normalizeSourceRecord} from '../functions/_lib/vistos-source-model.js';
import {syncVistosBatch,authorizedIntegrationScope,persistVerifiedSourceReadback} from '../functions/_lib/vistos-integration-store.js';
import {listJobs,pragueDayBounds,handleVistosRequest} from '../functions/_lib/vistos-jobs-api.js';
import {deriveJobExecution} from '../functions/_lib/vistos-job-execution.js';
import {verifiedTcarsTime} from '../functions/_lib/vistos-tracking-enrichment.js';
import {loadJobTrackingInterval,vehicleTrackingHistoryPoint} from '../functions/_lib/vehicle-tracking-history.js';
import {writeGate,processPaymentCommand,acquireFinanceLocks,submitTransfers,confirmAllocation} from '../functions/_lib/vistos-payment-outbox.js';
import {hasPermission} from '../src/permissions.js';
import {runJobsReadQueue} from '../functions/_lib/vistos-jobs-read-queue.js';

export function fixtureDb(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE vehicle_tracking_gps_points(id TEXT PRIMARY KEY,vehicle_key TEXT,latitude REAL,longitude REAL,speed_kmh REAL,recorded_at TEXT);
 CREATE TABLE receivable_payment_matches(id TEXT PRIMARY KEY,invoice_id TEXT,payment_transaction_id TEXT);
 CREATE TABLE receivable_payment_transactions(id TEXT PRIMARY KEY,raw_payload TEXT,bank_transaction_id TEXT,booking_date TEXT,currency TEXT,source TEXT);
 CREATE TABLE receivable_invoices(id TEXT PRIMARY KEY,visto_invoice_id TEXT);`);
 for(const file of ['archive/0003_vistos_jobs_payments.sql','core/0006_vistos_integration_controls.sql','audit/0005_vistos_jobs_payments_audit.sql'])sqlite.exec(readFileSync(new URL('../migrations/modular/'+file,import.meta.url),'utf8'));
 const db={sqlite,failBatch:false,prepare(sql){let values=[];return {sql,bind(...v){assert.ok(v.length<=100);values=v;return this;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values),meta:{size_after:1024}};},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};}};},async batch(stmts){sqlite.exec('BEGIN');try{const output=[];for(const stmt of stmts){output.push(await stmt.run());if(db.failBatch&&stmt.sql.includes('vistos_sync_checkpoints SET offset')){db.failBatch=false;throw Error('injected checkpoint crash');}}sqlite.exec('COMMIT');return output;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return db;
}
const mapping={apiOrigin:'https://fixture.invalid',installation:'test',revision:'fixture-v1',companyIds:['1'],capacityEvidence:{approvedAt:'2026-10-01',estimateEvidenceId:'fixture-estimate',domains:Object.fromEntries(['core','archive','audit'].map(d=>[d,{maxSizeBytes:10000000}]))},entities:{ServiceList:{readVerified:true,orderVerified:true,modifiedFilterVerified:true,fixedCompanyId:'1',verifiedFields:['Number','Planned','Customer'],plannedField:'Planned',numberField:'Number',customerField:'Customer',idOrder:'Id asc'}}};
function environment(db,contract=mapping){db.sqlite.prepare('INSERT OR REPLACE INTO vistos_integration_contracts VALUES(?,?,?,?,?)').run('test',contract.revision,JSON.stringify(contract),'fixture','2026-10-25');return {DB_CORE:db,DB_ARCHIVE:db,DB_AUDIT:db,VISTOS_READ_SYNC_ENABLED:'true',VISTOS_INSTALLATION_ID:'test',VISTOS_API_BASE_URL:'https://fixture.invalid'};}

test('J06-J08/J11/S02: precise decimals, availability, source identities, scoped disclosure',async()=>{
 assert.equal(exactJsonParse('{"a":123456789012345.678901,"s":"1.25"}').a,'123456789012345.678901');
 assert.equal(addDecimal('0.1','0.2'),'0.3');assert.equal(addDecimal('-4000','3000'),'-1000');assert.throws(()=>decimal(0.1));
 assert.deepEqual(referenceIds({Auto_FK:'vůz',Auto_FK_RecordId:17},'Auto_FK'),['17']);assert.deepEqual(referenceIds({AllocatedVehicle:[{Id:2},{Id:3}]},'AllocatedVehicle'),['2','3']);
 let fields=mergeSourceFields({}, {Description:'known',Amount:'0',SecretToken:'secret'}, {entity:'Payment',kind:'detail',verifiedFields:['Description','Amount'],observedAt:'a'});
 fields=mergeSourceFields(fields,{}, {entity:'Payment',kind:'list',observedAt:'b'});assert.equal(fields.Amount.value,'0');assert.equal(fields.Amount.availability,'not_exposed');assert.equal(fields.Amount.stale,true);assert.ok(!fields.SecretToken);
 fields=mergeSourceFields(fields,{Amount:null},{entity:'Payment',kind:'detail',observedAt:'c'});assert.equal(fields.Amount.value,null);assert.equal(fields.Amount.availability,'null');
 const disclosed=discloseFields({raw:{disclosure:'unclassified',value:'secret'},private:{disclosure:'personal',value:'name'},fk:{disclosure:'operational',value:{Id:2,Salary:1000,Email:'private'}}},{finance:false,personal:false});
 assert.deepEqual(Object.keys(disclosed),['fk']);assert.deepEqual(disclosed.fk.value,{Id:'2'});
 const row=await normalizeSourceRecord({Id:1,Modified:'2026-10-25T10:00:00Z',Planned:'2026-10-25T10:00:00'},{installation:'test',entity:'ServiceList',contract:mapping});assert.equal(row.planned_start,null);
 assert.equal(await normalizeSourceRecord({Id:1,Modified:'2026-10-24T10:00:00Z'},{installation:'test',entity:'ServiceList',contract:mapping,previous:row}),null);
 assert.equal(Date.parse(pragueDayBounds('2026-03-29').to)-Date.parse(pragueDayBounds('2026-03-29').from),23*3600000);
 assert.equal(Date.parse(pragueDayBounds('2026-10-25').to)-Date.parse(pragueDayBounds('2026-10-25').from),25*3600000);
 assert.equal(verifiedTcarsTime('2026-10-25T02:30:00','Europe/Prague'),null);
});
test('J01-J05/J12: >100 pages, restart atomicity, repeat without business events, unstable pages fail closed',async()=>{
 const db=fixtureDb(),env=environment(db);let total=10073;
 const source=async({offset,length})=>({filtered:total,countEvidence:{filteredReported:true},rows:Array.from({length:Math.max(0,Math.min(length,total-offset))},(_,i)=>({Id:offset+i+1,Number:'J-'+(offset+i+1),Modified:'2026-10-25T01:00:00Z'}))});
 const run=()=>syncVistosBatch(env,{installation:'test',entity:'ServiceList',source});
 db.failBatch=true;await assert.rejects(run());assert.equal(db.sqlite.prepare('SELECT offset FROM vistos_sync_checkpoints').get().offset,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM vistos_source_records').get().n,0);
 let result;for(let n=0;n<101;n++)result=await run();assert.equal(result.offset,total);assert.equal(result.status,'compared');assert.equal(result.completeImport,false);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM vistos_source_records').get().n,total);
 const events=db.sqlite.prepare('SELECT COUNT(*) n FROM vistos_integration_events').get().n;await run();assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM vistos_integration_events').get().n,events);
 await syncVistosBatch(env,{installation:'test',entity:'ServiceList',mode:'reconciliation',source});
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM vistos_integration_events').get().n,events);
 total--;await assert.rejects(syncVistosBatch(env,{installation:'test',entity:'ServiceList',mode:'reconciliation',source}),e=>e.code==='vistos_page_count_changed');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM vistos_source_records').get().n,10073);
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM vistos_sync_checkpoints WHERE mode='delta'").get().n,0);
 db.sqlite.close();
});
test('S01: explicit permissions, finance denial and company isolation',async()=>{
 const db=fixtureDb(),env=environment(db);
 for(const role of ['admin','management']) {
  const admin={id:'u',role,permissions:[]};
  assert.equal(hasPermission(admin,'jobs','view'),true);
  for(const action of ['view_finance','view_personal','manage'])assert.equal(hasPermission(admin,'jobs',action),false);
  assert.equal(hasPermission(admin,'integrations','manage'),false);
  assert.equal(hasPermission(admin,'receivables','vistos_write'),false);
  assert.equal(hasPermission({...admin,permissions:[{moduleId:'jobs',action:'view',allowed:false}]},'jobs','view'),false);
  assert.equal(hasPermission({...admin,active:false},'jobs','view'),false);
  await assert.rejects(authorizedIntegrationScope(env,admin),e=>e.status===403);
 }
 for(const role of ['dispecer','ridic','readonly'])assert.equal(hasPermission({role,permissions:[]},'jobs','view'),false);
 assert.equal(hasPermission({role:'ridic',permissions:[{moduleId:'jobs',action:'view',allowed:true}]},'jobs','view'),false);
 await assert.rejects(authorizedIntegrationScope(env,{id:'u'}),e=>e.status===403);
 db.sqlite.prepare('INSERT INTO vistos_company_access VALUES(?,?,?)').run('u','test','1');
 await assert.rejects(authorizedIntegrationScope(env,{id:'u'},{companyId:'2'}),e=>e.status===403);
 const scope=await authorizedIntegrationScope(env,{id:'u',role:'dispecer',permissions:[]});assert.equal(scope.rights.finance,false);
 const data=await listJobs(scope,new URL('https://test/api/jobs?period=all'));assert.equal(data.stats.total,0);assert.deepEqual(data.rows,[]);db.sqlite.close();
});
const baseTime=Date.parse('2026-10-24T10:00:00Z');
const alias={id:'a',external_system:'tcars',external_key:'7',vehicle_id:'v',source_system:'tcars',verified:true,status:'active',valid_from:'2020-01-01T00:00:00Z',valid_to:null};
const points=[0,1,2,3,4].map((m,i)=>({id:String(i),providerId:'7',recordedAt:new Date(baseTime+m*60000).toISOString(),latitude:i===0||i===4?51:50,longitude:14,gpsValid:true,speedKmh:i===0||i===4?20:0}));
const tracking={jobId:'j',providerId:'7',points,aliases:[alias],location:{verified:true,evidenceId:'l',latitude:50,longitude:14,radiusMeters:50},window:{from:'2026-10-24T09:00:00Z',to:'2026-10-24T11:00:00Z',verified:true},competingJobs:['j'],coverage:{complete:true}};
test('T01-T10: bounded observations, ambiguity, gaps, unknown speed, private trip, temporal aliases',()=>{
 const result=deriveJobExecution(tracking);assert.equal(result.assignmentStatus,'auto_associated');assert.deepEqual(result.visits[0].durationSeconds,{minimum:120,maximum:240});assert.equal(result.useForPayroll,false);
 assert.equal(deriveJobExecution({...tracking,competingJobs:['j','other']}).assignmentStatus,'ambiguous');
 assert.equal(deriveJobExecution({...tracking,aliases:[]}).assignmentStatus,'candidate');
 assert.equal(deriveJobExecution({...tracking,aliases:[{...alias,valid_to:'2026-10-24T10:02:00Z'}]}).conditions.vehicle,false);
 assert.equal(deriveJobExecution({...tracking,points:points.slice(0,-1)}).visits[0].durationSeconds,null);
 assert.equal(deriveJobExecution({...tracking,coverage:{complete:false}}).visits[0].durationSeconds,null);
 assert.equal(deriveJobExecution({...tracking,points:points.map(p=>({...p,speedKmh:null}))}).visits.length,0);
 assert.equal(deriveJobExecution({...tracking,points:points.map(p=>({...p,gpsValid:false}))}).visits.length,0);
 assert.equal(deriveJobExecution({...tracking,points:[points[0],points[1],points[1],points[1],points[4]]}).visits.length,0);
 assert.equal(deriveJobExecution({...tracking,trips:[{private:true,from:tracking.window.from,to:tracking.window.to}]}).visits.length,0);
 assert.equal(vehicleTrackingHistoryPoint({externalVehicleId:'7',latitude:50,longitude:14,lastGpsAt:'2026-10-24T10:00:00Z',speedKmh:null}).speedKmh,null);
});
test('T04: GPS cursor covers >6000 points without first-page truncation',async()=>{
 const db=fixtureDb();const stmt=db.sqlite.prepare('INSERT INTO vehicle_tracking_gps_points(id,vehicle_key,latitude,longitude,speed_kmh,recorded_at,gps_valid) VALUES(?,?,?,?,?,?,1)');
 for(let i=0;i<6101;i++)stmt.run(String(i).padStart(5,'0'),'7',50,14,0,new Date(baseTime+i*1000).toISOString());
 let cursor=null,seen=0;do{const page=await loadJobTrackingInterval(db,{vehicleKey:'7',from:'2026-10-24T09:00:00Z',to:'2026-10-24T13:00:00Z',cursor,now:new Date('2026-10-25')});seen+=page.points.length;cursor=page.nextCursor;}while(cursor);
 assert.equal(seen,6101);db.sqlite.close();
});
test('P09/P11/P13: authoritative decreases, negative/unknown balances and protected states',()=>{
 const row={PriceWithTax:'12100',AmountPaid:'3000',AmountPaidProformaInvoice:'0',RemainToPay:'9100',IsPaid:false};
 assert.equal(invoiceAccountingState(row,{modelVerified:true}).paid,'3000');assert.equal(invoiceAccountingState({...row,RemainToPay:null},{modelVerified:true}).remaining,null);
 assert.equal(invoiceAccountingState({...row,RemainToPay:'-10'},{modelVerified:true}).accountingStatus,'overpaid');
 assert.equal(invoiceAccountingState({...row,RemainToPay:'1.99',IsPaid:true},{modelVerified:true}).conflict,false);
 assert.equal(invoiceAccountingState({...row,PriceWithTax:'-100'},{modelVerified:true}).accountingStatus,'accounting_review');
 assert.equal(invoiceAccountingState(row,{modelVerified:true,protectedStatus:'disputed'}).status,'disputed');
});
function paymentFixture(db){
 const allocation={allocationId:'a1',transactionId:'tx',invoiceSourceId:'10',companyId:'1',currencyId:'2',bankAccount:'bank',bankDate:'2026-10-24',amount:'2500',transactionAmount:'7500',revision:'r1',confirmedBy:'user',confirmedAt:'2026-10-24',confirmationMethod:'human',installation:'test'};
 const contract={...mapping,entities:{...mapping.entities,InvoiceIssued:{fixedCompanyId:'1'}},writer:{permissionsVerified:true,recalculationVerified:true,lookupVerified:true,accountingModelVerified:true,decimalStringAccepted:true,externalKeyFilterVerified:true,invoicePaymentFilterVerified:true,templateVerified:true,externalKeyWritable:true,receivedDirectionId:'3',currencyPrecision:{'2':2},testEvidence:{create:'proof',partial:'proof',multiple:'proof',lastReversal:'proof'},exclusiveSources:[{companyId:'1',bankAccount:'bank',source:'KB',validFrom:'2020-01-01',writer:'smart',evidenceId:'proof'}]}};
 const env={...environment(db,contract),VISTOS_PAYMENT_WRITE_ENABLED:'true'};
 return {allocation,contract,env};
}
async function seedCommand(db,p){p.fingerprint=await fingerprint(p);db.sqlite.prepare(`INSERT INTO vistos_allocation_confirmations(allocation_id,transaction_id,revision,installation,company_id,invoice_source_id,bank_account,currency_id,amount_decimal,transaction_amount_decimal,bank_date,confirmation_method,confirmed_by,confirmed_at,fingerprint,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(p.allocationId,p.transactionId,p.revision,'test',p.companyId,p.invoiceSourceId,p.bankAccount,p.currencyId,p.amount,p.transactionAmount,p.bankDate,p.confirmationMethod,p.confirmedBy,p.confirmedAt,p.fingerprint,JSON.stringify(p));
 db.sqlite.prepare(`INSERT INTO vistos_payment_commands(id,allocation_id,revision,operation_kind,installation,company_id,invoice_source_id,state,fingerprint,payload_json,created_at,updated_at) VALUES('cmd',?,?, 'create','test',?,?,'ready',?,?,?,?)`).run(p.allocationId,p.revision,p.companyId,p.invoiceSourceId,p.fingerprint,JSON.stringify(p),'2026-10-24','2026-10-24');}
test('P01/P04/P05/P06/S03: one create despite timeout, summary pending, verification with writer off',async()=>{
 const db=fixtureDb(),{allocation:p,env}=paymentFixture(db);await seedCommand(db,p);let sends=0,payment=null,summary=false;
 const provider={async read(entity){return entity==='Payment'?payment:{Id:10,Currency_FK:2,PriceWithTax:'12100',AmountPaid:'4000',AmountPaidProformaInvoice:'0',RemainToPay:'8100'};},async find(){return payment;},async template(){return {};},async send(payload){sends++;assert.equal(payload.CreateParam.Data.Amount,'2500');payment={Id:99,InvoiceIssued_FK:10,Currency_FK:2,BusinessUnit_FK:1,Amount:'2500',Date:p.bankDate,PaymentType_FK:3,Ext_ID:'smart:a1',AdvancedPayment:false};throw Error('response lost');},async verifySummary(){return summary;}};
 let r=await processPaymentCommand(env,'cmd',{provider});assert.equal(r.state,'outcome_unknown');assert.equal(sends,1);
 r=await processPaymentCommand({...env,VISTOS_PAYMENT_WRITE_ENABLED:'false'},'cmd',{provider});assert.equal(r.state,'recalculation_pending');assert.equal(sends,1);
 summary=true;r=await processPaymentCommand({...env,VISTOS_PAYMENT_WRITE_ENABLED:'false'},'cmd',{provider});assert.equal(r.state,'confirmed');assert.equal(sends,1);
 await processPaymentCommand(env,'cmd',{provider});assert.equal(sends,1);db.sqlite.close();
});
test('P07/P10/P15/P16: no unconfirmed write, explicit currency/company/source policy and finance mutex',async()=>{
 const db=fixtureDb(),{allocation,contract,env}=paymentFixture(db);
 assert.equal(writeGate(env,contract,allocation).enabled,true);assert.equal(writeGate({},contract,allocation).enabled,false);
 assert.equal(writeGate(env,contract,{...allocation,confirmedBy:null}).enabled,false);assert.equal(writeGate(env,contract,{...allocation,currencyId:'9'}).enabled,false);
 assert.equal(writeGate(env,contract,{...allocation,companyId:'2'}).enabled,false);
 await acquireFinanceLocks(db,['invoice:1'],'a');await assert.rejects(acquireFinanceLocks(db,['invoice:1'],'b'),e=>e.code==='finance_resource_busy');db.sqlite.close();
});

test('P02/P03/P15/P16: split allocations reserve actual bank amount atomically, not match score',async()=>{
 const db=fixtureDb(),{contract}=paymentFixture(db);contract.bank={verified:true,source:'KB',accountPath:'account',amountPath:'amount',currencyPath:'currency',currencyIds:{CZK:'2'}};
 const env=environment(db,contract),scope={db,installation:'test',companies:['1'],user:{id:'u'}};
 db.sqlite.prepare('INSERT INTO receivable_payment_transactions VALUES(?,?,?,?,?,?)').run('tx',JSON.stringify({account:'bank',amount:'7500',currency:'CZK'}),'kb-1','2026-10-24','CZK','KB');
 for(const [id,invoice]of [['a','10'],['b','11'],['c','12']]){
  db.sqlite.prepare('INSERT INTO receivable_invoices VALUES(?,?)').run('local-'+invoice,invoice);
  db.sqlite.prepare('INSERT INTO receivable_payment_matches VALUES(?,?,?)').run(id,'local-'+invoice,'tx');
  await (await import('../functions/_lib/vistos-integration-store.js')).persistVerifiedSourceReadback(db,'test','InvoiceIssued',{Id:Number(invoice),Currency_FK:2,Modified:'2026-10-24T10:00:00Z'},contract);
 }
 const confirm=(id,invoice,amount)=>confirmAllocation(scope,{allocationId:id,invoiceSourceId:invoice,companyId:'1',currencyId:'2',amount,bankAccount:'bank',revision:'rev-'+id});
 const one=await confirm('a','10','2500');const two=await confirm('b','11','5000');assert.equal(one.amount,'2500');assert.equal(two.amount,'5000');
 await assert.rejects(confirm('c','12','0.01'),e=>e.code==='transaction_overallocated');
 assert.equal((await confirm('a','10','2500')).revision,'rev-a');
 const {previewTransfers}=await import('../functions/_lib/vistos-payment-outbox.js');await assert.rejects(previewTransfers(scope,['c'],env),e=>e.code==='allocation_not_confirmed');
 db.sqlite.close();
});

test('P09/P14/P17: owned Save/Remove are separate commands, conflicts and lost answers never retry',async()=>{
 const {preparePaymentCorrection,submitPaymentCorrection}=await import('../functions/_lib/vistos-payment-outbox.js');
 const db=fixtureDb(),{allocation:p,contract,env}=paymentFixture(db);
 contract.writer.testEvidence={...contract.writer.testEvidence,amount:'proof',rebind:'proof',remove:'proof'};contract.writer.removalScopeEvidence={verified:true,evidenceId:'proof',companyIds:['1']};environment(db,contract);
 await seedCommand(db,p);db.sqlite.prepare("UPDATE vistos_payment_commands SET state='confirmed',payment_source_id='99' WHERE id='cmd'").run();
 const scope={db,installation:'test',companies:['1'],user:{id:'user'}};
 let payment={Id:99,InvoiceIssued_FK:10,Currency_FK:2,BusinessUnit_FK:1,Amount:'2500',Date:p.bankDate,PaymentType_FK:3,Ext_ID:'smart:a1',AdvancedPayment:false},sends=0,removed=false,verifiedInvoices=[];
 const provider={async read(entity,id){return entity==='Payment'?payment:{Id:Number(id),Currency_FK:2,PriceWithTax:'12100',AmountPaid:removed?'0':payment.Amount,AmountPaidProformaInvoice:'0',RemainToPay:removed?'12100':'9100'};},async find(){return payment;},async send(payload){sends++;if(payload.SaveParam){assert.deepEqual(payload.SaveParam.ColNameToUpdate,[payload.SaveParam.Data.Amount?'Amount':'InvoiceIssued_FK']);Object.assign(payment,payload.SaveParam.Data);}else{assert.equal(payload.RemoveParam.EntityName,'Payment');removed=true;}throw Error('answer lost');},async verifySummary(invoice){verifiedInvoices.push(String(invoice.Id));return true;},async removalEvidence(){return removed;}};
 for(const input of [{operation:'amount',amount:'2000',reason:'fixture correction'},{operation:'rebind',invoiceSourceId:'11',reason:'fixture rebind'},{operation:'remove',reason:'fixture reversal'}]){
  const latest=db.sqlite.prepare("SELECT id FROM vistos_payment_commands WHERE state='confirmed' ORDER BY created_at DESC LIMIT 1").get();
  const preview=await preparePaymentCorrection(scope,latest.id,input,env,{provider});
  const submitted=await submitPaymentCorrection(scope,latest.id,{...input,fingerprint:preview.fingerprint},env,{provider});
  const before=sends;let result=await processPaymentCommand(env,submitted.id,{provider});assert.equal(result.state,'outcome_unknown');assert.equal(sends,before+1);
  result=await processPaymentCommand({...env,VISTOS_PAYMENT_WRITE_ENABLED:'false'},submitted.id,{provider});assert.equal(result.state,input.operation==='remove'?'reversed_confirmed':'confirmed');assert.equal(sends,before+1);
 }
 assert.ok(verifiedInvoices.includes('10')&&verifiedInvoices.includes('11'));assert.equal(db.sqlite.prepare('SELECT status FROM vistos_allocation_confirmations').get().status,'reversed');
 db.sqlite.close();
});

test('P04: concurrent workers claim one sender',async()=>{
 const db=fixtureDb(),{allocation:p,env}=paymentFixture(db);await seedCommand(db,p);let sends=0,release;
 const paused=new Promise(r=>release=r);let payment=null;
 const provider={async find(){return payment;},async template(){return{};},async read(entity){return entity==='Payment'?payment:{Id:10,Currency_FK:2,PriceWithTax:'12100',AmountPaid:'0',AmountPaidProformaInvoice:'0',RemainToPay:'12100'};},async send(){sends++;await paused;payment={Id:99,InvoiceIssued_FK:10,Currency_FK:2,BusinessUnit_FK:1,Amount:p.amount,Date:p.bankDate,PaymentType_FK:3,Ext_ID:'smart:a1',AdvancedPayment:false};return {data:{EntityID:99}};},async verifySummary(){return true;}};
 const first=processPaymentCommand(env,'cmd',{provider});while(!sends)await new Promise(r=>setTimeout(r,1));
 const second=await processPaymentCommand(env,'cmd',{provider});assert.equal(second.busy,true);release();assert.equal((await first).state,'confirmed');assert.equal(sends,1);db.sqlite.close();
});

test('P12/S02: transport rejects non-success 2xx/proxy; shared refresh and scoped cookie rotation',async()=>{
 const {fetchVistosExecute,loginVistosExecute,executeVistosSession}=await import('../functions/_lib/vistos-execute-client.js');
 const saved=globalThis.fetch,env={VISTOS_API_BASE_URL:'https://vistos.example',VISTOS_API_USERNAME:'fixture',VISTOS_API_PASSWORD:'fixture',VISTOS_EXACT_DECIMALS:true};
 try{
  for(const status of [200,210,212,214,215,220]){globalThis.fetch=async()=>new Response(JSON.stringify({status:status===214?'Unauthenticated':'Error'}),{status});await assert.rejects(fetchVistosExecute(env,'GetByIdParam',{}),e=>e.upstreamStatus===status);}
  globalThis.fetch=async()=>new Response('<html>proxy</html>');await assert.rejects(fetchVistosExecute(env,'CreateParam',{}),e=>e.code==='vistos_api_invalid_json');
  let refreshed=false,refreshes=0,calls=0;
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);if(body.LoginParam)return new Response('{"status":"OK"}',{headers:{'Set-Cookie':'VistosAccessToken_test=old; Path=/API; Secure; HttpOnly'}});
   if(body.RefreshAuthTokenParam){refreshes++;await new Promise(r=>setTimeout(r,5));refreshed=true;return new Response('{"status":"OK"}',{headers:{'Set-Cookie':'VistosAccessToken_test=new; Path=/API; Secure; HttpOnly'}});}
   calls++;if(!refreshed)return new Response('{"status":"Unauthenticated"}',{status:214});assert.match(options.headers.Cookie,/VistosAccessToken_test=new/);return new Response('{"status":"OK","data":{"Id":1,"Amount":1.10}}');};
  const session=await loginVistosExecute(env);const responses=await Promise.all([executeVistosSession(env,session,'GetByIdParam',{EntityId:1}),executeVistosSession(env,session,'GetByIdParam',{EntityId:2})]);assert.equal(refreshes,1);assert.equal(calls,4);assert.equal(responses[0].body.data.Amount,'1.10');
  refreshed=false;await assert.rejects(executeVistosSession(env,session,'CreateParam',{}, {readOnly:false}));assert.equal(refreshes,1);
 }finally{globalThis.fetch=saved;}
});


test('J04/J05: reconciliation compares IDs and hashes without deleting an unseen record',async()=>{
 const db=fixtureDb(),env=environment(db);let rows=[{Id:1,Number:'one',Modified:'2026-10-25T01:00:00Z'},{Id:2,Number:'two',Modified:'2026-10-25T01:00:00Z'}];
 const source=async()=>({rows,filtered:rows.length,countEvidence:{filteredReported:true}});
 await syncVistosBatch(env,{installation:'test',entity:'ServiceList',source});
 rows=[{Id:1,Number:'changed',Modified:'2026-10-25T02:00:00Z'},{Id:3,Number:'three',Modified:'2026-10-25T02:00:00Z'}];
 const result=await syncVistosBatch(env,{installation:'test',entity:'ServiceList',mode:'reconciliation',source});
 assert.equal(result.comparison.added,1);assert.equal(result.comparison.changed,1);assert.equal(result.comparison.missing,1);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM vistos_source_records').get().n,3);db.sqlite.close();
});
test('P04: worker losing its lease during preflight cannot send',async()=>{
 const db=fixtureDb(),{env,allocation:p}=paymentFixture(db);await seedCommand(db,p);let sends=0;
 const provider={async find(){return null;},async read(){return {Id:10,Currency_FK:2,PriceWithTax:'12100',AmountPaid:'0',AmountPaidProformaInvoice:'0',RemainToPay:'12100'};},async template(){db.sqlite.prepare("UPDATE vistos_payment_commands SET lease_owner='new-worker'").run();return {};},async send(){sends++;}};
 const result=await processPaymentCommand(env,'cmd',{provider});assert.equal(result.errorCode,'payment_worker_lease_lost');assert.equal(sends,0);db.sqlite.close();
});


test('J10/S01: authenticated backend paging/history and forbidden finance/company',async()=>{
 const db=fixtureDb(),env={...environment(db),AUTH_MODE:'mock'};
 const user={id:'fixture-user',email:'fixture@example.invalid',role:'admin',permissions:[{moduleId:'jobs',action:'view',allowed:true}]};env.AUTH_USERS_JSON=JSON.stringify([user]);
 db.sqlite.prepare('INSERT INTO vistos_company_access VALUES(?,?,?)').run(user.id,'test','1');
 const cookie=(await createSessionCookie(env,user)).split(';')[0];
 const call=(action,path,params={})=>handleVistosRequest({env,request:new Request('https://fixture.invalid'+path,{headers:{Cookie:cookie}}),params},action);
 assert.equal((await call('transfer-list','/api/receivables/vistos/payment-transfers')).status,403);
 assert.equal((await call('jobs-list','/api/jobs?company=2')).status,403);
 await syncVistosBatch(env,{installation:'test',entity:'ServiceList',source:async()=>({rows:Array.from({length:61},(_,i)=>({Id:i+1,Number:'fixture-'+i,Modified:'2026-10-25T01:00:00Z'})),filtered:61,countEvidence:{filteredReported:true}})});
 const response=await call('jobs-list','/api/jobs?period=all&pageSize=25&page=3');assert.equal(response.status,200);assert.equal((await response.json()).rows.length,11);
 const id=db.sqlite.prepare('SELECT id FROM vistos_source_records LIMIT 1').get().id;
 const history=await call('job-history','/api/jobs/'+id+'/history',{id});assert.equal(history.status,200);assert.equal((await history.json()).events.length,1);
 const contract={...mapping,entities:{...mapping.entities,InvoiceIssued:{fixedCompanyId:'1'}},bank:{verified:true,source:'KB',amountPath:'amount',currencyPath:'currency',accountPath:'account',currencyIds:{CZK:'2'}}};environment(db,contract);
 await persistVerifiedSourceReadback(db,'test','InvoiceIssued',{Id:10,Modified:'2026-10-25T01:00:00Z',AmountPaid:'0',RemainToPay:'100'},contract);
 db.sqlite.exec("ALTER TABLE receivable_payment_matches ADD COLUMN matched_amount REAL;INSERT INTO receivable_invoices VALUES('invoice','10');INSERT INTO receivable_payment_matches VALUES('match','invoice','tx',25);");
 db.sqlite.prepare('INSERT INTO receivable_payment_transactions VALUES(?,?,?,?,?,?)').run('tx',JSON.stringify({amount:'100.00',currency:'CZK',account:'fixture-bank'}),'bank-id','2026-10-24','CZK','KB');
 user.permissions.push({moduleId:'jobs',action:'view_finance',allowed:true});env.AUTH_USERS_JSON=JSON.stringify([user]);
 const transfers=await call('transfer-list','/api/receivables/vistos/payment-transfers');assert.equal(transfers.status,200);const listed=await transfers.json();assert.equal(listed.candidates.length,1);assert.equal(listed.candidates[0].companyId,'1');assert.equal(listed.candidates[0].transactionAmount,'100.00');db.sqlite.close();
});

test('Jobs detail-backed import retains list fields, checks identity, and rolls back a failed page',async()=>{
 const db=fixtureDb(),contract=structuredClone(mapping);
 contract.entities.ServiceList={...contract.entities.ServiceList,detailOnImport:true,detailVerified:true,companyField:'Issuer_FK'};
 delete contract.entities.ServiceList.fixedCompanyId;
 const env=environment(db,contract),source=async()=>({rows:[{Id:1,Number:'Z-1'},{Id:2,Number:'Z-2'}],filtered:2,countEvidence:{filteredReported:true}});
 let mismatch=true;
 const detailSource=async id=>({Id:mismatch&&id==='2'?99:Number(id),Issuer_FK:1,Vozidlo_FK:'22',Auto_FK:999,AllocatedVehicle:[998],Modified:'2026-10-25T09:00:00Z'});
 await assert.rejects(syncVistosBatch(env,{installation:'test',entity:'ServiceList',source,detailSource}),e=>e.code==='vistos_detail_identity_mismatch');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM vistos_source_records').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT offset FROM vistos_sync_checkpoints').get().offset,0);
 mismatch=false;await syncVistosBatch(env,{installation:'test',entity:'ServiceList',source,detailSource});
 const rows=db.sqlite.prepare('SELECT * FROM vistos_source_records ORDER BY source_id').all();
 assert.equal(rows.length,2);assert.equal(rows[0].company_id,'1');assert.equal(rows[0].number,'Z-1');assert.ok(rows[0].detail_at);assert.equal(rows[0].vehicle_ids_json,'["22"]');
 const listAgain=await normalizeSourceRecord({Id:1,Number:'Z-1',Modified:'2026-10-25T09:00:00Z'},{installation:'test',entity:'ServiceList',contract,previous:rows[0]});
 assert.equal(listAgain.company_id,'1');assert.equal(listAgain.vehicle_ids_json,'["22"]');
 db.sqlite.close();
});

test('Jobs items inherit company from exact parent in the same installation, never a customer',async()=>{
 const {normalizeImportedRecord}=await import('../functions/_lib/vistos-integration-store.js');
 const db=fixtureDb(),contract=structuredClone(mapping);
 contract.entities.ServiceListItem={parentField:'ServiceList_FK',inheritCompanyFromParent:true,verifiedFields:['ServiceList_FK']};
 const env=environment(db,contract);
 await persistVerifiedSourceReadback(db,'other','ServiceList',{Id:8,Number:'foreign'},contract);
 const options={installation:'test',entity:'ServiceListItem',contract};
 const unknown=await normalizeImportedRecord(db,{Id:1,ServiceList_FK_RecordId:8,CustomerCompany_FK_RecordId:1},options);
 assert.equal(unknown.company_id,null);assert.equal(unknown.parent_id,'8');
 await persistVerifiedSourceReadback(db,'test','ServiceList',{Id:8,Number:'own'},contract);
 const known=await normalizeImportedRecord(db,{Id:1,ServiceList_FK_RecordId:8},options);
 assert.equal(known.company_id,'1');assert.notEqual(known.fingerprint,unknown.fingerprint);
 db.sqlite.close();
});

test('Jobs tracking traverses neighbouring source jobs through the temporal resolver',async()=>{
 const {enrichJobExecution}=await import('../functions/_lib/vistos-tracking-enrichment.js');
 const db=fixtureDb(),env=environment(db);
 db.sqlite.exec('CREATE TABLE fleet_vehicle_external_aliases(id TEXT,external_system TEXT,external_key TEXT,vehicle_id TEXT,status TEXT,valid_from TEXT,valid_to TEXT,metadata_json TEXT)');
 for(const [id,system,key]of [['v','vistos','113'],['t','tcars','7']])db.sqlite.prepare('INSERT INTO fleet_vehicle_external_aliases VALUES(?,?,?,?,?,?,?,?)').run(id,system,key,'car','active','2020-01-01T00:00:00Z',null,JSON.stringify({verified:true,source_system:system}));
 const contract=structuredClone(mapping);contract.entities.ServiceList.verifiedFields.push('DateOfRealization');contract.entities.ServiceList.plannedField='DateOfRealization';
 contract.tracking={tripPrivacyVerified:true,tripCompletenessVerified:true,timeZoneEvidenceId:'fixture',timeZone:'Europe/Prague'};
 await persistVerifiedSourceReadback(db,'test','ServiceList',{Id:1,DateOfRealization:'2026-10-24',Vozidlo_FK:113},contract);
 const job=db.sqlite.prepare('SELECT * FROM vistos_source_records').get();
 const result=await enrichJobExecution(env,job,contract,{now:new Date('2026-10-25'),tripReader:async()=>[]});
 assert.ok(result);const row=db.sqlite.prepare('SELECT * FROM job_execution_evidence').get();
 assert.equal(row.assignment_status,'unavailable');assert.ok(JSON.parse(row.evidence_json).reasons.includes('history_unavailable'));assert.equal(row.use_for_payroll,0);
 db.sqlite.close();
});

test('priority headers validate detail wall-time and parent items retain isolated coverage',async()=>{
 const db=fixtureDb();const contract=structuredClone(mapping);
 Object.assign(contract.entities.ServiceList,{detailOnImport:true,detailVerified:true,priorityFilterVerified:true,priorityWindow:{from:'2026-10-20T00:00:00',to:'2026-10-27T00:00:00'}});
 contract.entities.ServiceListItem={readVerified:true,orderVerified:true,detailVerified:true,detailOnImport:true,parentFilterVerified:true,parentField:'ServiceList_FK',inheritCompanyFromParent:true,idOrder:'Id asc',verifiedFields:['ServiceList_FK']};
 const env=environment(db,contract),page=rows=>({filtered:rows.length,countEvidence:{filteredReported:true},rows});
 const header=()=>syncVistosBatch(env,{installation:'test',entity:'ServiceList',mode:'priority_backfill',source:async({filter})=>{assert.deepEqual(filter,{Modified_From:contract.entities.ServiceList.priorityWindow.from,Modified_To:contract.entities.ServiceList.priorityWindow.to});return page([{Id:10}]);},detailSource:async()=>({Id:10,Number:'recent',Modified:'2026-10-24T12:30:00.123'})});
 const result=await header();assert.equal(result.offset,1);assert.equal(result.completeImport,false);assert.equal((await header()).alreadyRead,true);
 assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM vistos_sync_checkpoints WHERE mode='initial_backfill'").get().n,0);
 const items=detail=>syncVistosBatch(env,{installation:'test',entity:'ServiceListItem',mode:'parent:10',source:async({filter})=>{assert.deepEqual(filter,{ServiceList_FK:[10]});return page([{Id:20,ServiceList_FK:10}]);},detailSource:async()=>detail});
 await assert.rejects(items({Id:20,ServiceList_FK:11}),e=>e.code==='vistos_parent_filter_ignored');
 assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM vistos_source_records WHERE entity='ServiceListItem'").get().n,0);
 await items({Id:20,ServiceList_FK:10,Modified:'2026-10-24T12:30:00.123'});
 assert.equal(db.sqlite.prepare("SELECT company_id FROM vistos_source_records WHERE entity='ServiceListItem'").get().company_id,'1');
 assert.equal((await items({Id:20,ServiceList_FK:10})).alreadyRead,true);
 db.sqlite.prepare("UPDATE vistos_source_records SET fingerprint='changed-parent' WHERE source_id='10'").run();
 await items({Id:20,ServiceList_FK:10,Modified:'2026-10-24T12:30:00.123'});
 const refreshed=db.sqlite.prepare("SELECT generation,comparison_json FROM vistos_sync_checkpoints WHERE mode='parent:10'").get();
 assert.equal(refreshed.generation,2);assert.equal(JSON.parse(refreshed.comparison_json).parentFingerprint,'changed-parent');
 db.sqlite.prepare("UPDATE vistos_sync_checkpoints SET last_success_at='2020-01-01T00:00:00Z' WHERE mode='parent:10'").run();
 await items({Id:20,ServiceList_FK:10,Modified:'2026-10-24T12:30:00.123'});
 assert.equal(db.sqlite.prepare("SELECT generation FROM vistos_sync_checkpoints WHERE mode='parent:10'").get().generation,3);
 contract.entities.ServiceList.priorityWindow={from:'2026-10-25T00:00:00',to:'2026-10-27T00:00:00'};environment(db,contract);
 await assert.rejects(header(),e=>e.code==='vistos_modified_filter_ignored');
 assert.equal(db.sqlite.prepare("SELECT offset FROM vistos_sync_checkpoints WHERE mode='priority_backfill'").get().offset,0);
 assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM vistos_source_records WHERE entity='ServiceList'").get().n,1);
 db.sqlite.close();
});

function queueFixture(count=3){
 const db=fixtureDb(),contract=structuredClone(mapping);
 contract.entities.ServiceListItem={readVerified:true,parentFilterVerified:true};
 const insert=db.sqlite.prepare("INSERT INTO vistos_source_records(id,installation,entity,source_id,company_id,number,fields_json,fingerprint,received_at,mapping_version) VALUES(?,'test','ServiceList',?,?,'JOB','{}',?,'2026-10-26T01:00:00Z','test')");
 for(let i=1;i<=count;i++)insert.run(String(i),String(i),'1','fp'+i);
 insert.run('foreign','9999','other','private');
 return {db,contract};
}
test('jobs queue drains multiple parents, bounds backlog, scopes companies and joins overlapping ticks',async()=>{
 const {db,contract}=queueFixture(81);let clock=1000000;const calls=[];
 const options={deadline:clock+80000,clock:()=>clock,maxBatches:4,syncBatch:async(env,args)=>{
  assert.equal(env.syncRequestDeadline,1080000);calls.push(args);
  assert.deepEqual(await runJobsReadQueue({},db,contract,{deadline:clock+80000,clock:()=>clock}),[]);
  clock+=1000;return {status:'compared'};
 }};
 const result=await runJobsReadQueue({},db,contract,options);
 assert.equal(result.length,4);assert.ok(calls.every(c=>c.entity==='ServiceListItem'&&c.mode!=='parent:9999'));
 assert.equal(new Set(calls.map(c=>c.mode)).size,4);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM vistos_sync_entity_locks').get().n,0);
 db.sqlite.close();
});
test('jobs queue shares a run deadline and stops on provider or capacity limits',async()=>{
 for(const code of ['vistos_request_budget_exhausted','vistos_target_capacity_exceeded']){
  const {db,contract}=queueFixture();const calls=[];
  const reads=await runJobsReadQueue({},db,contract,{syncBatch:async(_env,args)=>{calls.push(args);throw Object.assign(Error(code),{code});}});
  assert.equal(calls.length,1);assert.equal(reads[0].code,code);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM vistos_sync_entity_locks').get().n,0);db.sqlite.close();
 }
 const {db,contract}=queueFixture();let clock=1000000,calls=0;
 await runJobsReadQueue({},db,contract,{deadline:clock+80000,clock:()=>clock,syncBatch:async()=>{calls++;clock+=75000;return {status:'partial'};}});
 assert.equal(calls,1);db.sqlite.close();
});
test('jobs progress remains visible with empty filters and cannot include another company',async()=>{
 const {db,contract}=queueFixture(3);environment(db,contract);
 db.sqlite.prepare("UPDATE vistos_source_records SET received_at='2099-01-01T00:00:00Z' WHERE company_id='other'").run();
 const data=await listJobs({db,installation:'test',companies:['1'],rights:{}},new URL('https://test/api/jobs?period=all&status=done'));
 assert.equal(data.rows.length,0);assert.equal(data.stats.total,0);
 assert.deepEqual({...data.importProgress},{total:3,lastReceivedAt:'2026-10-26T01:00:00Z',itemsPending:3});db.sqlite.close();
});


test('Job items: paging beyond 100, company isolation and explicit scoped refresh permission',async()=>{
 const db=fixtureDb(),env={...environment(db),AUTH_MODE:'mock'};
 const user={id:'items-user',role:'admin',permissions:[]};env.AUTH_USERS_JSON=JSON.stringify([user]);
 db.sqlite.prepare('INSERT INTO vistos_company_access VALUES(?,?,?)').run(user.id,'test','1');
 const cookie=(await createSessionCookie(env,user)).split(';')[0];
 const call=(action,id='parent',query='',method='GET',body={})=>handleVistosRequest({env,params:{id},request:new Request('https://fixture.invalid/api/jobs/'+id+query,{method,headers:{Cookie:cookie},...(method==='POST'?{body:JSON.stringify(body)}:{})})},action);
 const insert=db.sqlite.prepare("INSERT INTO vistos_source_records(id,installation,entity,source_id,company_id,parent_id,number,fields_json,fingerprint,received_at,mapping_version) VALUES(?,'test',?,?,?,?,?,'{}','fp','2026-10-26T01:00:00Z','test')");
 insert.run('parent','ServiceList','1','1',null,'JOB');insert.run('foreign','ServiceList','2','2',null,'OTHER');
 for(let i=0;i<101;i++)insert.run('item-'+i,'ServiceListItem',String(i+1),'1','1','ITEM');
 insert.run('foreign-item','ServiceListItem','102','2','1','SECRET');
 const first=await (await call('job-detail')).json(),second=await (await call('job-detail','parent','?itemsPage=2')).json();
 assert.equal(first.items.length,100);assert.equal(first.itemsPagination.total,101);assert.equal(first.itemsPagination.hasNext,true);
 assert.equal(second.items.length,1);assert.equal(second.itemsPagination.hasNext,false);assert.ok(!first.items.some(i=>i.id==='foreign-item'));
 assert.equal((await call('job-detail','parent','?itemsPage=-1')).status,400);
 assert.equal((await call('job-items-refresh','parent','','POST')).status,403);
 user.permissions.push({moduleId:'integrations',action:'manage',allowed:true});env.AUTH_USERS_JSON=JSON.stringify([user]);
 assert.equal((await call('job-items-refresh','foreign','','POST')).status,404);
 assert.equal((await call('job-items-refresh')).status,405);
 // Valid permission reaches the existing sync gate; caller cannot redirect to finance or a different parent.
 env.VISTOS_READ_SYNC_ENABLED='false';const disabled=await call('job-items-refresh','parent','','POST',{entity:'Payment',mode:'parent:2'});
 assert.equal(disabled.status,503);assert.equal((await disabled.json()).code,'vistos_read_sync_disabled');db.sqlite.close();
});
