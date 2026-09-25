import { createRemoteJWKSet, jwtVerify } from 'jose';
import { requireValue } from './errors.mjs';
import { ACTIONS } from './access-policy.mjs';
export function authConfig(env) {
  for (const name of ['MCP_RESOURCE', 'OAUTH_ISSUER', 'OAUTH_JWKS_URL']) {
    const url = new URL(env[name]);
    requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search,
      'AUTH_NOT_CONFIGURED');
  }
  return { resource: env.MCP_RESOURCE, issuer: env.OAUTH_ISSUER, jwks: env.OAUTH_JWKS_URL };
}
export function metadata(env) {
  const config = authConfig(env);
  return { resource: config.resource, authorization_servers: [config.issuer],
    scopes_supported: ACTIONS.map(a => `forpsi:${a}`), bearer_methods_supported: ['header'] };
}
export function challenge(env) {
  const url = new URL('/.well-known/oauth-protected-resource', env.MCP_RESOURCE);
  return `Bearer resource_metadata="${url.href}", error="invalid_token"`;
}
const resolvers = new Map();
export async function authenticate(request, env, store) {
  const config = authConfig(env);
  const auth = request.headers.get('authorization') ?? '';
  requireValue(/^Bearer [^\s]+$/i.test(auth) && auth.length < 16384, 'AUTH_REQUIRED');
  if (!resolvers.has(config.jwks)) resolvers.set(config.jwks, createRemoteJWKSet(new URL(config.jwks)));
  return verifyToken(auth.slice(7), config, resolvers.get(config.jwks), store);
}
export async function verifyToken(token, config, keyResolver, store) {
  const { payload } = await jwtVerify(token, keyResolver, {
    issuer: config.issuer, audience: config.resource, algorithms: ['RS256', 'ES256'],
    requiredClaims: ['sub', 'iss', 'aud', 'exp'], clockTolerance: 5,
  });
  const actor = await store.identity(payload.iss, payload.sub);
  requireValue(actor, 'AUTH_REQUIRED');
  return { id: actor.id, scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [] };
}
