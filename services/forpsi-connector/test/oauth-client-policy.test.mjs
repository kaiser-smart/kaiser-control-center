import test from 'node:test';
import assert from 'node:assert/strict';
import { chatgptClientCallback, isPilotAuthorization, isConnectorAuthorization,
  CONNECTOR_SCOPES } from '../src/oauth-client-policy.mjs';

const stable='https://chatgpt.com/oauth/client.json';
const stableRedirect='https://chatgpt.com/connector_platform_oauth_redirect';
const request={clientId:stable,redirectUri:stableRedirect,codeChallengeMethod:'S256',
  scope:['forpsi:read'],resource:'https://smart-odpady.ai/mcp'};

test('exact ChatGPT stable and callback-specific CIMD identities have exact return URLs',()=>{
  assert.equal(chatgptClientCallback(stable),stableRedirect);
  assert.equal(chatgptClientCallback('https://chatgpt.com/oauth/callback_123/client.json'),
    'https://chatgpt.com/connector/oauth/callback_123');
  assert.equal(chatgptClientCallback('https://chatgpt.com.evil.test/oauth/client.json'),null);
  assert.equal(chatgptClientCallback('https://chatgpt.com/oauth/../client.json'),null);
  assert.equal(chatgptClientCallback('http://chatgpt.com/oauth/client.json'),null);
});

test('authorization denies wrong redirect, scope, resource or PKCE method',()=>{
  assert.equal(isPilotAuthorization(request),true);
  for(const mutation of [
    {redirectUri:'https://chatgpt.com/connector/oauth/another'},
    {redirectUri:'https://attacker.test/callback'},
    {scope:['forpsi:read','forpsi:write']},
    {scope:[]},
    {resource:'https://smart-odpady.ai/'},
    {codeChallengeMethod:'plain'},
    {codeChallengeMethod:undefined},
  ])assert.equal(isPilotAuthorization({...request,...mutation}),false);
});

test('production OAuth permits only explicit known scopes on the exact ChatGPT callback',()=>{
  assert.equal(isConnectorAuthorization({...request,scope:CONNECTOR_SCOPES}),true);
  assert.equal(isConnectorAuthorization({...request,scope:['forpsi:read','forpsi:send']}),true);
  for(const change of [{scope:[]},{scope:['forpsi:read','forpsi:read']},
    {scope:['forpsi:admin']},{scope:['forpsi:read','forpsi:admin']},
    {redirectUri:'https://chatgpt.com.evil.test/callback'},
    {resource:'https://other.example/mcp'},{codeChallengeMethod:'plain'}])
    assert.equal(isConnectorAuthorization({...request,...change}),false);
});
