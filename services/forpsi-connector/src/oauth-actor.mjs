import { Store } from './store.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { requireValue } from './errors.mjs';
import { CONNECTOR_SCOPES } from './oauth-client-policy.mjs';

export async function principalId(env,userId){
  requireValue(env.DB&&env.FORPSI_TENANT_ID,'ACCESS_DENIED');
  const actor=await new Store(env.DB).identity(SOAI_ISSUER,userId);
  requireValue(actor?.tenant_id===env.FORPSI_TENANT_ID,'ACCESS_DENIED');
  return actor.id;
}

export async function pilotActor(env,userId){
  requireValue(env.DB&&env.PERSONAL_PILOT_READ_ONLY==='true'&&
    env.PERSONAL_PILOT_PRINCIPAL_ID&&env.PERSONAL_PILOT_MAILBOX_ID,'PILOT_ACCESS_DENIED');
  const store=new Store(env.DB),actor=await store.identity(SOAI_ISSUER,userId);
  requireValue(actor?.id===env.PERSONAL_PILOT_PRINCIPAL_ID,'PILOT_ACCESS_DENIED');
  await store.access({id:actor.id,scopes:['forpsi:read']},env.PERSONAL_PILOT_MAILBOX_ID,'read');
  return {store,principal:{id:actor.id,scopes:['forpsi:read']}};
}

// OAuth userId is issued by the SO.ai session bridge. An email address supplied
// by the model or client never creates an identity or mailbox grant.
export async function connectorActor(env,userId,scopes,boundPrincipalId,pilotOnly=false){
  requireValue(env.DB&&env.FORPSI_TENANT_ID,'ACCESS_DENIED');
  requireValue(Array.isArray(scopes)&&scopes.length>0&&
    scopes.every(scope=>CONNECTOR_SCOPES.includes(scope)),'ACCESS_DENIED');
  const store=new Store(env.DB),actor=await store.identity(SOAI_ISSUER,userId);
  requireValue(actor?.tenant_id===env.FORPSI_TENANT_ID,'ACCESS_DENIED');
  const legacyPilot=!boundPrincipalId||pilotOnly;
  if(legacyPilot){
    // Tokens issued by the original personal pilot are still read-only and
    // bound to its original principal and mailbox until they expire.
    requireValue(scopes.length===1&&scopes[0]==='forpsi:read'&&
      actor.id===env.PERSONAL_PILOT_PRINCIPAL_ID&&!!env.PERSONAL_PILOT_MAILBOX_ID,
      'ACCESS_DENIED');
    if(boundPrincipalId)requireValue(actor.id===boundPrincipalId,'ACCESS_DENIED');
    await store.access({id:actor.id,scopes},env.PERSONAL_PILOT_MAILBOX_ID,'read');
  }else{
    requireValue(actor.id===boundPrincipalId,'ACCESS_DENIED');
    const granted=await store.rows(`SELECT DISTINCT g.action FROM grants g
      JOIN mailboxes m ON m.id=g.mailbox_id AND m.tenant_id=? AND m.active=1
      WHERE g.principal_id=? AND g.revoked=0`,actor.tenant_id,actor.id);
    requireValue(scopes.every(scope=>granted.some(row=>scope===`forpsi:${row.action}`)),
      'ACCESS_DENIED');
  }
  return {store,principal:{id:actor.id,scopes},legacyPilot};
}
