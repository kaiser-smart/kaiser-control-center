import OAuthProvider, { AuthorizationError, CimdFetchError } from '@cloudflare/workers-oauth-provider';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { handleMcp } from './mcp.mjs';
import { Forpsi } from './forpsi.mjs';
import { CalDav } from './caldav.mjs';
import { CardDav } from './carddav.mjs';
import { Organizer } from './organize.mjs';
import { Outbox } from './outbox.mjs';
import { requireValue } from './errors.mjs';
import { chatgptClientCallback, isPilotAuthorization, isConnectorAuthorization,
  CONNECTOR_SCOPES } from './oauth-client-policy.mjs';
import { pilotActor, connectorActor, principalId } from './oauth-actor.mjs';

export const PILOT_RESOURCE='https://smart-odpady.ai/mcp';
export const PILOT_ISSUER='https://smart-odpady.ai';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const safeHtml=value=>String(value).replace(/[&<>"']/g,char=>`&#${char.charCodeAt(0)};`);
function consentProof(env,handle,userId,scopes){
  requireValue((env.CONNECTOR_ADMIN_TOKEN??'').length>=32,'PILOT_CLIENT_DENIED');
  return createHmac('sha256',env.CONNECTOR_ADMIN_TOKEN)
    .update(JSON.stringify([handle,userId,scopes])).digest('hex');
}

function serviceActor(request,env){
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
  // This endpoint is reachable only through the SO.ai Service Binding, but still
  // checks the existing service secret. Never trust a browser-supplied user ID.
  const expected=env.CONNECTOR_ADMIN_TOKEN??'';
  requireValue(expected.length>=32&&supplied.length===expected.length&&
    timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)),
    'ACCESS_DENIED');
  const userId=request.headers.get('x-soai-user-id')??'';
  requireValue(/^[a-zA-Z0-9_-]{1,128}$/.test(userId),'ACCESS_DENIED');
  return userId;
}

const scopeDescriptions={
  'forpsi:read':'Číst povolenou poštu, její pracovní přehled a nastavení.',
  'forpsi:write':'Vytvářet návrhy, složky a upravovat zprávy či nastavení.',
  'forpsi:send':'Připravovat odeslání; každá konkrétní zpráva vyžaduje samostatné potvrzení.',
  'forpsi:delete':'Přesunout zprávu do koše nebo odstranit položky tam, kde to nástroj výslovně uvádí.',
  'forpsi:schedule':'Naplánovat odeslání konkrétně potvrzené zprávy.'
};

function consentHtml(details,handle,scopes,proof){
  return `<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Přístup k poště Forpsi</title><body style="font:16px system-ui;max-width:42rem;margin:3rem auto;padding:1rem;line-height:1.5">
<h1>Připojit Forpsi k ChatGPT?</h1><p>Žádá <strong>${safeHtml(details.clientName)}</strong> (${safeHtml(details.clientDomain??'neověřená doména')}).
Přístupový kód se vrátí na <strong>${safeHtml(details.redirectHost)}</strong>.</p>
<p>Schvalujete následující oprávnění pouze ke schránkám, ke kterým vám SO.ai udělilo přístup:</p>
<ul>${scopes.map(scope=>`<li><strong>${safeHtml(scope)}</strong>: ${safeHtml(scopeDescriptions[scope])}</li>`).join('')}</ul>
<p>Přístup můžete odebrat v <a href="/forpsi-access/">nastavení SO.ai</a>. Obsah zprávy se nikdy neodešle jen tímto souhlasem.</p>
<form method="post"><input type="hidden" name="handle" value="${safeHtml(handle)}">
<input type="hidden" name="proof" value="${safeHtml(proof)}">
${scopes.map(scope=>`<input type="hidden" name="scope" value="${safeHtml(scope)}">`).join('')}
<button name="decision" value="approve">Schválit uvedený přístup</button>
<button name="decision" value="deny">Nepřipojovat</button></form></body></html>`;
}

