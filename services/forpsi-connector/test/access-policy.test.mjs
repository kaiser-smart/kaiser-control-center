import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeResourceRead } from '../src/access-policy.mjs';

const principal = { subject: 'employee-a', tenantId: 'company-a', scopes: ['forpsi:read'] };
const resource = { id: 'resource-a', tenantId: 'company-a' };
const grant = { subject: 'employee-a', tenantId: 'company-a', resourceId: 'resource-a', permission: 'read', revoked: false };

test('explicit grant allows the matching employee to read', () => {
  assert.equal(authorizeResourceRead(principal, resource, [grant]), true);
});
test('another employee cannot inherit access', () => {
  assert.equal(authorizeResourceRead({ ...principal, subject: 'employee-b' }, resource, [grant]), false);
});
test('same resource identifier in another company cannot cross tenant boundary', () => {
  assert.equal(authorizeResourceRead(principal, { ...resource, tenantId: 'company-b' }, [grant]), false);
});
test('missing scope, revoked grant and unspecified revocation state deny access', () => {
  assert.equal(authorizeResourceRead({ ...principal, scopes: [] }, resource, [grant]), false);
  assert.equal(authorizeResourceRead(principal, resource, [{ ...grant, revoked: true }]), false);
  assert.equal(authorizeResourceRead(principal, resource, [{ ...grant, revoked: undefined }]), false);
});
test('unassigned resources and write-only grants deny read access', () => {
  assert.equal(authorizeResourceRead(principal, { ...resource, id: 'resource-b' }, [grant]), false);
  assert.equal(authorizeResourceRead(principal, resource, [{ ...grant, permission: 'write' }]), false);
});
test('missing identity and malformed input fail closed', () => {
  assert.equal(authorizeResourceRead(null, resource, [grant]), false);
  assert.equal(authorizeResourceRead({}, {}, [{}]), false);
  assert.equal(authorizeResourceRead(principal, resource, null), false);
});
