import { integrationDb, integrationError, loadIntegrationContract, flushIntegrationAudit, persistVerifiedSourceReadback, assertVistosInstallation } from './vistos-integration-store.js';
import { decimal, compareDecimal, addDecimal, fingerprint, numericId, invoiceAccountingState, referenceIds, exactJsonParse } from './vistos-values.js';
import { executeVistosSession, loginVistosExecute } from './vistos-execute-client.js';

export const TRANSFER_LABELS={blocked:'Vyžaduje doplnění / kontrolu',ready:'Připraveno',sending:'Odesílá se',verifying:'Ověřuje se',confirmed:'Potvrzeno ve Vistosu',outcome_unknown:'Výsledek nejasný',recalculation_pending:'Přepočet čeká',failed_before_send:'Chyba před odesláním',correction_required:'Změna vyžaduje kontrolu',cancelled_before_send:'Zrušeno před přenosem',reversed_confirmed:'Zrušeno ve Vistosu',source_only:'Převzato z Vistosu'};
const VERIFY_ONLY=new Set(['sending','verifying','outcome_unknown','recalculation_pending']);
export function writeGate(env,contract,allocation,operation='create') {
  const w=contract.writer||{},reasons=[];
  try{assertVistosInstallation(env,contract);}catch{reasons.push('vistos_installation_unverified');}
  if(String(env.VISTOS_PAYMENT_WRITE_ENABLED)!=='true') reasons.push('writer_disabled');
  for(const key of ['permissionsVerified','recalculationVerified','lookupVerified','accountingModelVerified','decimalStringAccepted','externalKeyFilterVerified','invoicePaymentFilterVerified']) if(w[key]!==true) reasons.push(key);
  if(!w.testEvidence?.[operation]) reasons.push('operation_test_missing');
  if(!w.testEvidence?.partial||!w.testEvidence?.multiple||!w.testEvidence?.lastReversal) reasons.push('accounting_tests_missing');
  if(!numericId(w.receivedDirectionId)||!w.templateVerified||!w.externalKeyWritable)reasons.push('payment_mapping_unverified');
  const policy=(w.exclusiveSources||[]).find(p=>p.companyId===allocation.companyId&&p.bankAccount===allocation.bankAccount&&p.source==='KB'
    &&p.validFrom<=allocation.bankDate&&(!p.validTo||allocation.bankDate<p.validTo)&&p.writer==='smart'&&p.evidenceId);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(allocation.bankDate||''))reasons.push('bank_date_unverified');
  if(!policy) reasons.push('money_single_writer_unverified');
  if(!allocation.confirmedBy||!allocation.confirmedAt||!['human','verified_source_link'].includes(allocation.confirmationMethod)||!allocation.revision)reasons.push('allocation_confirmation_missing');
  if(!contract.companyIds?.includes(allocation.companyId)||!numericId(allocation.invoiceSourceId)||!numericId(allocation.currencyId))reasons.push('accounting_identity_unverified');
  try {const a=decimal(allocation.amount);if(a.coefficient<=0n||a.scale>(w.currencyPrecision?.[allocation.currencyId]??-1))reasons.push('amount_precision_or_sign');}catch {reasons.push('amount_invalid');}
  return {enabled:!reasons.length,reasons};
}
export async function acquireFinanceLocks(db,resources,owner,{now=new Date().toISOString(),expires=null}={}) {
  const obtained=[];
  try {
    for(const resource of [...new Set(resources)].sort()) {
      const result=await db.prepare(`INSERT INTO vistos_finance_locks(resource,owner,expires_at) VALUES(?,?,?) ON CONFLICT(resource) DO NOTHING`)
        .bind(resource,owner,expires||'9999-12-31T00:00:00.000Z').run();
      if(!result.meta?.changes) {
        const existing=await db.prepare('SELECT owner FROM vistos_finance_locks WHERE resource=?').bind(resource).first();
        if(existing?.owner!==owner) throw integrationError('finance_resource_busy');
      } else obtained.push(resource);
    }
    return obtained;
  }catch(error){for(const resource of obtained)await db.prepare('DELETE FROM vistos_finance_locks WHERE resource=? AND owner=?').bind(resource,owner).run();throw error;}
}
async function releaseLocks(db,owner) { await db.prepare('DELETE FROM vistos_finance_locks WHERE owner=?').bind(owner).run(); }
function parseObject(text) {try{return exactJsonParse(text||'{}');}catch{throw integrationError('source_payload_invalid');}}
function pathValue(value,path) {return String(path||'').split('.').filter(Boolean).reduce((v,k)=>v?.[k],value);}
export async function confirmAllocation(scope,{allocationId,invoiceSourceId,companyId,currencyId,amount,bankAccount,revision}) {
  if(!scope.companies.includes(companyId))throw integrationError('vistos_company_forbidden',403);
  const db=scope.db,contract=await loadIntegrationContract(db,scope.installation);
  const match=await db.prepare(`SELECT m.*,p.raw_payload AS bank_raw,p.bank_transaction_id,p.booking_date,p.currency,p.source
    FROM receivable_payment_matches m JOIN receivable_payment_transactions p ON p.id=m.payment_transaction_id WHERE m.id=?`).bind(allocationId).first();
  if(!match||!numericId(invoiceSourceId)||!numericId(currencyId)||!revision||revision.length>100)throw integrationError('allocation_invalid',400);
  const invoice=await db.prepare('SELECT * FROM vistos_source_records WHERE installation=? AND entity=? AND source_id=? AND company_id=?').bind(scope.installation,'InvoiceIssued',invoiceSourceId,companyId).first();
  const localInvoice=await db.prepare('SELECT visto_invoice_id FROM receivable_invoices WHERE id=?').bind(match.invoice_id).first();
  if(!invoice||String(localInvoice?.visto_invoice_id)!==invoiceSourceId)throw integrationError('invoice_source_link_required');
  const bankContract=contract.bank||{},raw=parseObject(match.bank_raw);
  if(bankContract.verified!==true||match.source!==bankContract.source||pathValue(raw,bankContract.accountPath)!==bankAccount)throw integrationError('bank_source_contract_unverified');
  const transactionAmount=decimal(pathValue(raw,bankContract.amountPath)).source;
  const sourceCurrency=pathValue(raw,bankContract.currencyPath);
  if(bankContract.currencyIds?.[sourceCurrency]!==currencyId)throw integrationError('bank_currency_mismatch');
  const value=decimal(amount).source;
  if(compareDecimal(value,'0')<=0||compareDecimal(value,transactionAmount)>0)throw integrationError('allocation_amount_invalid');
  const owner=crypto.randomUUID();
  await acquireFinanceLocks(db,[`transaction:${match.payment_transaction_id}`],owner);
  try {
    const prior=await db.prepare('SELECT * FROM vistos_allocation_confirmations WHERE allocation_id=?').bind(allocationId).first();
    const payload={allocationId,transactionId:match.payment_transaction_id,bankTransactionId:match.bank_transaction_id,bankAccount,invoiceSourceId,companyId,currencyId,
      amount:value,transactionAmount,bankDate:match.booking_date,revision,source:'KB',installation:scope.installation,confirmationMethod:'human',confirmedBy:scope.user.id,confirmedAt:new Date().toISOString()};
    payload.fingerprint=await fingerprint({...payload,confirmedAt:null});
    if(prior) {
      const previous=JSON.parse(prior.payload_json);
      if(previous.revision===revision&&previous.amount===value&&previous.invoiceSourceId===invoiceSourceId&&previous.companyId===companyId&&previous.currencyId===currencyId)return previous;
      throw integrationError('allocation_requires_correction_command');
    }
    const {results=[]}=await db.prepare(`SELECT amount_decimal FROM vistos_allocation_confirmations WHERE transaction_id=? AND status='confirmed'`).bind(match.payment_transaction_id).all();
    const reserved=results.reduce((sum,r)=>addDecimal(sum,r.amount_decimal),'0');
    if(compareDecimal(addDecimal(reserved,value),transactionAmount)>0)throw integrationError('transaction_overallocated');
    await db.batch([
      db.prepare(`INSERT INTO vistos_allocation_confirmations(allocation_id,transaction_id,revision,installation,company_id,invoice_source_id,bank_account,currency_id,amount_decimal,transaction_amount_decimal,bank_date,confirmation_method,confirmed_by,confirmed_at,fingerprint,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(allocationId,payload.transactionId,revision,scope.installation,companyId,invoiceSourceId,bankAccount,currencyId,value,transactionAmount,payload.bankDate,'human',scope.user.id,payload.confirmedAt,payload.fingerprint,JSON.stringify(payload)),
      db.prepare(`INSERT INTO vistos_command_events(id,command_id,company_id,actor,after_state,fingerprint,created_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),allocationId,companyId,scope.user.id,'allocation_confirmed',payload.fingerprint,payload.confirmedAt)
    ]);
    return payload;
  } finally {await releaseLocks(db,owner);}
}
export async function previewTransfers(scope,ids,env) {
  if(!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=='string'||id.length>150))throw integrationError('invalid_transfer_selection',400);
  const contract=await loadIntegrationContract(scope.db,scope.installation),allocations=[],totals={};
  for(const id of [...new Set(ids)].sort()) {
    const row=await scope.db.prepare('SELECT * FROM vistos_allocation_confirmations WHERE allocation_id=? AND installation=?').bind(id,scope.installation).first();
    if(!row||!scope.companies.includes(row.company_id)||row.status!=='confirmed')throw integrationError('allocation_not_confirmed',403);
    const payload=JSON.parse(row.payload_json),gate=writeGate(env,contract,payload);
    allocations.push({id,payload,gate});totals[payload.currencyId]=addDecimal(totals[payload.currencyId]||'0',payload.amount);
  }
  return {allocations,totals,fingerprint:await fingerprint({contractRevision:contract.revision,allocations:allocations.map(a=>a.payload.fingerprint)}),ready:allocations.every(a=>a.gate.enabled)};
}
export async function submitTransfers(scope,{ids,fingerprint:expected},env) {
  const preview=await previewTransfers(scope,ids,env);
  if(preview.fingerprint!==expected)throw integrationError('transfer_preview_changed');
  if(!preview.ready)throw integrationError('transfer_gate_blocked');
  const now=new Date().toISOString(),statements=[];
  for(const {payload:p} of preview.allocations) {
    const existing=await scope.db.prepare(`SELECT id,state FROM vistos_payment_commands WHERE allocation_id=? ORDER BY created_at DESC LIMIT 1`).bind(p.allocationId).first();
    if(existing)continue; // a new revision must never become a new Create
    const id=crypto.randomUUID();
    statements.push(scope.db.prepare(`INSERT INTO vistos_payment_commands(id,allocation_id,revision,operation_kind,installation,company_id,invoice_source_id,state,fingerprint,payload_json,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,'ready',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM vistos_payment_commands WHERE allocation_id=?)`).bind(id,p.allocationId,p.revision,'create',scope.installation,p.companyId,p.invoiceSourceId,p.fingerprint,JSON.stringify(p),now,now,p.allocationId));
  }
  if(statements.length)await scope.db.batch(statements);
  return {status:'queued',count:statements.length,fingerprint:preview.fingerprint};
}
async function transition(db,command,next,{actor='scheduler',paymentId=null,errorCode=null}={}) {
  const now=new Date().toISOString();
  const result=await db.batch([
    db.prepare(`UPDATE vistos_payment_commands SET state=?,payment_source_id=COALESCE(?,payment_source_id),error_code=?,updated_at=? WHERE id=? AND state=? AND lease_owner=? AND lease_until>?`).bind(next,paymentId,errorCode,now,command.id,command.state,command.worker,now),
    db.prepare(`INSERT INTO vistos_command_events(id,command_id,company_id,actor,before_state,after_state,fingerprint,error_code,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM vistos_payment_commands WHERE id=? AND state=? AND lease_owner=? AND updated_at=?)`).bind(crypto.randomUUID(),command.id,command.company_id,actor,command.state,next,command.fingerprint,errorCode,now,command.id,next,command.worker,now)
  ]);
  if(!result[0]?.meta?.changes)throw integrationError('payment_worker_lease_lost');
  command.state=next;if(paymentId)command.payment_source_id=paymentId;
}
function assertInvoice(invoice,p,contract) {
  const companyField=contract.entities?.InvoiceIssued?.companyField;
  const company=companyField?referenceIds(invoice,companyField,'detail')[0]:contract.entities?.InvoiceIssued?.fixedCompanyId;
  if(numericId(invoice.Id)!==p.invoiceSourceId||company!==p.companyId||referenceIds(invoice,'Currency_FK','detail')[0]!==p.currencyId)throw integrationError('invoice_identity_mismatch');
  const state=invoiceAccountingState(invoice,{modelVerified:contract.writer.accountingModelVerified});
  if(state.remaining===null||compareDecimal(p.amount,state.remaining)>0)throw integrationError('invoice_overpayment_or_unknown');
  return state;
}
export function verifyPaymentReadback(payment,p,contract) {
  try {return numericId(payment.Id)!==null && referenceIds(payment,'InvoiceIssued_FK','detail')[0]===p.invoiceSourceId
    && referenceIds(payment,'Currency_FK','detail')[0]===p.currencyId && referenceIds(payment,'BusinessUnit_FK','detail')[0]===p.companyId
    && compareDecimal(payment.Amount,p.amount)===0 && payment.Date===p.bankDate
    && referenceIds(payment,'PaymentType_FK','detail')[0]===String(contract.writer.receivedDirectionId)
    && payment.Ext_ID===p.externalKey && payment.AdvancedPayment===false;}catch{return false;}
}
export function createPaymentPayload(template,p,contract) {
  const w=contract.writer;
  if(!template||typeof template!=='object'||Array.isArray(template))throw integrationError('payment_template_missing');
  const defaults=Object.fromEntries((w.templateFields||[]).filter(k=>Object.hasOwn(template,k)).map(k=>[k,template[k]]));
  return {CreateParam:{EntityName:'Payment',MethodMode:2,Data:{...defaults,InvoiceIssued_FK:Number(p.invoiceSourceId),Amount:decimal(p.amount).source,
    Date:p.bankDate,Currency_FK:Number(p.currencyId),PaymentType_FK:Number(w.receivedDirectionId),BusinessUnit_FK:Number(p.companyId),AdvancedPayment:false,Ext_ID:p.externalKey}}};
}
export function correctionPayload(command,payment,p) {
  if(command.operation_kind==='remove')return {RemoveParam:{EntityName:'Payment',EntityId:Number(payment.Id)}};
  const field=command.operation_kind==='rebind'?'InvoiceIssued_FK':'Amount';
  return {SaveParam:{EntityName:'Payment',EntityId:Number(payment.Id),MethodMode:3,ColNameToUpdate:[field],Data:{Id:Number(payment.Id),[field]:field==='Amount'?decimal(p.amount).source:Number(p.invoiceSourceId)}}};
}
const negate=value=>{const s=decimal(value).source;return s.startsWith('-')?s.slice(1):'-'+s;};
export function paymentProvider(env,contract) {
  assertVistosInstallation(env,contract);
  let session;
  const readEnv={...env,VISTOS_EXACT_DECIMALS:true,VISTOS_REQUIRE_SHARED_BUDGET:true};
  async function execute(name,data,readOnly=true) {
    session ||= await loginVistosExecute(readEnv);
    return (await executeVistosSession(readEnv,session,name,data,{readOnly})).body;
  }
  return {
    async read(entity,id){return (await execute('GetByIdParam',{EntityName:entity,EntityId:Number(id),MethodMode:2})).data;},
    async template(){return (await execute('GetByIdParam',{EntityName:'Payment',EntityId:0,MethodMode:2})).data;},
    async find(externalKey){
      if(!contract.writer?.externalKeyFilterVerified)throw integrationError('payment_lookup_unverified');
      const body=await execute('GetPageParam',{EntityName:'Payment',Start:0,Length:2,Filter:{[contract.writer.externalKeyFilter]:externalKey}});
      if(body.data?.recordsFiltered===0 && Array.isArray(body.data?.data) && body.data.data.length===0)return null;
      if(body.data?.recordsFiltered!==1 || body.data?.data?.length!==1)throw integrationError('payment_lookup_not_unique');
      return body.data.data[0];
    },
    async send(payload){
      const [name,data]=Object.entries(payload)[0];
      // Decimal strings are accepted only under a tested installation contract.
      if(contract.writer?.decimalStringAccepted!==true)throw integrationError('decimal_wire_contract_unverified');
      return execute(name,data,false);
    },
    async removalEvidence(command){
      const evidence=contract.writer?.removalScopeEvidence;
      // Same explicitly verified company/permissions: NotFound plus absence from complete
      // invoice list is required. A bare empty GetPage is never sufficient.
      if(!evidence?.verified||!evidence?.evidenceId||!evidence?.companyIds?.includes(command.company_id))return false;
      try{await execute('GetByIdParam',{EntityName:'Payment',EntityId:Number(command.payment_source_id),MethodMode:2});return false;}
      catch(error){return error.upstreamStatus===212&&error.upstreamApiStatus==='NotFound';}
    },
    async verifySummary(invoice,payment,p){
      const companyField=contract.entities?.InvoiceIssued?.companyField;
      const company=companyField?referenceIds(invoice,companyField,'detail')[0]:contract.entities?.InvoiceIssued?.fixedCompanyId;
      if(numericId(invoice.Id)!==p.invoiceSourceId||company!==p.companyId||referenceIds(invoice,'Currency_FK','detail')[0]!==p.currencyId)return false;
      // A complete active-payment list is required, not just a changed invoice balance.
      const filterField=contract.writer?.invoicePaymentFilter;
      if(!filterField||contract.writer.invoicePaymentFilterVerified!==true)return false;
      let offset=0,total=null,sum='0',found=false,previous=0n;
      while(true){
        const body=await execute('GetPageParam',{EntityName:'Payment',Start:offset,Length:100,Order:contract.entities.Payment.idOrder,Filter:{[filterField]:Number(p.invoiceSourceId)}});
        const data=body.data;if(!Number.isSafeInteger(data?.recordsFiltered)||!Array.isArray(data?.data))return false;
        if(total!==null&&total!==data.recordsFiltered)return false;total=data.recordsFiltered;
        if(data.data.length===0&&offset<total)return false;
        for(const row of data.data){
          const id=numericId(row.Id);if(!id||BigInt(id)<=previous)return false;previous=BigInt(id);
          if(referenceIds(row,'InvoiceIssued_FK','list')[0]!==p.invoiceSourceId||referenceIds(row,'Currency_FK','list')[0]!==p.currencyId)return false;
          if(referenceIds(row,'PaymentType_FK','list')[0]!==String(contract.writer.receivedDirectionId)||row.AdvancedPayment!==false)return false;
          sum=addDecimal(sum,decimal(row.Amount).source);if(id===numericId(payment?.Id))found=true;
          if(p.removedPaymentId===id)return false;
        }
        offset+=data.data.length;if(offset>=total)break;
        if(offset>=10000)return false; // Explicit unverified summary; never a truncated success.
      }
      const expectedRemaining=addDecimal(addDecimal(decimal(invoice.PriceWithTax).source,negate(invoice.AmountPaid)),negate(invoice.AmountPaidProformaInvoice));
      return (payment?found:true)&&compareDecimal(sum,invoice.AmountPaid)===0&&compareDecimal(expectedRemaining,invoice.RemainToPay)===0;
    }
  };
}
export async function processPaymentCommand(env,id,{verifyOnly=false,provider=null,actor='scheduler'}={}) {
  const db=integrationDb(env),command=await db.prepare('SELECT * FROM vistos_payment_commands WHERE id=?').bind(id).first();
  if(!command)throw integrationError('transfer_not_found',404);
  if(['confirmed','reversed_confirmed','cancelled_before_send','source_only'].includes(command.state))return {state:command.state};
  const contract=await loadIntegrationContract(db,command.installation),p={...JSON.parse(command.payload_json),externalKey:`smart:${command.allocation_id}`};
  provider ||= paymentProvider(env,contract);
  const resources=[`allocation:${command.allocation_id}`,`invoice:${command.installation}:${command.invoice_source_id}`,
    ...(command.previous_invoice_id?[`invoice:${command.installation}:${command.previous_invoice_id}`]:[]),...(command.payment_source_id?[`payment:${command.installation}:${command.payment_source_id}`]:[])];
  await acquireFinanceLocks(db,resources,command.id);
  // CAS across workers; expired sending requests enter lookup only.
  const now=new Date().toISOString(),worker=crypto.randomUUID();
  const claim=await db.prepare(`UPDATE vistos_payment_commands SET lease_owner=?,lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<?)`).bind(worker,new Date(Date.now()+120000).toISOString(),id,now).run();
  if(!claim.meta?.changes)return {state:command.state,busy:true};
  let sent=false;
  try {
    Object.assign(command,await db.prepare('SELECT * FROM vistos_payment_commands WHERE id=?').bind(id).first(),{worker});
    if(['confirmed','reversed_confirmed','cancelled_before_send'].includes(command.state)){await releaseLocks(db,command.id);return {state:command.state};}
    const lookup=verifyOnly||VERIFY_ONLY.has(command.state);
    if(!lookup) {
      const gate=writeGate(env,contract,p,command.operation_kind);
      if(!gate.enabled){await transition(db,command,'blocked',{errorCode:gate.reasons[0],actor});await releaseLocks(db,command.id);return {state:'blocked',reasons:gate.reasons};}
      const confirmation=await db.prepare('SELECT fingerprint,status FROM vistos_allocation_confirmations WHERE allocation_id=?').bind(command.allocation_id).first();
      if(!confirmation||confirmation.status!=='confirmed'||confirmation.fingerprint!==(command.operation_kind==='create'?command.fingerprint:JSON.parse(command.expected_json).allocationFingerprint))throw integrationError('allocation_revision_changed');
      const invoice=await provider.read('InvoiceIssued',p.invoiceSourceId);
      if(['create','rebind'].includes(command.operation_kind))assertInvoice(invoice,p,contract);
      if(command.operation_kind==='amount'){
        const previousAmount=JSON.parse(command.expected_json).previousAmount;
        if(compareDecimal(p.amount,previousAmount)>0)assertInvoice(invoice,{...p,amount:addDecimal(p.amount,negate(previousAmount))},contract);
      }
      let payload;
      if(command.operation_kind==='create') {
        const existing=await provider.find(p.externalKey);
        if(existing){await transition(db,command,'verifying',{paymentId:numericId(existing.Id),actor});}
        else payload=createPaymentPayload(await provider.template(),p,contract);
      } else {
        if(!command.payment_source_id)throw integrationError('owned_payment_required');
        const payment=await provider.read('Payment',command.payment_source_id);
        if(await fingerprint(payment)!==JSON.parse(command.expected_json).paymentFingerprint)throw integrationError('payment_revision_conflict');
        if(payment.Ext_ID!==p.externalKey)throw integrationError('foreign_payment_forbidden');
        payload=correctionPayload(command,payment,p);
      }
      if(payload) {
        await transition(db,command,'sending',{actor});
        await db.prepare('UPDATE vistos_payment_commands SET sent_at=? WHERE id=?').bind(now,id).run();
        sent=true;
        const response=await provider.send(payload);
        const paymentId=command.operation_kind==='create'?numericId(response?.data?.EntityID):command.payment_source_id;
        if(!paymentId)throw integrationError('payment_result_identity_missing');
        await transition(db,command,'verifying',{paymentId,actor});
      }
    }
    let payment=null;
    if(command.operation_kind!=='remove')payment=command.payment_source_id?await provider.read('Payment',command.payment_source_id):await provider.find(p.externalKey);
    if(command.operation_kind==='remove') {
      // Missing record alone is never a proved cancellation.
      if(!provider.removalEvidence||!(await provider.removalEvidence(command))) {await transition(db,command,'outcome_unknown',{actor,errorCode:'removal_evidence_required'});return {state:command.state};}
      const invoice=await provider.read('InvoiceIssued',p.invoiceSourceId);
      if(!(await provider.verifySummary(invoice,null,{...p,removedPaymentId:command.payment_source_id}))){await transition(db,command,'recalculation_pending',{actor});return {state:command.state};}
      await persistVerifiedSourceReadback(db,command.installation,'InvoiceIssued',invoice,contract);
      await settleConfirmation(db,command,p);await transition(db,command,'reversed_confirmed',{actor});await releaseLocks(db,command.id);return {state:command.state};
    }
    if(!payment||!verifyPaymentReadback(payment,p,contract)|| (command.payment_source_id&&numericId(payment.Id)!==command.payment_source_id)) {
      await transition(db,command,'outcome_unknown',{actor,errorCode:'payment_readback_not_proven'});return {state:command.state};
    }
    await transition(db,command,'recalculation_pending',{actor,paymentId:numericId(payment.Id)});
    const invoice=await provider.read('InvoiceIssued',p.invoiceSourceId);
    if(numericId(invoice.Id)!==p.invoiceSourceId || !(await provider.verifySummary(invoice,payment,p)))return {state:command.state};
    if(command.previous_invoice_id) {
      const previous=await provider.read('InvoiceIssued',command.previous_invoice_id);
      if(!(await provider.verifySummary(previous,null,{...p,invoiceSourceId:command.previous_invoice_id})))return {state:command.state};
      await persistVerifiedSourceReadback(db,command.installation,'InvoiceIssued',previous,contract);
    }
    await persistVerifiedSourceReadback(db,command.installation,'InvoiceIssued',invoice,contract);
    await persistVerifiedSourceReadback(db,command.installation,'Payment',payment,contract);
    await settleConfirmation(db,command,p);await transition(db,command,'confirmed',{actor});await releaseLocks(db,command.id);
    await flushIntegrationAudit(db);return {state:command.state,paymentId:command.payment_source_id};
  }catch(error) {
    const code=/^[a-z0-9_]+$/.test(error.code||'')?error.code:'payment_operation_failed';
    if(code==='payment_worker_lease_lost')return {state:command.state,errorCode:code,busy:true};
    const unknown=sent||VERIFY_ONLY.has(command.state)||Boolean(command.sent_at);
    await transition(db,command,unknown?'outcome_unknown':'failed_before_send',{actor,errorCode:code});
    if(!unknown)await releaseLocks(db,command.id);
    return {state:command.state,errorCode:code};
  }finally {await db.prepare('UPDATE vistos_payment_commands SET lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=?').bind(id,worker).run();}
}

