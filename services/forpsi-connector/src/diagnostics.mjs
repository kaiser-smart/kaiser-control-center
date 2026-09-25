// Provider errors may contain credentials, AUTH payloads, addresses and response bodies.
// Persist only fixed classifications and numeric protocol status codes.
const codes = new Set([
  'EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ESOCKET', 'ETLS', 'EPROTOCOL',
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
  'ERR_NOT_IMPLEMENTED', 'ERR_METHOD_NOT_IMPLEMENTED', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_SOCKET_CLOSED',
  'SMTP_VERIFY_FAILED', 'CALDAV_ACCESS_DENIED', 'CALDAV_UNAVAILABLE',
  'CALDAV_DISCOVERY_UNAVAILABLE', 'CARDDAV_DISCOVERY_UNAVAILABLE',
  'DAV_URL_DENIED', 'DAV_XML_DENIED', 'DAV_RESPONSE_TOO_LARGE',
  'CREDENTIALS_NOT_CONFIGURED', 'MAILBOX_NOT_CONFIGURED',
]);
const stages = new Set(['root', 'principal', 'collections']);
const commands = new Map([
  ['CONN', 'connect'], ['EHLO', 'greeting'], ['HELO', 'greeting'], ['STARTTLS', 'tls'],
  ['AUTH PLAIN', 'auth'], ['AUTH LOGIN', 'auth'], ['AUTH CRAM-MD5', 'auth'], ['AUTH XOAUTH2', 'auth'],
]);
export function providerDiagnostic(error) {
  const result = { code: codes.has(error?.code) ? error.code : 'PROVIDER_UNAVAILABLE' };
  if (['TypeError', 'TimeoutError', 'AbortError', 'SyntaxError', 'NotSupportedError'].includes(error?.name)) result.type = error.name;
  if (codes.has(error?.cause?.code)) result.causeCode = error.cause.code;
  if (commands.has(error?.command)) result.phase = commands.get(error.command);
  if (stages.has(error?.davStage)) result.phase = error.davStage;
  if (Number.isInteger(error?.responseCode) && error.responseCode >= 400 && error.responseCode <= 599) result.smtpStatus = error.responseCode;
  if (Number.isInteger(error?.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599) result.httpStatus = error.httpStatus;
  return result;
}
