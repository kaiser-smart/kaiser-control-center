import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditVistosRead,readAuditRecord} from '../functions/_lib/vistos-read-audit.js';
import {vistosPageSortOrder} from '../functions/_lib/vistos-execute-client.js';
import {onRequestGet} from '../functions/api/integrations/vistos/read-audit.js';

test('wire protocol uses the documented SortOrder and detects ignored ordering',async()=>{
  const saved=globalThis.fetch,calls=[];let unordered=false;
  globalThis.fetch=async(url,init)=>{
    const body=JSON.parse(init.body),method=Object.keys(body).find(k=>['LoginParam','GetSchemaEntity','GetPageParam','GetByIdParam'].includes(k));
    assert.ok(method,'never writes to Vistos');calls.push(method);
    if(method==='LoginParam')return Response.json({status:'OK'},{headers:{'Set-Cookie':'VistosAccessToken=fixture; Path=/'}});
    if(method==='GetSchemaEntity')return Response.json({status:'OK',data:{Columns:['Id','Number','AssignedToCompany_FK','PriceWithTax','Phone','Password'].map(ColumnName=>({ColumnName}))}});
    const p=body[method];
    if(method==='GetPageParam') {
      assert.deepEqual(p.SortOrder,[{ColumnName:'Id',Direction:'asc'}]);assert.equal(p.Order,undefined);assert.equal(p.Length,5);
      assert.ok(!p.Columns.some(c=>c.ColumnName==='Password'));
      const rows=Array.from({length:5},(_,i)=>({Id:p.Start+i+1,Number:'hidden',PriceWithTax:123.45,Phone:'private',AssignedToCompany_FK:'company caption',AssignedToCompany_FK_RecordId:7}));
      return Response.json({status:'OK',data:{recordsTotal:100,recordsFiltered:100,data:unordered?rows.reverse():rows}});
    }
    return Response.json({status:'OK',data:{Id:p.EntityId,AssignedToCompany_FK:7,PriceWithTax:123.45,Phone:'private',Password:'secret'}});
  };
  const env={VISTOS_API_BASE_URL:'https://fixture.invalid/installation',VISTOS_API_USERNAME:'test',VISTOS_API_PASSWORD:'test'};
  try{
    const a=await auditVistosRead(env);
    assert.equal(a.order.ascending,true);assert.equal(a.order.repeatStable,true);assert.equal(a.completeImport,false);
    assert.deepEqual(a.detail.references.AssignedToCompany_FK.ids,['7']);
    assert.equal(calls.filter(c=>c==='GetPageParam').length,3);
    assert.ok(!JSON.stringify(a).includes('123.45'));assert.ok(!JSON.stringify(a).includes('private'));assert.ok(!JSON.stringify(a).includes('secret'));assert.ok(!JSON.stringify(a).includes('Password'));
    unordered=true;assert.equal((await auditVistosRead(env)).order.ascending,false);
    const before=calls.length;await assert.rejects(auditVistosRead(env,{entity:'Contact'}));assert.equal(calls.length,before);
    assert.deepEqual(vistosPageSortOrder('Id asc'),[{ColumnName:'Id',Direction:'asc'}]);
    assert.throws(()=>vistosPageSortOrder('Id asc; select 1'));
    assert.throws(()=>vistosPageSortOrder([{ColumnName:'Id',Direction:'asc'},{ColumnName:'Modified',Direction:'asc'}]));
  }finally{globalThis.fetch=saved;}
});

test('audit excludes personal/financial values and cannot be accessed anonymously',async()=>{
 const r=readAuditRecord({Id:1,Password:'x',API_TOKEN:'x',Phone:'secret-phone',Amount:'100.99',Auto_FK_RecordId:2},'list','Payment');
 assert.equal(r.fields.Amount.type,'string');assert.equal(r.fields.Password,undefined);assert.equal(r.fields.API_TOKEN,undefined);
 assert.ok(!JSON.stringify(r).includes('secret-phone'));assert.ok(!JSON.stringify(r).includes('100.99'));
 const result=await onRequestGet({request:new Request('https://fixture.invalid/api/integrations/vistos/read-audit'),env:{AUTH_USERS_JSON:'[]'}});
 assert.equal(result.status,401);
});

test('job metadata must name the expected entity and every column must belong to it',async()=>{
 const saved=globalThis.fetch;let wrongParent=false;
 globalThis.fetch=async(url,init)=>{
  const b=JSON.parse(init.body);
  if(b.LoginParam)return Response.json({status:'OK'},{headers:{'Set-Cookie':'VistosAccessToken=fixture; Path=/'}});
  if(b.GetSchemaEntity)return Response.json({status:'OK',data:{Columns:[{ColumnName:'Id'}]}});
  if(b.GetByIdParam){const p=b.GetByIdParam;return Response.json({status:'OK',data:p.EntityName==='DbObject'?{Id:137,Name:'ServiceList'}:{Id:1}});}
  const p=b.GetPageParam;
  if(p.EntityName==='DbColumn'){
   assert.deepEqual(p.Filter,{DbObject_FK:137});
   return Response.json({status:'OK',data:{recordsTotal:1,recordsFiltered:1,data:[{Id:1,ColumnName:'Issuer_FK',Caption:'Vystavitel',DbObject_FK_RecordId:wrongParent?138:137,ReferenceDbObject_FK:'reference',ReferenceDbObject_FK_RecordId:42}]}});
  }
  return Response.json({status:'OK',data:{recordsTotal:1,recordsFiltered:1,data:p.Start?[]:[{Id:1}]}});
 };
 try{
  const env={VISTOS_API_BASE_URL:'https://fixture.invalid',VISTOS_API_USERNAME:'x',VISTOS_API_PASSWORD:'x'};
  const a=await auditVistosRead(env);assert.equal(a.metadata.status,'read');assert.deepEqual(a.metadata.fields[0].referenceIds,['42']);assert.equal(a.metadata.complete,true);
  assert.ok(a.storageSample.compactFieldBytes[0]<a.storageSample.fieldEnvelopeBytes[0]);
  wrongParent=true;assert.equal((await auditVistosRead(env)).metadata.status,'metadata_filter_unverified');
 }finally{globalThis.fetch=saved;}
});
