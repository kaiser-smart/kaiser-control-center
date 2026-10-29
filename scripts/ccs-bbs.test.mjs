import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {CCS_BBS_DIRECTORY,inspectCcsBbsAccess,listedCcsBbsFiles,downloadListedCcsBbsFile} from '../functions/_lib/ccs-bbs.js';
import {parseCcsBbsTxe,unpackCcsBbsTxe} from '../functions/_lib/ccs-bbs-txe.js';
const credentials={CCS_BBS_USERNAME:'synthetic-user',CCS_BBS_PASSWORD:'synthetic-secret'};
const expectedCustomer='000001';
function record(type,fields={}) {
  const bytes=Buffer.alloc(283,32);bytes[0]=type.charCodeAt(0);
  for(const [pos,text] of Object.entries(fields)) Buffer.from(String(text),'latin1').copy(bytes,Number(pos)-1);
  return bytes;
}
const transaction=(overrides={})=>record('B',{2:'7079320000011234567',24:'TEST123',86:'27102026',94:'0400',98:'N',100:'Ceska Republika',120:'420301000101',132:'Test place',170:'0003',174:'Natural',209:'10.00',217:'Kc',220:'2',221:'1',222:'21.00',227:'12.1000',239:'121.00',251:'21.00',263:'121.00',275:'120000',282:'01',...overrides});
function file(rows=[transaction()],{count=rows.length,total='121.00',header={}}={}) {
  return new Uint8Array(Buffer.concat([record('H',{2:expectedCustomer,8:'4',10:'000001',16:'27102026',24:'Synthetic company',122:'10008',127:'CCS a.s.',...header}),...rows,record('T',{2:String(count),10:total})].flatMap(r=>[r,Buffer.from('\r\n')])));
}
const parse=bytes=>parseCcsBbsTxe(bytes,{expectedCustomer});
test('TXE validates account and control trailer while preserving uncertainty',()=>{
  const result=parse(file());assert.equal(result.control.rowCount,1);assert.equal(result.control.amountCzkMinor,12100);
  const row=result.rows[0];assert.equal(row.cardId,'7079320000011234567');assert.equal(row.localTime,'2026-10-27T04:00:00');assert.equal(row.unit,null);assert.equal(row.utc,null);assert.equal(row.timezone,null);assert.equal(row.amountCurrencyMinor,12100);assert.equal(row.vatCurrencyMinor,2100);assert.equal(row.rawBytes.length,283);
  assert.equal(result.accountingMappingVerified,false);assert.equal(result.coverageVerified,false);assert.equal(result.sourceConnected,false);
});
test('PC Latin 2 uses byte positions including Czech characters',()=>{const row=transaction();row[131]=0xfd;row[132]=0x85;const result=parse(file([row]));assert.equal(result.rows[0].place.slice(0,2),'řů');assert.equal(result.rows[0].productCode,'0003');});
test('fees on the account are retained separately from card purchases',()=>{const fee=transaction({2:'0000000000000000000',209:'0.00',239:'25.00',251:'0.00',263:'25.00'});const result=parse(file([transaction(),fee],{total:'146.00'}));assert.equal(result.rows[1].accountCharge,true);assert.equal(result.rows[0].accountCharge,false);assert.equal(result.control.amountCzkMinor,14600);});
test('negative corrections remain signed and count towards control total',()=>{const result=parse(file([transaction({209:'-10.00',239:'-121.00',251:'-21.00',263:'-121.00'})],{total:'-121.00'}));assert.equal(result.rows[0].amountCzkMinor,-12100);});
test('documented empty files are validated without inventing date coverage',()=>{const result=parse(file([],{total:'0.00'}));assert.deepEqual(result.rows,[]);assert.equal(result.control.verified,true);assert.equal(result.coverageVerified,false);});
test('wrong customer, sender, count or total fails closed',()=>{
  assert.throws(()=>parse(file([],{total:'0.00',header:{2:'000002'}})),{code:'ccs_bbs_customer_mismatch'});
  assert.throws(()=>parse(file([],{total:'0.00',header:{122:'99999'}})),{code:'ccs_bbs_sender_mismatch'});
  assert.throws(()=>parse(file([transaction()],{count:2})),{code:'ccs_bbs_count_mismatch'});
  assert.throws(()=>parse(file([transaction()],{total:'121.01'})),{code:'ccs_bbs_total_mismatch'});
});
test('truncated and reordered records fail before any import',()=>{
  assert.throws(()=>parse(file().slice(0,-20)));
  const bytes=file();bytes[0]=66;assert.throws(()=>parse(bytes),{code:'ccs_bbs_record_order_invalid'});
  assert.throws(()=>parse(new TextEncoder().encode(new TextDecoder().decode(file()).replaceAll('\r\n','\n'))),{code:'ccs_bbs_record_delimiter_invalid'});
});
test('invalid dates, times, cards and VAT flags cannot become transactions',()=>{
  for(const [overrides,code] of [[{86:'31022026'},'ccs_bbs_date_invalid'],[{94:'2460'},'ccs_bbs_time_invalid'],[{2:'not-a-card         '},'ccs_bbs_card_invalid'],[{221:'8'},'ccs_bbs_vat_flag_unknown']])assert.throws(()=>parse(file([transaction(overrides)])),{code});
});
test('documented appended columns and DOS EOF are preserved',()=>{
  const base=file();const parts=[...Buffer.from(base).toString('latin1').split('\r\n').filter(Boolean)];parts[1]+='EXTRA';const bytes=new Uint8Array(Buffer.from(parts.join('\r\n')+'\r\n\x1a','latin1'));assert.equal(new TextDecoder().decode(parse(bytes).rows[0].extensionBytes),'EXTRA');
});
test('gzip source must decompress fully with valid checksum',async()=>{
  const original=file(),compressed=new Uint8Array(gzipSync(original));assert.deepEqual(await unpackCcsBbsTxe(compressed),original);compressed[compressed.length-5]^=1;await assert.rejects(unpackCcsBbsTxe(compressed),{code:'ccs_bbs_gzip_invalid'});
});
test('compressed expansion is bounded',async()=>{const compressed=new Uint8Array(gzipSync(Buffer.alloc(10*1024*1024+1,32)));await assert.rejects(unpackCcsBbsTxe(compressed),{code:'ccs_bbs_size_invalid'});});
test('missing credentials never start a request',async()=>{let calls=0;await assert.rejects(inspectCcsBbsAccess({},()=>calls++),{code:'ccs_bbs_credentials_not_configured'});assert.equal(calls,0);});
test('only the documented HTTPS directory receives auth; HTTP 200 does not mean connected',async()=>{
  const result=await inspectCcsBbsAccess(credentials,async(url,options)=>{assert.equal(url,CCS_BBS_DIRECTORY);assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Basic '+btoa('synthetic-user:synthetic-secret'));return new Response('<html>listing</html>');});
  assert.equal(result.sourceConnected,false);assert.equal(result.accountVerified,false);assert.equal(result.coverageVerified,false);
});
test('auth denial is not retried, redirected or logged with credentials',async()=>{
  let calls=0;await assert.rejects(inspectCcsBbsAccess(credentials,async()=>{calls++;return new Response('',{status:401});}),{code:'ccs_bbs_access_not_enabled_or_credentials_invalid'});assert.equal(calls,1);
  await assert.rejects(inspectCcsBbsAccess(credentials,async()=>new Response('',{status:302,headers:{Location:'https://foreign.example'}})),{code:'ccs_bbs_redirect_requires_review'});
  await assert.rejects(inspectCcsBbsAccess(credentials,async()=>{throw new Error('synthetic-secret upstream trace');}),error=>error.message==='ccs_bbs_transport_failed');
});
test('oversized HTTP responses stop before parsing',async()=>{await assert.rejects(inspectCcsBbsAccess(credentials,async()=>new Response('x',{headers:{'Content-Length':String(11*1024*1024)}})),{code:'ccs_bbs_response_too_large'});});
test('only explicit same-host TXE links can be downloaded; no guessed month filenames',async()=>{
  const html='<a href="00001_10.f-z">file</a><a href="00001_09.txe">file</a><a href="https://foreign.example/a.txe">bad</a><a href="https://evil@bbs.ccs.cz/cgi-bbs/bbsuser/a.txe">bad</a><a href="../other/a.txe">bad</a><a href="file.txe?secret=x">bad</a><a href="%2e%2e/a.txe">bad</a><a href="a.pdf">pdf</a>';
  assert.deepEqual(listedCcsBbsFiles(html),[CCS_BBS_DIRECTORY+'00001_10.f-z',CCS_BBS_DIRECTORY+'00001_09.txe']);
  let calls=0;const fetcher=async()=>{calls++;return new Response(file());};
  await assert.rejects(downloadListedCcsBbsFile(credentials,CCS_BBS_DIRECTORY+'00001_11.txe',html,fetcher),{code:'ccs_bbs_file_not_listed'});assert.equal(calls,0);
  await downloadListedCcsBbsFile(credentials,CCS_BBS_DIRECTORY+'00001_09.txe',html,fetcher);assert.equal(calls,1);
});
test('comments, script strings and data-href are not directory download links',()=>{
  const html='<!-- <a href="comment.txe"> --><script>"<a href=\'script.txe\'>"</script><style><a href="style.txe"></style><a data-href="data.txe">x</a><a title="href=\'title.txe\'">x</a><a href="real.txe">x</a>';
  assert.deepEqual(listedCcsBbsFiles(html),[CCS_BBS_DIRECTORY+'real.txe']);
});
