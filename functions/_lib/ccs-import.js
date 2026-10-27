// CCS MyFleetcor export adapter v1. Pure review stage; no network or database writes.
export const CCS_HEADERS = ['Zákaznické číslo','Název společnosti','Fakturace Postavení','Číslo faktury','Datum transakce','Čas transakce','Číslo karty','Jmeno','SPZ','Poznámka','Tachometr','Produkt','Místo','Adresa obchodního místa','Město','Množství','Jednotková cena','Sazba DPH','Částka bez DPH','DPH','Celkem (včetně DPH)','Měna','Typ transakce'];
const txt = x => String(x ?? '').trim();
const plate = x => txt(x).toUpperCase().replace(/[\s-]/g,'');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Prague', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' });
export function parseCcsCsv(input) {
  if (typeof input !== 'string' || input.length > 10_000_000) fail('file_size_or_type');
  const source=input.replace(/^\uFEFF/,''), rows=[];
  let row=[],field='',quoted=false,closed=false;
  const cell=()=>{row.push(field);field='';closed=false;};
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(quoted) { if(c==='"') {if(source[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue; }
    if(c==='"') {if(field||closed)fail('invalid_csv_quote');quoted=true;}
    else if(c===','){cell();}
    else if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;cell();if(row.some(Boolean))rows.push(row);row=[];}
    else {if(closed)fail('invalid_csv_after_quote');field+=c;}
  }
  if(quoted)fail('unclosed_csv_quote');
  if(field||row.length||closed){cell();rows.push(row);}
  return rows;
}
export function decimalUnits(value, scale=2, optional=false) {
  const s=txt(value).replace(/[\u00a0\u202f ]/g,'').replace(',','.');
  if(!s&&optional)return null;
  const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if(!m)fail('invalid_decimal');
  let fraction=m[3]||'';
  if(fraction.length>scale){if(/[^0]/.test(fraction.slice(scale)))fail('decimal_precision');fraction=fraction.slice(0,scale);}
  const n=BigInt(m[2])*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0')||'0');
  const result=Number(m[1]?-n:n);if(!Number.isSafeInteger(result))fail('decimal_overflow');return result;
}
function isoDate(value) {
  const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(txt(value));if(!m)fail('invalid_date');
  const out=`${m[3]}-${m[2]}-${m[1]}`;
  if(+m[3]<2000||+m[3]>2100||new Date(out+'T00:00:00Z').toISOString().slice(0,10)!==out)fail('invalid_date');return out;
}
function instants(local) {
  const naive=Date.parse(local+'Z');if(!Number.isFinite(naive))return [];
  return [0,60,120,180].map(offset=>new Date(naive-offset*60000)).filter(d=>formatter.format(d).replace(' ','T')===local).map(d=>d.toISOString());
}
export function transactionTime(dateValue,timeValue) {
  const date=isoDate(dateValue),raw=txt(timeValue),warnings=[];
  let local=null,utc=null;
  if(/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    local=date+'T'+raw+(raw.length===5?':00':'');const candidates=instants(local);
    if(candidates.length===1)utc=candidates[0];else warnings.push(candidates.length?'ambiguous_dst_time':'invalid_local_time');
  }else if(!raw||raw===txt(dateValue)){warnings.push('time_missing_in_export');}
  else fail('unsupported_time_format');
  const next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const start=instants(date+'T00:00:00')[0],end=instants(next+'T00:00:00')[0];
  return {date,local,utc,precision:utc?'minute':local?'ambiguous':'day',from:utc||start,to:utc?new Date(Date.parse(utc)+60000).toISOString():end,warnings};
}
const categories=new Map([
  ['Natural','petrol'],['Natural Plus','petrol'],['Nafta','diesel'],['Diesel +','diesel'],['Nafta Plus','diesel'],['LPG','lpg'],['Dobíjení-EV','electricity'],['Parkovne-EV','parking'],['Aditiv_AdBlue_kanyst','adblue_container'],['Aditiv_AdBlue_stojan','adblue_pump'],['Mytí vozidel','washing'],['PB láhev','bottled_gas']
]);
export function normalizeCcsMatrix(matrix,{expectedAccount,sourceFormat='csv'}={}) {
  if(!expectedAccount)fail('expected_account_required');
  if(!Array.isArray(matrix)||matrix.length<2||matrix.length>20001)fail('invalid_row_count');
  const header=matrix[0].map(txt);
  if(header.length!==CCS_HEADERS.length||new Set(header).size!==header.length||CCS_HEADERS.some(h=>!header.includes(h)))fail('schema_changed');
  return matrix.slice(1).map((cells,index)=>{
    if(!Array.isArray(cells)||cells.length!==header.length||cells.some(c=>typeof c!=='string'))fail('invalid_row_shape_or_cell_type');
    const raw=Object.fromEntries(header.map((h,i)=>[h,txt(cells[i])]));
    if(raw['Zákaznické číslo']!==expectedAccount)fail('account_mismatch');
    const card=raw['Číslo karty'];if(!/^\d{19}$/.test(card))fail('invalid_card_identifier');
    const time=transactionTime(raw['Datum transakce'],raw['Čas transakce']);
    const warnings=[...time.warnings,'unit_not_present_in_export','transaction_id_not_present'];
    const netMinor=decimalUnits(raw['Částka bez DPH']),vatMinor=decimalUnits(raw['DPH']),grossMinor=decimalUnits(raw['Celkem (včetně DPH)']);
    if(netMinor+vatMinor!==grossMinor)fail('net_vat_gross_mismatch');
    const currency=raw['Měna']==='Koruna česká'?'CZK':null;
    if(!currency)warnings.push('currency_not_mapped');
    const product=raw['Produkt'],category=categories.get(product)||'unknown';
    if(category==='unknown')warnings.push('product_not_mapped');
    const odometerValue=decimalUnits(raw['Tachometr'],0,true);
    if(odometerValue===null||odometerValue<=0)warnings.push('odometer_missing_or_nonpositive');
    const quantityMicros=decimalUnits(raw['Množství'],6),unitPriceMinor=decimalUnits(raw['Jednotková cena']),vatRateMicros=decimalUnits(raw['Sazba DPH'],6);
    if(raw['Typ transakce']!=='Prodej-nákup'||grossMinor<0||quantityMicros<=0)warnings.push('correction_or_transaction_type_requires_review');
    const billing=raw['Fakturace Postavení']==='Nevyfakturované pouze'?'pending':raw['Fakturace Postavení']==='Úctoval pouze'?'invoiced':'unknown';
    if(billing==='unknown')warnings.push('billing_status_not_mapped');
    const result={source:'ccs_myfleetcor_export',sourceFormat,sourceRow:index+2,accountId:expectedAccount,cardId:card,cardDisplay:'•••• '+card.slice(-4),plate:plate(raw['SPZ']),plateRaw:raw['SPZ'],driverLabel:raw.Jmeno||null,driverId:null,vehicleId:null,time,product,category,quantityMicros,unit:null,unitPriceMinor,vatRateMicros,netMinor,vatMinor,grossMinor,currency,billing,invoiceId:raw['Číslo faktury']||null,transactionType:raw['Typ transakce'],merchant:raw['Místo'],merchantAddress:raw['Adresa obchodního místa'],merchantCity:raw['Město'],odometer:odometerValue>0?odometerValue:null,note:raw['Poznámka'],warnings,raw};
    // Candidate identity excludes mutable invoicing, notes, plate/driver labels.
    result.candidateKey=JSON.stringify([result.accountId,card,time.date,product,result.merchant,result.merchantAddress,quantityMicros,grossMinor,raw['Měna'],result.transactionType]);
    result.preciseKey=time.utc?JSON.stringify([result.candidateKey,time.utc]):null;
    result.eventCandidateKey=JSON.stringify([result.accountId,card,time.date,product,result.merchant,result.merchantAddress,raw['Měna']]);
    return result;
  });
}
export function resolveCcsVehicle(row,aliases=[]) {
  const evidence=aliases.filter(a=>a.accountId===row.accountId&&a.verified===true&&txt(a.sourceEvidenceId)&&txt(a.vehicleId)&&txt(a.id)&&['ccs_card','license_plate'].includes(a.system));
  const matching=evidence.filter(a=>a.system==='ccs_card'?a.key===row.cardId:plate(a.key)===row.plate&&Boolean(row.plate));
  const from=Date.parse(row.time.from),to=Date.parse(row.time.to);
  const valid=matching.filter(a=>Number.isFinite(Date.parse(a.validFrom))&&Date.parse(a.validFrom)<=from&&(!a.validTo||Date.parse(a.validTo)>=to));
  const overlapping=matching.filter(a=>Number.isFinite(Date.parse(a.validFrom))&&Date.parse(a.validFrom)<to&&(!a.validTo||Date.parse(a.validTo)>from));
  const vehicles=[...new Set(overlapping.map(a=>a.vehicleId))];
  if(vehicles.length>1)return {status:'conflict',vehicleId:null,candidateVehicleIds:vehicles,evidenceIds:overlapping.map(a=>a.id)};
  const cards=valid.filter(a=>a.system==='ccs_card');
  if(!cards.length||row.time.precision==='ambiguous')return {status:'needs_evidence',vehicleId:null,candidateVehicleIds:vehicles,evidenceIds:valid.map(a=>a.id)};
  return {status:'verified',vehicleId:cards[0].vehicleId,candidateVehicleIds:vehicles,evidenceIds:valid.map(a=>a.id)};
}
export function planCcsImport(rows,{fileHash,previousFiles=[],existingRows=[],aliases=[]}={}) {
  if(!/^[a-f0-9]{64}$/.test(fileHash||''))fail('file_hash_required');
  if(previousFiles.includes(fileHash))return {status:'already_seen_file',writes:false,rows:[],counts:{alreadySeen:rows.length}};
  const bucket=input=>{const m=new Map();for(const row of input){const group=m.get(row.candidateKey)||[];group.push(row);m.set(row.candidateKey,group);}return m;};
  const batchIndex=bucket(rows),existingIndex=bucket(existingRows);
  const eventIndex=new Map();for(const row of existingRows){const group=eventIndex.get(row.eventCandidateKey)||[];group.push(row);eventIndex.set(row.eventCandidateKey,group);}
  const counts={},planned=rows.map(row=>{
    const sameBatch=batchIndex.get(row.candidateKey).filter(other=>other!==row&&(!other.preciseKey||!row.preciseKey||other.preciseKey===row.preciseKey));
    const previous=(existingIndex.get(row.candidateKey)||[]).filter(other=>!other.preciseKey||!row.preciseKey||other.preciseKey===row.preciseKey);
    let action='stage_new';
    if(sameBatch.length)action='review_collision';
    else if(previous.length)action=previous.length===1&&(previous[0].billing!==row.billing||previous[0].invoiceId!==row.invoiceId)?'review_revision':'review_possible_duplicate';
    else if((eventIndex.get(row.eventCandidateKey)||[]).some(other=>!other.time.utc||!row.time.utc||other.time.utc===row.time.utc))action='review_source_correction';
    else if(!row.preciseKey)action='review_missing_time';
    counts[action]=(counts[action]||0)+1;
    return {...row,action,identity:resolveCcsVehicle(row,aliases),operationallyCommitted:false};
  });
  const sums={};
  for(const row of rows){const key=row.currency||row.raw['Měna'];sums[key]??={netMinor:0,vatMinor:0,grossMinor:0};for(const f of ['netMinor','vatMinor','grossMinor']){sums[key][f]+=row[f];if(!Number.isSafeInteger(sums[key][f]))fail('sum_overflow');}}
  return {status:'review_only',writes:false,rows:planned,counts,totals:sums,sourceTransactionIdsAvailable:false};
}
export function measuredConsumption(telemetry) {
  if(!telemetry||telemetry.complete!==true||!txt(telemetry.vehicleId)||!txt(telemetry.sourceEvidenceId)||!['l','kWh'].includes(telemetry.unit)||!Number.isFinite(telemetry.consumed)||telemetry.consumed<0||!Number.isFinite(telemetry.distanceKm)||telemetry.distanceKm<=0||!Number.isFinite(Date.parse(telemetry.from))||!Number.isFinite(Date.parse(telemetry.to))||Date.parse(telemetry.to)<=Date.parse(telemetry.from))return {available:false,value:null,reason:'measured_consumption_evidence_incomplete'};
  return {available:true,value:100*telemetry.consumed/telemetry.distanceKm,unit:telemetry.unit+'/100 km',sourceEvidenceId:telemetry.sourceEvidenceId,from:telemetry.from,to:telemetry.to};
}
