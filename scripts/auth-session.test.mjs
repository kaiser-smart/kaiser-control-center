import assert from 'node:assert/strict';
import { createSessionCookie, verifySession, clearSessionCookie } from '../functions/_lib/auth.js';
import { onRequestPost } from '../functions/api/auth/verify.js';
import { DEFAULT_USERS } from '../functions/_lib/default-users.js';

const env = { AUTH_MODE: 'mock', AUTH_SESSION_TTL_SECONDS: '43200' };
const user = DEFAULT_USERS[0];
const realNow = Date.now;
const issuedAt = 1800000000000;
const requestFor = cookie => new Request('https://example.test/', { headers: { Cookie: cookie.split(';')[0] } });
try {
  for (const [rememberMe, ttl] of [[true, 2592000], [false, 43200], [undefined, 43200], ['true', 43200], [1, 43200]]) {
    Date.now = () => issuedAt;
    const response = await onRequestPost({ env, request: new Request('https://example.test/api/auth/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: user.email, code: '123456', rememberMe })
    }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.ok(cookie.includes(`Max-Age=${ttl}`));
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(cookie.includes(flag));
    const session = await verifySession(env, requestFor(cookie));
    assert.equal(session.exp - session.iat, ttl);
    Date.now = () => issuedAt + (ttl - 1) * 1000;
    assert.ok(await verifySession(env, requestFor(cookie)));
    Date.now = () => issuedAt + (ttl + 1) * 1000;
    assert.equal(await verifySession(env, requestFor(cookie)), null);
  }
  Date.now = () => issuedAt;
  const denied = await onRequestPost({ env, request: new Request('https://example.test/api/auth/verify', {
    method: 'POST', body: JSON.stringify({ identifier: user.email, code: '000000', rememberMe: true })
  }) });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('set-cookie'), null);
  const cookie = await createSessionCookie(env, user, true);
  const parts = cookie.split(';')[0].split('=');
  const [encoded, signature] = parts[1].split('.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  payload.exp += 86400;
  const forged = `${parts[0]}=${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`;
  assert.equal(await verifySession(env, requestFor(forged)), null);
  assert.match(clearSessionCookie(env), /Max-Age=0/);
} finally { Date.now = realNow; }
console.log('Auth session: 30 days / 12 hours, expiry, strict opt-in, invalid OTP, tampering and logout passed.');
