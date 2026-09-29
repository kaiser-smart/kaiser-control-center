// Deliberately excludes message content, prompts, proposals, quotations and credentials.
export function analysisConfiguration(env) {
  const modelConfigured=Boolean(env.FORPSI_ANALYSIS_MODEL);
  const apiKeyConfigured=Boolean(env.FORPSI_ANALYSIS_API_KEY);
  const proxyConfigured=env.FORPSI_ANALYSIS_PROXY_URL===
    'https://smart-odpady.ai/api/forpsi/analysis'&&env.CONNECTOR_ADMIN_TOKEN?.length>=32;
  const eligibilityReason=!modelConfigured?'MODEL_NOT_CONFIGURED':
    !apiKeyConfigured&&!proxyConfigured?'ANALYSIS_TRANSPORT_NOT_CONFIGURED':null;
  return {modelConfigured,apiKeyConfigured,proxyConfigured:Boolean(proxyConfigured),
    analyzerEligible:eligibilityReason===null,eligibilityReason};
}

export function createAnalysisAudit(env) {
  return {...analysisConfiguration(env),analyzerInvoked:false,
    modelRequestAttempted:false,modelRequestSent:false,modelResponseReceived:false,
    transportResponseReceived:false,httpStatus:null,modelHttpStatus:null,
    responseParsed:false,proposalReturned:false,quotePresent:false,quoteLength:0,
    quoteMatchesAuthoredText:false,stateValid:false,normalizedAnalysisStatus:'unreviewed',
    errorCode:null,finalReason:'NO_PROPOSAL',caseEvidenceBacked:false};
}

const safeCodes=new Set(['MODEL_NOT_CONFIGURED','ANALYSIS_TRANSPORT_NOT_CONFIGURED',
  'MODEL_ANALYSIS_INCOMPLETE','MODEL_ANALYSIS_EMPTY_OUTPUT','MODEL_ANALYSIS_INVALID_JSON',
  'MODEL_TRANSPORT_ERROR','ANALYZER_UNAVAILABLE','ANALYSIS_BUDGET_EXHAUSTED',
  'SOURCE_REFERENCE_INVALID','SOURCE_REFERENCE_MISMATCH','SOURCE_IDENTITY_MISMATCH',
  'SOURCE_HASH_CHANGED','SOURCE_OUTSIDE_CONSENT','MESSAGE_NOT_FOUND','STALE_MESSAGE_REFERENCE',
  'MESSAGE_TOO_LARGE','MIME_STRUCTURE_INVALID','MIME_TEXT_UNAVAILABLE','MIME_PART_INCOMPLETE',
  'MIME_PART_UNAVAILABLE','MIME_PART_MISMATCH','MIME_TEXT_UNREADABLE','MIME_HEADERS_TOO_LARGE',
  'SOURCE_CHANGED_DURING_READ','PROVIDER_UNAVAILABLE','ACCESS_DENIED','BRAIN_CONSENT_REQUIRED',
  'EVIDENCE_QUOTE_UNVERIFIED']);
export function analysisErrorCode(error) {
  const code=error?.message;
  return safeCodes.has(code)||/^MODEL_ANALYSIS_HTTP_[1-5]\d\d$/.test(code??'')
    ?code:'MODEL_TRANSPORT_ERROR';
}

export function analysisOutcome(audit,evidence,analysis) {
  Object.assign(audit,evidence,{normalizedAnalysisStatus:analysis.analysisStatus});
  audit.finalReason=audit.errorCode?.startsWith('MODEL_ANALYSIS_HTTP_')?'MODEL_HTTP_ERROR':
    audit.errorCode==='MODEL_ANALYSIS_INVALID_JSON'?'MODEL_INVALID_JSON':
    audit.errorCode==='MODEL_ANALYSIS_EMPTY_OUTPUT'?'MODEL_EMPTY_OUTPUT':
    audit.errorCode??(!audit.proposalReturned?'NO_PROPOSAL':
      !audit.quotePresent?'QUOTE_MISSING':audit.quoteLength<4?'QUOTE_TOO_SHORT':
      !audit.quoteMatchesAuthoredText?'QUOTE_NOT_IN_AUTHORED_TEXT':
      !audit.stateValid?'INVALID_STATE':'EVIDENCE_BACKED');
  return audit;
}

// Explicit allowlist: never spread a model response or arbitrary exception into the audit.
export function safeAnalysisAudit(audit) {
  const result={};
  for(const key of ['modelConfigured','apiKeyConfigured','proxyConfigured','analyzerEligible',
    'analyzerInvoked','modelRequestAttempted','modelResponseReceived','transportResponseReceived',
    'responseParsed','proposalReturned','quotePresent','quoteMatchesAuthoredText','stateValid',
    'caseEvidenceBacked'])result[key]=audit[key]===true;
  // null means dispatch was attempted, but receipt by the model service is unconfirmed.
  result.modelRequestSent=audit.modelRequestSent===null?null:audit.modelRequestSent===true;
  for(const key of ['httpStatus','modelHttpStatus'])result[key]=
    Number.isInteger(audit[key])&&audit[key]>=100&&audit[key]<=599?audit[key]:null;
  result.quoteLength=Number.isInteger(audit.quoteLength)&&audit.quoteLength>=0?
    Math.min(audit.quoteLength,500):0;
  result.normalizedAnalysisStatus=audit.normalizedAnalysisStatus==='evidence_backed'?
    'evidence_backed':'unreviewed';
  result.eligibilityReason=['MODEL_NOT_CONFIGURED','ANALYSIS_TRANSPORT_NOT_CONFIGURED']
    .includes(audit.eligibilityReason)?audit.eligibilityReason:null;
  result.errorCode=audit.errorCode?analysisErrorCode({message:audit.errorCode}):null;
  const reasons=['EVIDENCE_BACKED','NO_PROPOSAL','QUOTE_MISSING','QUOTE_TOO_SHORT',
    'QUOTE_NOT_IN_AUTHORED_TEXT','INVALID_STATE','MODEL_HTTP_ERROR','MODEL_INVALID_JSON',
    'MODEL_EMPTY_OUTPUT','CASE_UPDATE_CONFLICT','CASE_NOT_LATEST_MESSAGE',
    'SOURCE_MOVED_OR_UNAVAILABLE'];
  result.finalReason=reasons.includes(audit.finalReason)?audit.finalReason:
    analysisErrorCode({message:audit.finalReason});
  return result;
}
