// Documented CCS BBS transport. Deliberately separate from production import:
// account access, current file semantics and freshness still require live proof.
export const CCS_BBS_DIRECTORY = 'https://bbs.ccs.cz/cgi-bbs/bbsuser/';
export const CCS_BBS_CURRENT_PURCHASES = 'https://bbs.ccs.cz/cgi-bbs/cerpani/';
const MAX_BYTES = 10 * 1024 * 1024;
const fail = code => { throw Object.assign(new Error(code), { code }); };
function auth(env) {
  const user = env.CCS_BBS_USERNAME, password = env.CCS_BBS_PASSWORD;
  if (!user || !password) fail('ccs_bbs_credentials_not_configured');
  // The historic service does not document Unicode credentials. Do not silently
  // alter their encoding or try alternate passwords/usernames after a rejection.
  if (!/^[\x20-\x7e]+$/.test(user) || user.includes(':') || !/^[\x20-\x7e]+$/.test(password)) fail('ccs_bbs_credential_encoding_not_verified');
  return 'Basic ' + btoa(user + ':' + password);
}
async function boundedBody(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); fail('ccs_bbs_response_too_large'); }
  if (!response.body) fail('ccs_bbs_empty_response');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const {value,done} = await reader.read(); if (done) break;
      size += value.length; if (size > MAX_BYTES) { await reader.cancel(); fail('ccs_bbs_response_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return bytes;
}
async function request(url, env, fetcher) {
  const authorization = auth(env);
  let response;
  try { response = await fetcher(url, {method:'GET',redirect:'manual',headers:{Authorization:authorization,Accept:'text/html, text/plain, application/octet-stream'},signal:AbortSignal.timeout(15000)}); }
  catch { fail('ccs_bbs_transport_failed'); }
  if (response.status === 401 || response.status === 403) { await response.body?.cancel(); fail('ccs_bbs_access_not_enabled_or_credentials_invalid'); }
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); fail('ccs_bbs_redirect_requires_review'); }
  if (response.status !== 200) { await response.body?.cancel(); fail('ccs_bbs_http_failed'); }
  try { return {bytes:await boundedBody(response),contentType:response.headers.get('content-type') || ''}; }
  catch (error) { if (['ccs_bbs_response_too_large','ccs_bbs_empty_response'].includes(error.code)) throw error; fail('ccs_bbs_transport_failed'); }
}
export async function inspectCcsBbsAccess(env, fetcher = fetch) {
  const result = await request(CCS_BBS_DIRECTORY,env,fetcher);
  // HTTP 200 is not proof of a complete transaction feed. Keep the original
  // private response in memory for authorized inspection, never in ordinary logs.
  return {...result,endpoint:CCS_BBS_DIRECTORY,accountVerified:false,coverageVerified:false,sourceConnected:false};
}
function validFileUrl(value) {
  let url; try { url = new URL(value); } catch { fail('ccs_bbs_file_not_allowed'); }
  if (url.origin !== 'https://bbs.ccs.cz' || url.username || url.password || url.search || url.hash || !/^\/cgi-bbs\/bbsuser\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:txe|f-z)$/i.test(url.pathname)) fail('ccs_bbs_file_not_allowed');
  return url.href;
}
export function listedCcsBbsFiles(html) {
  if (typeof html !== 'string' || html.length > MAX_BYTES) fail('ccs_bbs_listing_invalid');
  const urls = new Set();
  // Accept a conservative subset of ordinary directory anchors: href first,
  // quoted, outside comments and executable/style blocks. Unsupported markup
  // requires inspection, never a reconstructed download URL.
  const listing = html.replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
  for (const match of listing.matchAll(/<a\s+href\s*=\s*(["'])([^"']+)\1(?=\s|>)/gi)) {
    // Ignore all encoded/foreign/unsupported references rather than reconstruct
    // an endpoint or filename from customer number and calendar month.
    if (/[&%\\]/.test(match[2])) continue;
    try { urls.add(validFileUrl(new URL(match[2],CCS_BBS_DIRECTORY).href)); } catch {}
  }
  return [...urls];
}
export async function downloadListedCcsBbsFile(env, url, directoryHtml, fetcher = fetch) {
  const verifiedUrl = validFileUrl(url);
  if (!listedCcsBbsFiles(directoryHtml).includes(verifiedUrl)) fail('ccs_bbs_file_not_listed');
  return request(verifiedUrl,env,fetcher);
}
