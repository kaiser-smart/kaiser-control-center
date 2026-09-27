import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { SOAI_ISSUER } from '../src/admin-access.mjs';
import { connectorActor } from '../src/oauth-actor.mjs';

const setup=()=>{
  const f=fixture();
  f.sqlite.prepare('UPDATE principals SET issuer=?,subject=? WHERE id=?')
    .run(SOAI_ISSUER,'user-a','alice');
  return {...f,env:{...f.env,FORPSI_TENANT_ID:'tenant-a',
    PERSONAL_PILOT_PRINCIPAL_ID:'alice',PERSONAL_PILOT_MAILBOX_ID:'mail-a'}};
};

test('production OAuth binds SO.ai user and principal and rechecks each scope grant',async()=>{
  const f=setup();
  const actor=await connectorActor(f.env,'user-a',['forpsi:read','forpsi:send'],'alice');
  assert.deepEqual(actor.principal,{id:'alice',scopes:['forpsi:read','forpsi:send']});
  await assert.rejects(connectorActor(f.env,'another-user',['forpsi:read'],'alice'));
  await assert.rejects(connectorActor(f.env,'user-a',['forpsi:read'],'bob'));
  await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND action='send'");
  await assert.rejects(connectorActor(f.env,'user-a',['forpsi:read','forpsi:send'],'alice'));
  assert.equal((await connectorActor(f.env,'user-a',['forpsi:read'],'alice')).principal.id,'alice');
});

test('old pilot token cannot grow beyond its original read-only mailbox',async()=>{
  const f=setup();
  assert.equal((await connectorActor(f.env,'user-a',['forpsi:read'],undefined)).legacyPilot,true);
  assert.equal((await connectorActor(f.env,'user-a',['forpsi:read'],'alice',true)).legacyPilot,true);
  await assert.rejects(connectorActor(f.env,'user-a',['forpsi:send'],undefined));
  await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND action='read'");
  await assert.rejects(connectorActor(f.env,'user-a',['forpsi:read'],undefined));
});
