// Capture the actual OAuthProvider configuration without a Cloudflare runtime.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@cloudflare/workers-oauth-provider') {
    const stub='export default class OAuthProvider { constructor(options) { this.options=options; } } '+
      'export class AuthorizationError extends Error {} export class CimdFetchError extends Error {}';
    return {url:`data:text/javascript,${encodeURIComponent(stub)}`,shortCircuit:true};
  }
  return nextResolve(specifier,context);
}
