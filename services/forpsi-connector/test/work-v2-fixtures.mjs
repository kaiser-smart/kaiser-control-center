import { fixture } from './fixtures.mjs';
import { MailBrain } from '../src/mail-brain.mjs';
import { WorkStoreV2 } from '../src/work-v2-store.mjs';
import { sourceSegments,noCondition,propertyNames,workHash } from '../src/work-v2-contract.mjs';

export const alice={kind:'person',id:'alice',label:'Alice',address:'alice@example.com'};
export const vendor={kind:'external',id:null,label:'vendor@example.test',address:'vendor@example.test'};
export async function workFixture(){
  const f=fixture();f.env.MAIL_BRAIN_ENABLED='true';f.env.MAIL_BRAIN_V2_ENABLED='true';
  f.env.MAIL_BRAIN_V2_ANALYSIS_MODE='api';f.env.MAIL_BRAIN_V2_DAILY_CALL_LIMIT='20';
  const brain=new MailBrain({...f,analyzer:null});
  await brain.consent({mailboxId:'mail-a'});
  for(const cap of ['facts.review','work.manage'])await f.store.run(`INSERT INTO brain_work_authorities_v2
    (tenant_id,principal_id,mailbox_id,capability,enabled,approved_by,approved_at) VALUES ('tenant-a','alice','mail-a',?,1,'admin',?)`,cap,f.now());
  await f.store.run(`INSERT INTO brain_entities_v2 (id,tenant_id,kind,label,address,principal_id,verified_by,verified_at)
    VALUES ('alice','tenant-a','person','Alice','alice@example.com','alice','admin',?)`,f.now());
  const mailbox=await f.store.access(f.principal,'mail-a','read');
  const ids=[];
  async function add(text='Pošlu podklady.',uid=1,replyTo=null,sender='alice@example.com',attachments=[]){
    const result=await brain.indexMessage(mailbox,{reference:{folder:'Sent',uid,uidValidity:'7'},
      messageId:`<v2-${uid}@example.test>`,inReplyTo:replyTo,from:[{address:sender}],
      to:[{address:'vendor@example.test'}],cc:[],subject:'Podklady',text,
      date:new Date(f.now()-60000+uid).toISOString(),size:300,attachments},'Sent',f.provider);
    ids.push(result);return result;
  }
  const first=await add(),work=new WorkStoreV2(brain);
  async function proposal(caseId=first.caseId,sourceId=first.messageId){
    const source=await f.store.first('SELECT * FROM brain_messages WHERE id=?',sourceId);
    const anchor=sourceSegments(source)[0],cite={messageId:source.id,scope:'authored_text',quote:anchor.text,sourceLevel:'1'};
    return {events:[{messageId:source.id,anchorSegmentId:anchor.id,slot:0,targetWorkItemId:null,kind:'promised',
      sourceLevel:'1',actor:alice,owner:alice,counterparty:vendor,action:'Poslat podklady',category:'other',
      dueDate:null,condition:noCondition(),result:'unspecified',requiresDecision:false,
      evidence:Object.fromEntries(propertyNames.map(p=>[p,p==='dueDate'?[]:[cite]]))}],signals:[]};
  }
  async function accept(caseId=first.caseId){const detail=await work.getCase({caseId});
    return work.review({caseId,revision:detail.revision,eventId:detail.proposals[0].event.id,
      outcome:'accepted',authorityConfirmed:true},'soai_session');}
  return {...f,brain,work,first,add,proposal,accept};
}
