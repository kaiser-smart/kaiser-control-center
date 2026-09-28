import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./oauth-provider-test-loader.mjs',import.meta.url));
const {createOAuthPilot}=await import('../src/oauth-pilot.mjs');

test('daily ChatGPT access remains refreshable overnight without lengthening bearer tokens',()=>{
  const provider=createOAuthPilot({fetch:async()=>new Response(null,{status:404})});
  assert.equal(provider.options.accessTokenTTL,15*60);
  assert.equal(provider.options.refreshTokenTTL,30*24*60*60,
    'A connection used on successive days must not expire after twelve hours or live indefinitely');
  assert.equal(provider.options.refreshTokenIdleTTL,undefined);
});
