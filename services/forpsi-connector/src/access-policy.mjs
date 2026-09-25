/** Internal policy only. principal must come from a verified OAuth token,
 * never from MCP arguments. grants must come from trusted server storage.
 * This module does not verify tokens or implement an OAuth server.
 */
export const ACTIONS = ['read', 'write', 'send', 'delete', 'schedule'];
export function authorizeResource(principal, resource, grants, action) {
  const validId = value => typeof value === 'string' && value.trim().length > 0;
  if (!ACTIONS.includes(action) || !principal || !resource || !Array.isArray(grants)) return false;
  if (![principal.subject, principal.tenantId, resource.id, resource.tenantId].every(validId)) return false;
  if (principal.tenantId !== resource.tenantId) return false;
  if (!Array.isArray(principal.scopes) || !principal.scopes.includes(`forpsi:${action}`)) return false;
  return grants.some(grant => grant && grant.subject === principal.subject &&
    grant.tenantId === principal.tenantId && grant.resourceId === resource.id &&
    grant.permission === action && grant.revoked === false);
}
export const authorizeResourceRead = (principal, resource, grants) =>
  authorizeResource(principal, resource, grants, 'read');
