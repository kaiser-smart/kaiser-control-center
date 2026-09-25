import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {createReceivablesVistosInvoiceSnapshot as start, advanceReceivablesVistosInvoiceSnapshot as advance,
 createReceivablesVistosInvoiceIncrementalSnapshot as changes, advanceReceivablesVistosInvoiceIncrementalSnapshot as resumeChanges,
 getLatestReceivablesVistosInvoiceSnapshot as read} from '../functions/_lib/receivables-vistos-invoice-snapshot.js';
import {receivablesInvoicePage} from '../src/data/receivablesInvoicePagination.js';

function database() {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../migrations/0028_create_receivable_import_preview.sql',import.meta.url),'utf8'));
 const db = {sqlite, failBatch:false, prepare(sql) {
  let values=[];
  return {sql, bind(...v){assert.ok(v.length<=100,'D1 bound parameter limit');values=v;this.values=v;return this;},
   async first(){return sqlite.prepare(sql).get(...values)||null;},
   async all(){return {results:sqlite.prepare(sql).all(...values)};},
   async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}};
 }, async batch(statements){
  assert.ok(statements.length<1000,'D1 invocation budget');
  sqlite.exec('BEGIN');
  try {const results=[];for (const stmt of statements){results.push(await stmt.run());
   if((this.failBatch || this.failBaseId === stmt.values?.[1]) && stmt.sql.includes('INSERT INTO receivable_import_rows')) {this.failBatch=false;this.failBaseId=null;throw Error('injected storage failure');}}
   sqlite.exec('COMMIT');return results;
  }catch(e){sqlite.exec('ROLLBACK');throw e;}
 }};
 return db;
}
const db=database();const env={DB_ARCHIVE:db,VISTOS_API_BASE_URL:'https://vistos.test',VISTOS_API_USERNAME:'test',VISTOS_API_PASSWORD:'test'};
const now=new Date();const modified=new Date(now.getTime()-60000).toISOString();
const invoice=(id,extra={})=>({Id:String(id),InvoiceNumber:'INV-'+id,Customer_FK:'company-1',IssuedDate:now.toISOString().slice(0,10),DueDate:'2026-12-01',PriceWithTax:100,AmountPaid:0,RemainToPay:100,Modified:modified,...extra});
let source=[invoice(1),invoice(2),invoice(3)];let error=false;let omitCount=false;let emptyPage=false;let calls=[];let pause=null;
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,opts)=>{
 const body=JSON.parse(opts.body);
 if(body.LoginParam)return new Response(JSON.stringify({status:'OK'}),{headers:{'set-cookie':'VistosAccessToken=test; Path=/'}});
 const p=body.GetPageParam;assert.ok(p,'only read operations');assert.equal(p.EntityName,'InvoiceIssued');calls.push(p);
 if(pause)await pause;
 if(error)return new Response(JSON.stringify({status:'ERROR'}),{status:503});
 let selected=source;
 if(p.Filter?.Modified_From)selected=source.filter(x=>new Date(x.Modified)>=new Date(p.Filter.Modified_From)&&new Date(x.Modified)<=new Date(p.Filter.Modified_To));
 return new Response(JSON.stringify({status:'OK',data:{data:emptyPage?[]:selected.slice(p.Start,p.Start+p.Length),recordsTotal:500000,...(omitCount?{}:{recordsFiltered:selected.length})}}));
};
try {
 let result=await start(env,{vistosPageSize:2,maxPages:1});assert.equal(result.snapshot.summary.loadedRows,2);assert.equal(result.snapshot.summary.capped,true);
 const baseId=result.snapshot.batch.id;
 // Refresh resumes the same full batch, never creates a replacement due to age.
 result=await start(env,{vistosPageSize:2});assert.equal(result.snapshot.batch.id,baseId);assert.equal(result.snapshot.summary.loadedRows,3);assert.equal(result.snapshot.batch.status,'snapshot');
 const countCalls=calls.length;await read(env,{page:2,pageSize:2});assert.equal(calls.length,countCalls,'reads never contact source');
 // Broken source must not replace stored records with an empty successful batch.
 error=true;await assert.rejects(changes(env),e=>e.code==='vistos_api_execute_failed');
 assert.equal((await read(env)).snapshot.batch.id,baseId);assert.equal((await read(env)).pagination.totalRows,3);error=false;
 // Missing source counts and premature empty pages must fail closed without moving the checkpoint.
 for (const fault of ['count','empty']) {
  omitCount=fault==='count';emptyPage=fault==='empty';
  await assert.rejects(changes(env),e=>e.code==='receivables_vistos_invoice_count_unverified');
  assert.equal((await read(env)).pagination.totalRows,3);
 }
 omitCount=false;emptyPage=false;
 // A second invocation cannot write during an active lease.
 let release;pause=new Promise(r=>release=r);const pending=changes(env,{periodTo:now.toISOString()});
 await new Promise(r=>setTimeout(r,10));const concurrent=await changes(env);assert.equal(concurrent.syncBusy,true);release();pause=null;await pending;
 // Changed payment, new invoice and cancellation overwrite by source ID.
 source=[invoice(1,{AmountPaid:100,RemainToPay:0,IsPaid:true}),invoice(2,{Status_FK:'cancelled'}),invoice(3),invoice(4)];
 const checkpoint=new Date(now.getTime()-3600000).toISOString();
 result=await changes(env,{checkpoint,periodTo:now.toISOString(),vistosPageSize:2,maxPages:1});assert.equal(result.batch.status,'incremental_running');
 assert.equal((await read(env)).pagination.totalRows,3,'incomplete change scan does not alter current records');
 result=await resumeChanges(env,{vistosPageSize:2});assert.equal(result.batch.status,'incremental');
 let current=await read(env);assert.equal(current.pagination.totalRows,4);assert.equal(current.rows.find(r=>r.invoice.vistoInvoiceId==='1').invoice.paidAmount,100);assert.equal(current.rows.find(r=>r.invoice.vistoInvoiceId==='2').invoice.status,'cancelled');
 assert.equal(current.snapshot.summary.syncedThrough,now.toISOString());
 // Replay overlapping window: no duplicates, same full baseline, same current row count.
 await changes(env,{checkpoint,periodTo:now.toISOString(),maxPages:1});
 current=await read(env);assert.equal(current.pagination.totalRows,4);assert.equal(current.snapshot.batch.id,baseId);
 // Applying a staged page and its checkpoint is atomic too; retry does not re-read Vistos.
 const stableId=db.sqlite.prepare("SELECT id FROM receivable_import_rows WHERE batch_id=? AND row_number=1").get(baseId).id;
 const beforeApply=(await read(env)).snapshot.summary.syncedThrough;
 source[0]=invoice(1,{AmountPaid:90,RemainToPay:10});db.failBaseId=baseId;
 await assert.rejects(changes(env,{checkpoint,periodTo:now.toISOString()}));
 assert.equal((await read(env)).snapshot.summary.syncedThrough,beforeApply);
 assert.equal((await read(env)).rows.find(r=>r.invoice.vistoInvoiceId==='1').invoice.paidAmount,100);
 const callsBeforeApply=calls.length;await resumeChanges(env);assert.equal(calls.length,callsBeforeApply);
 assert.equal((await read(env)).rows.find(r=>r.invoice.vistoInvoiceId==='1').invoice.paidAmount,90);
 assert.equal(db.sqlite.prepare("SELECT id FROM receivable_import_rows WHERE batch_id=? AND row_number=1").get(baseId).id,stableId);
 // Empty verified delta is successful and does not erase source records.
 const future=new Date(now.getTime()+86400000);await changes(env,{checkpoint:future.toISOString(),periodTo:future.toISOString()});assert.equal((await read(env)).pagination.totalRows,4);
 // Failed atomic staging write cannot move checkpoint. Recovery resumes that batch.
 source.push(invoice(5));const before=(await read(env)).snapshot.summary.syncedThrough;db.failBatch=true;
 await assert.rejects(changes(env,{checkpoint,periodTo:now.toISOString()}));assert.equal((await read(env)).snapshot.summary.syncedThrough,before);
 await resumeChanges(env);assert.equal((await read(env)).pagination.totalRows,5);
 // Existing full snapshots remain readable after age >12h; ordinary read never starts a fresh scan.
 db.sqlite.prepare("UPDATE receivable_import_batches SET created_at='2020-01-01' WHERE id=?").run(baseId);const beforeRead=calls.length;await read(env);assert.equal(calls.length,beforeRead);
 const rows=Array.from({length:320},(_,i)=>({id:i+1}));const visited=[];
 for(let page=1;page<=32;page++)visited.push(...receivablesInvoicePage(rows,page).rows.map(r=>r.id));
 assert.deepEqual(visited,rows.map(r=>r.id));assert.deepEqual(receivablesInvoicePage(rows,32).rows.map(r=>r.id),[311,312,313,314,315,316,317,318,319,320]);
 assert.equal(receivablesInvoicePage(rows,33).page,32);assert.equal(receivablesInvoicePage([],1).start,0);
 console.log('invoice sync recovery and all 320 customer invoices: passed');
}finally{globalThis.fetch=originalFetch;db.sqlite.close();}
