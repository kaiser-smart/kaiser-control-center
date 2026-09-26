const STABLE_CLIENT='https://chatgpt.com/oauth/client.json';

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
