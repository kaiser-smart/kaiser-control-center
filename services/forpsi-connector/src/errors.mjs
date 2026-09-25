export class ConnectorError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function requireValue(condition, code) {
  if (!condition) throw new ConnectorError(code);
}
export const safeError = error => error instanceof ConnectorError ? error.code : 'PROVIDER_UNAVAILABLE';
