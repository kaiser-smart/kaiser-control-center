const STABLE_CLIENT='https://chatgpt.com/oauth/client.json';
export const CONNECTOR_SCOPES=['forpsi:read','forpsi:write','forpsi:send','forpsi:delete','forpsi:schedule'];

// ChatGPT publishes either its stable CIMD URL or a callback-specific one.
// The provider still verifies the fetched CIMD and its declared redirect URI.
export function chatgptClientCallback(clientId){
  if(clientId===STABLE_CLIENT)return 'https://chatgpt.com/connector_platform_oauth_redirect';
  const match=/^https:\/\/chatgpt\.com\/oauth\/([a-zA-Z0-9_-]+)\/client\.json$/.exec(clientId);
  return match?`https://chatgpt.com/connector/oauth/${match[1]}`:null;
}

export function isPilotAuthorization(request){
  const expected=chatgptClientCallback(request?.clientId);
  return !!expected&&expected===request?.redirectUri&&
    request?.codeChallengeMethod==='S256'&&
    request?.scope?.length===1&&request.scope[0]==='forpsi:read'&&
    request?.resource==='https://smart-odpady.ai/mcp';
}

export function isConnectorAuthorization(request){
  const expected=chatgptClientCallback(request?.clientId);
  const scopes=request?.scope;
  return !!expected&&expected===request?.redirectUri&&
    request?.codeChallengeMethod==='S256'&&
    Array.isArray(scopes)&&scopes.length>0&&scopes.length<=CONNECTOR_SCOPES.length&&
    new Set(scopes).size===scopes.length&&scopes.every(scope=>CONNECTOR_SCOPES.includes(scope))&&
    request?.resource==='https://smart-odpady.ai/mcp';
}
