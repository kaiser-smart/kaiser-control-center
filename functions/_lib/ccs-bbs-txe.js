// CCS public TXE contract, https://bbs.ccs.cz/info/popis_dt.txt (2008).
// This parser validates source evidence only. It does not decide which amount
// is net/gross, manufacture units/timezones, or merge BBS with MyFleetcor rows.
import { decimalUnits } from './ccs-import.js';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const MAX_BYTES = 10 * 1024 * 1024;
// IBM PC Latin 2 / CP852, bytes 0x80..0xff. Indexing is by bytes, not UTF-8.
const CP852 = 'ÇüéâäůćçłëŐőîŹÄĆÉĹĺôöĽľŚśÖÜŤťŁ×čáíóúĄąŽžĘę¬źČş«»░▒▓│┤ÁÂĚŞ╣║╗╝Żż┐└┴┬├─┼Ăă╚╔╩╦╠═╬¤đĐĎËďŇÍÎě┘┌█▄ŢŮ▀ÓßÔŃńňŠšŔÚŕŰýÝţ´­˝˛ˇ˘§÷¸°¨˙űŘř■ ';
const decode = bytes => [...bytes].map(b=>b<128?String.fromCharCode(b):CP852[b-128]).join('');
function date(value) {
  if (!/^\d{8}$/.test(value)) fail('ccs_bbs_date_invalid');
  const out = `${value.slice(4)}-${value.slice(2,4)}-${value.slice(0,2)}`;
  const n = Date.parse(out+'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0,10)!==out || +value.slice(4)<1990 || +value.slice(4)>2100) fail('ccs_bbs_date_invalid');
  return out;
}
function records(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length>MAX_BYTES) fail('ccs_bbs_size_invalid');
  const result=[]; let start=0;
  for(let i=0;i<bytes.length;i++) {
    if(bytes[i]===10 && (i===0 || bytes[i-1]!==13)) fail('ccs_bbs_record_delimiter_invalid');
    if(bytes[i]===13) {
      if(bytes[i+1]!==10) fail('ccs_bbs_record_delimiter_invalid');
      result.push(bytes.slice(start,i)); i++; start=i+1;
    }
  }
  if(start<bytes.length && !(start===bytes.length-1 && bytes[start]===26)) result.push(bytes.slice(start));
  if(result.length<2 || result.length>20002 || result.some(r=>r.length<283 || r.length>4096 || [...r].some(b=>b<32 || b===127))) fail('ccs_bbs_record_shape_invalid');
  return result;
}
export function parseCcsBbsTxe(bytes,{expectedCustomer}={}) {
  if(!/^\d{6}$/.test(expectedCustomer || '')) fail('ccs_bbs_expected_customer_required');
  const lines=records(bytes), field=(line,pos,len)=>decode(line.slice(pos-1,pos-1+len)).trim();
  if(lines[0][0]!==72 || lines.at(-1)[0]!==84 || lines.slice(1,-1).some(line=>line[0]!==66)) fail('ccs_bbs_record_order_invalid');
  const head=lines[0],tail=lines.at(-1),customer=field(head,2,6);
  if(customer!==expectedCustomer) fail('ccs_bbs_customer_mismatch');
  if(field(head,122,5)!=='10008') fail('ccs_bbs_sender_mismatch');
  const header={customer,fileType:field(head,8,2),fileNumber:field(head,10,6),createdOn:date(field(head,16,8)),company:field(head,24,31)};
  const rows=lines.slice(1,-1).map((line,index)=>{
    const card=field(line,2,22); if(!/^\d{16,22}$/.test(card)) fail('ccs_bbs_card_invalid');
    const localDate=date(field(line,86,8)),clock=field(line,94,4);
    if(!/^(?:[01][0-9]|2[0-3])[0-5][0-9]$/.test(clock)) fail('ccs_bbs_time_invalid');
    const vatAvailable=field(line,221,1),vatType=field(line,220,1);
    if(!['0','1'].includes(vatAvailable)||!['2','3','9'].includes(vatType)) fail('ccs_bbs_vat_flag_unknown');
    return {sourceRow:index+2,cardId:card,accountCharge:/^0+$/.test(card),plateOrName:field(line,24,31),note:field(line,55,31),localDate,localTime:`${localDate}T${clock.slice(0,2)}:${clock.slice(2)}:00`,timezone:null,utc:null,unit:null,countryCode:field(line,98,2),country:field(line,100,20),stationId:field(line,120,12),place:field(line,132,38),productCode:field(line,170,4),product:field(line,174,35),quantityHundredths:decimalUnits(field(line,209,8)),currencySource:field(line,217,3),vatType,vatAvailable:vatAvailable==='1',vatRateHundredths:decimalUnits(field(line,222,5)),unitPriceTenThousandths:decimalUnits(field(line,227,12),4),amountCurrencyMinor:decimalUnits(field(line,239,12)),vatCurrencyMinor:decimalUnits(field(line,251,12)),amountCzkMinor:decimalUnits(field(line,263,12)),odometer:decimalUnits(field(line,275,7),0),collectionNumber:field(line,282,2),rawBytes:line,extensionBytes:line.slice(283)};
  });
  const count=decimalUnits(field(tail,2,8),0),amountCzkMinor=decimalUnits(field(tail,10,14));
  let sum=0; for(const row of rows) { sum+=row.amountCzkMinor; if(!Number.isSafeInteger(sum)) fail('ccs_bbs_sum_overflow'); }
  if(count!==rows.length) fail('ccs_bbs_count_mismatch');
  if(sum!==amountCzkMinor) fail('ccs_bbs_total_mismatch');
  return {format:'ccs_bbs_txe',header,rows,control:{rowCount:count,amountCzkMinor,verified:true},accountVerified:true,coverageVerified:false,accountingMappingVerified:false,sourceConnected:false};
}
export async function unpackCcsBbsTxe(bytes) {
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_BYTES) fail('ccs_bbs_size_invalid');
  if(bytes[0]!==0x1f||bytes[1]!==0x8b) return bytes;
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks=[];let size=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();fail('ccs_bbs_size_invalid');}chunks.push(value);}
  } catch(error) { if(error.code==='ccs_bbs_size_invalid') throw error; fail('ccs_bbs_gzip_invalid'); }
  finally { reader.releaseLock(); }
  const out=new Uint8Array(size);let off=0;for(const chunk of chunks){out.set(chunk,off);off+=chunk.length;}return out;
}