export async function preparePaymentCorrection(scope,commandId,{operation,amount,invoiceSourceId,reason},env,{provider=null}={}) {
  if(!['amount','rebind','remove'].includes(operation)||typeof reason!=='string'||!reason.trim()||reason.length>500)throw integrationError('correction_request_invalid',400);
  const command=await scope.db.prepare('SELECT * FROM vistos_payment_commands WHERE id=? AND installation=?').bind(commandId,scope.installation).first();
  if(!command||!scope.companies.includes(command.company_id)||command.state!=='confirmed'||!command.payment_source_id)throw integrationError('confirmed_owned_payment_required');
  const confirmation=await scope.db.prepare('SELECT * FROM vistos_allocation_confirmations WHERE allocation_id=?').bind(command.allocation_id).first();
  if(!confirmation||confirmation.status!=='confirmed')throw integrationError('allocation_not_confirmed');
  const contract=await loadIntegrationContract(scope.db,scope.installation),p=JSON.parse(confirmation.payload_json);
  if(operation==='amount')p.amount=decimal(amount).source;
  if(operation==='rebind'){if(!numericId(invoiceSourceId)||invoiceSourceId===p.invoiceSourceId)throw integrationError('new_invoice_identity_required');p.invoiceSourceId=invoiceSourceId;}
  const expectedRevision=await fingerprint({base:confirmation.fingerprint,operation,amount:p.amount,invoice:p.invoiceSourceId,reason});
  p.revision=expectedRevision;p.confirmedAt=new Date().toISOString();p.confirmedBy=scope.user.id;p.confirmationMethod='human';p.externalKey=`smart:${command.allocation_id}`;
  p.fingerprint=await fingerprint({...p,confirmedAt:null,fingerprint:null});
  const gate=writeGate(env,contract,p,operation);if(operation==='remove'&&!contract.writer?.removalScopeEvidence)gate.reasons.push('removal_scope_evidence_missing');gate.enabled=!gate.reasons.length;
  if(!gate.enabled)throw integrationError('correction_gate_blocked');
  provider ||= paymentProvider(env,contract);
  const payment=await provider.read('Payment',command.payment_source_id);
  if(payment?.Ext_ID!==p.externalKey||numericId(payment.Id)!==command.payment_source_id)throw integrationError('foreign_payment_forbidden');
  const old=JSON.parse(confirmation.payload_json);
  if(!verifyPaymentReadback(payment,{...old,externalKey:p.externalKey},contract))throw integrationError('payment_revision_conflict');
  const invoice=await provider.read('InvoiceIssued',p.invoiceSourceId);
  if(operation==='rebind')assertInvoice(invoice,p,contract);
  if(operation==='amount'&&compareDecimal(p.amount,old.amount)>0)assertInvoice(invoice,{...p,amount:addDecimal(p.amount,negate(old.amount))},contract);
  const expected={paymentFingerprint:await fingerprint(payment),allocationFingerprint:confirmation.fingerprint,previousAmount:old.amount,previousInvoice:old.invoiceSourceId,contractRevision:contract.revision,reason};
  const previewFingerprint=await fingerprint({operation,p:{...p,confirmedAt:null},expected});
  return {command,operation,p,expected,fingerprint:previewFingerprint};
}
export async function submitPaymentCorrection(scope,commandId,input,env,options={}) {
  const preview=await preparePaymentCorrection(scope,commandId,input,env,options);
  if(preview.fingerprint!==input.fingerprint)throw integrationError('correction_preview_changed');
  const {command,operation,p,expected}=preview,db=scope.db,owner=crypto.randomUUID();
  await acquireFinanceLocks(db,[`transaction:${p.transactionId}`,`allocation:${p.allocationId}`],owner);
  try {
    const existing=await db.prepare(`SELECT id FROM vistos_payment_commands WHERE allocation_id=? AND revision=? AND operation_kind=?`).bind(p.allocationId,p.revision,operation).first();if(existing)return {id:existing.id,status:'queued'};
    const pending=await db.prepare(`SELECT id FROM vistos_payment_commands WHERE allocation_id=? AND state NOT IN ('confirmed','reversed_confirmed','cancelled_before_send','failed_before_send')`).bind(p.allocationId).first();if(pending)throw integrationError('payment_command_pending');
    const confirmation=await db.prepare('SELECT fingerprint FROM vistos_allocation_confirmations WHERE allocation_id=?').bind(p.allocationId).first();if(confirmation.fingerprint!==expected.allocationFingerprint)throw integrationError('allocation_revision_changed');
    const {results=[]}=await db.prepare("SELECT amount_decimal FROM vistos_allocation_confirmations WHERE transaction_id=? AND allocation_id<>? AND status='confirmed'").bind(p.transactionId,p.allocationId).all();
    const reserve=compareDecimal(p.amount,expected.previousAmount)>0?p.amount:expected.previousAmount;
    if(compareDecimal(addDecimal(results.reduce((s,r)=>addDecimal(s,r.amount_decimal),'0'),reserve),p.transactionAmount)>0)throw integrationError('transaction_overallocated');
    const id=crypto.randomUUID(),now=new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO vistos_payment_commands(id,allocation_id,revision,operation_kind,installation,company_id,invoice_source_id,previous_invoice_id,payment_source_id,state,fingerprint,payload_json,expected_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'ready',?,?,?,?,?)`).bind(id,p.allocationId,p.revision,operation,scope.installation,p.companyId,p.invoiceSourceId,operation==='rebind'?expected.previousInvoice:null,command.payment_source_id,p.fingerprint,JSON.stringify(p),JSON.stringify(expected),now,now),
      db.prepare('UPDATE vistos_allocation_confirmations SET amount_decimal=? WHERE allocation_id=?').bind(reserve,p.allocationId),
      db.prepare(`INSERT INTO vistos_command_events(id,command_id,company_id,actor,after_state,fingerprint,created_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),id,p.companyId,scope.user.id,'correction_queued',p.fingerprint,now)
    ]);return {id,status:'queued'};
  }finally{await releaseLocks(db,owner);}
}
async function settleConfirmation(db,command,p) {
  if(command.operation_kind==='create')return;
  await db.prepare(`UPDATE vistos_allocation_confirmations SET revision=?,invoice_source_id=?,amount_decimal=?,status=?,fingerprint=?,payload_json=? WHERE allocation_id=?`).bind(p.revision,p.invoiceSourceId,command.operation_kind==='remove'?'0':p.amount,command.operation_kind==='remove'?'reversed':'confirmed',command.fingerprint,JSON.stringify(p),p.allocationId).run();
}