export function createOAuthPilot(legacyWorker){
  const provider=new OAuthProvider({
    apiRoute:'/mcp',authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',
    scopesSupported:CONNECTOR_SCOPES,accessTokenTTL:900,refreshTokenTTL:43200,
    clientIdMetadataDocumentEnabled:true,
    resourceMetadata:{resource:PILOT_RESOURCE,authorization_servers:[PILOT_ISSUER],
      scopes_supported:CONNECTOR_SCOPES,bearer_methods_supported:['header'],resource_name:'Forpsi firemní konektor'},
    apiHandler:{async fetch(request,env,ctx){
      if(env.CONNECTOR_ENABLED!=='true')return json({error:'CONNECTOR_DISABLED'},503);
      const origin=request.headers.get('origin');
      if(origin&&origin!==PILOT_ISSUER&&origin!=='https://chatgpt.com')
        return json({error:'ORIGIN_DENIED'},403);
      if(ctx.auth?.audience!==PILOT_RESOURCE||!Array.isArray(ctx.auth.scope)||
        !ctx.auth.scope.length||ctx.auth.scope.some(scope=>!CONNECTOR_SCOPES.includes(scope))||
        !chatgptClientCallback(ctx.auth.clientId)||
        ctx.auth.userId!==ctx.props?.userId)return json({error:'PILOT_ACCESS_DENIED'},403);
      if(env.PERSONAL_PILOT_READ_ONLY==='true'&&
        (ctx.auth.scope.length!==1||ctx.auth.scope[0]!=='forpsi:read'))
        return json({error:'PILOT_ACCESS_DENIED'},403);
      try{
        const {store,principal,legacyPilot}=env.PERSONAL_PILOT_READ_ONLY==='true'?
          {...await pilotActor(env,ctx.props.userId),legacyPilot:true}:
          await connectorActor(env,ctx.props.userId,ctx.auth.scope,ctx.props.principalId,
            ctx.props.pilotOnly===true);
        const effectiveEnv=legacyPilot?{...env,PERSONAL_PILOT_READ_ONLY:'true'}:env;
        return await handleMcp(request,{store,principal,env:effectiveEnv,
          providerFactory:(settings,mailbox)=>new Forpsi(settings,mailbox),
          calendarFactory:(settings,mailbox)=>new CalDav(settings,mailbox),
          contactFactory:(settings,mailbox)=>new CardDav(settings,mailbox),
          organizer:new Organizer(store),outbox:new Outbox(store,env,(settings,mailbox)=>new Forpsi(settings,mailbox))});
      }catch{return json({error:'PILOT_ACCESS_DENIED'},403);}
    }},
    defaultHandler:{async fetch(request,env){
      const path=new URL(request.url).pathname;
      if(path==='/internal/oauth/access'){
        try{
          const userId=serviceActor(request,env);
          if(env.PERSONAL_PILOT_READ_ONLY==='true')await pilotActor(env,userId);
          else await principalId(env,userId);
          const oauth=env.OAUTH_PROVIDER;
          if(request.method==='GET'){
            const grants=await oauth.listUserGrants(userId,{limit:100});
            return json({grants:grants.items.filter(x=>chatgptClientCallback(x.clientId)).map(x=>({id:x.id,
              createdAt:x.createdAt,scope:x.scope})),incomplete:!!grants.cursor});
          }
          if(request.method==='POST'){
            const body=await request.text();
            requireValue(body.length<=300,'INVALID_ARGUMENTS');
            const parsed=JSON.parse(body);
            requireValue(typeof parsed?.grantId==='string'&&parsed.grantId.length<=200&&
              Object.keys(parsed).length===1,'INVALID_ARGUMENTS');
            const grants=await oauth.listUserGrants(userId,{limit:100});
            requireValue(grants.items.some(x=>x.id===parsed.grantId&&chatgptClientCallback(x.clientId)),
              'ACCESS_DENIED');
            await oauth.revokeGrant(parsed.grantId,userId);
            return json({revoked:true});
          }
          return json({error:'METHOD_NOT_ALLOWED'},405);
        }catch{return json({error:'ACCESS_DENIED'},403);}
      }
      if(path.startsWith('/internal/')||path==='/health')return legacyWorker.fetch(request,env);
      if(path!=='/authorize')return json({error:'NOT_FOUND'},404);
      if(env.CONNECTOR_ENABLED!=='true')return json({error:'CONNECTOR_DISABLED'},503);
      try{
        const userId=serviceActor(request,env);
        const oauth=env.OAUTH_PROVIDER;
        if(request.method==='GET'){
          const parsed=await oauth.parseAuthRequest(request);
          requireValue(env.PERSONAL_PILOT_READ_ONLY==='true'?
            isPilotAuthorization(parsed):isConnectorAuthorization(parsed),'PILOT_CLIENT_DENIED');
          if(env.PERSONAL_PILOT_READ_ONLY==='true')await pilotActor(env,userId);
          else await connectorActor(env,userId,parsed.scope,await principalId(env,userId));
          const consent=await oauth.beginConsent(parsed);
          consent.headers.set('Content-Type','text/html; charset=utf-8');
          consent.headers.set('Cache-Control','no-store');
          return new Response(consentHtml({clientName:'ChatGPT',clientDomain:'chatgpt.com',
            redirectHost:'chatgpt.com'},consent.handle,parsed.scope,
            consentProof(env,consent.handle,userId,parsed.scope)),{headers:consent.headers});
        }
        if(request.method==='POST'){
          const form=await request.formData(),handle=String(form.get('handle')??'');
          requireValue(handle.length<300,'PILOT_CLIENT_DENIED');
          if(form.get('decision')!=='approve'){
            const denied=await oauth.denyConsent(request,handle);
            return new Response(null,{status:302,headers:denied.headers});
          }
          const selected=form.getAll('scope').map(String);
          requireValue(selected.length>0&&selected.every(scope=>CONNECTOR_SCOPES.includes(scope)),
            'PILOT_CLIENT_DENIED');
          const supplied=String(form.get('proof')??'');
          const expected=consentProof(env,handle,userId,selected);
          requireValue(supplied.length===expected.length&&
            timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)),'PILOT_CLIENT_DENIED');
          const approved=await oauth.approveConsent(request,handle,{scope:selected});
          requireValue(env.PERSONAL_PILOT_READ_ONLY==='true'?
            isPilotAuthorization(approved.request):isConnectorAuthorization(approved.request),
            'PILOT_CLIENT_DENIED');
          const scope=approved.request.scope;
          requireValue(scope.length===selected.length&&scope.every(item=>selected.includes(item)),
            'PILOT_CLIENT_DENIED');
          const access=env.PERSONAL_PILOT_READ_ONLY==='true'?
            await pilotActor(env,userId):await connectorActor(env,userId,scope,await principalId(env,userId));
          const {redirectTo}=await oauth.completeAuthorization({request:approved.request,
            userId,metadata:{},scope,props:{userId,principalId:access.principal.id,
              pilotOnly:env.PERSONAL_PILOT_READ_ONLY==='true'}});
          approved.headers.set('Location',redirectTo);
          return new Response(null,{status:302,headers:approved.headers});
        }
        return json({error:'METHOD_NOT_ALLOWED'},405);
      }catch(error){
        if(error instanceof AuthorizationError||error instanceof CimdFetchError)
          return new Response('Požadavek na připojení není platný.',{status:400});
        return json({error:'PILOT_AUTH_UNAVAILABLE'},403);
      }
    }},
  });
  return provider;
}
