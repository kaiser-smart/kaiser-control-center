import assert from 'node:assert/strict';
import {auditVistosPaymentData, paymentFieldCoverage} from '../functions/_lib/receivables-vistos-payment-audit.js';
const original=globalThis.fetch;const calls=[];
const env={VISTOS_API_BASE_URL:'https://vistos.test',VISTOS_API_USERNAME:'test',VISTOS_API_PASSWORD:'test'};
globalThis.fetch=async (_url,options)=>{
 const body=JSON.parse(options.body);calls.push(body);
 if(body.LoginParam)return new Response('{"status":"OK"}',{headers:{'set-cookie':'VistosAccessToken=test; Path=/'}});
 if(body.GetSchemaEntity)return Response.json({status:'OK',data:{Columns:[{ColumnName:'Id'},{ColumnName:'AmountPaid'},{ColumnName:'PaidDate'}]}});
 if(body.GetPageParam?.EntityName==='BankPayment')return new Response('{"status":"Unauthorized"}',{status:215});
 assert.ok(body.GetPageParam,'only read methods allowed');
 if(body.GetPageParam.EntityName==='DbObject')return Response.json({status:'OK',data:{recordsFiltered:1,recordsTotal:1,data:[{Id:1,Name:'BankPayment'}]}});
 return Response.json({status:'OK',data:{recordsFiltered:1,recordsTotal:1,data:[{Id:12,AmountPaid:0,PaidDate:null,IsPaid:false}]}});
};
try{
 const data=await auditVistosPaymentData(env);
 assert.equal(data.status,'FOUND');assert.ok(data.schema.fields.includes('PaidDate'));
 assert.deepEqual(data.data.coverage.find(x=>x.field==='RemainToPay'),{field:'RemainToPay',sampledRows:1,present:0,nullValues:0,emptyValues:0,nonEmpty:0,nonZeroNumbers:0});
 assert.equal(paymentFieldCoverage([{AmountPaid:0},{AmountPaid:null},{}],['AmountPaid'])[0].nonEmpty,1);
 const denied=await auditVistosPaymentData(env,{section:'entity',entity:'BankPayment'});assert.equal(denied.status,'PERMISSION_DENIED');assert.equal(denied.data.upstreamStatus,215);
 const count=calls.length;assert.equal((await auditVistosPaymentData(env,{section:'entity',entity:'Users'})).status,'INVALID_REQUEST');assert.equal(calls.length,count);
 assert.equal((await auditVistosPaymentData(env,{section:'catalog'})).complete,true);
 console.log('Read-only payment audit: coverage, denied access, catalog and method boundary passed');
}finally{globalThis.fetch=original;}
