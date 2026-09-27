import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mailAppWidget } from '../src/mail-app-widget.mjs';
import { tools as mcpTools } from '../src/mcp.mjs';

class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';
    this.classList={toggle(){}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.textContent='';this.children=[...nodes];}
  setAttribute(){}
}
const content=element=>[element.textContent??'',...(element.children??[]).map(content)].join(' ');
function findButton(root,label){
  if(root.tag==='button'&&root.textContent===label)return root;
  for(const child of root.children??[]){const found=findButton(child,label);if(found)return found;}
  return null;
}
function mount(respond){
  const ids=new Map(['summary','home-text','notice','items','layout','detail','home','list',
    'draft','settings','tab-home','tab-list','tab-settings','resume','new-mail'].map(id=>{
    const element=new Element(id==='items'?'ol':'div');element.id=id;return [id,element];}));
  let onMessage;const calls=[];
  const parent={postMessage(message){
    if(message.method==='ui/notifications/initialized')return;
    calls.push(message);
    if(message.method==='tools/call'){
      const required=mcpTools.find(tool=>tool.name===message.params.name)?.inputSchema.required??[];
      for(const key of required)assert.ok(Object.hasOwn(message.params.arguments,key),
        `${message.params.name} must pass required MCP argument ${key}`);
    }
    const result=message.method==='ui/initialize'?{}:respond(message);
    onMessage({source:parent,data:{jsonrpc:'2.0',id:message.id,result}});
  }};
  const document={getElementById:id=>ids.get(id),createElement:tag=>new Element(tag)};
  const window={parent,addEventListener(name,callback){if(name==='message')onMessage=callback;}};
  const script=mailAppWidget.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);vm.runInNewContext(script,{document,window});
  return {ids,calls,notify:data=>onMessage({source:parent,data:{jsonrpc:'2.0',
    method:'ui/notifications/tool-result',params:{structuredContent:{data}}}})};
}

test('mail card opens exact numbered detail and updates personal state in place',async()=>{
  const item={number:2,reference:{folder:'INBOX',uid:12,uidValidity:'3'},
    from:'buyer@example.net',subject:'Poptávka',priority:'high',
    priorityReason:'Prosba o nabídku.',state:'todo',receivedAt:'2026-09-25T09:00:00Z'};
  const snapshot={listId:'fixed-list',mailboxId:'mail-a',items:[item],displayedCount:1,
    pending:1,semanticStatus:'chatgpt_proposal',olderUnscanned:false};
  const widget=mount(message=>{
    const {name,arguments:args}=message.params;
    if(name==='review_worklist'){
      assert.equal(args.number,2);
      assert.ok(args.timeZone,'The ChatGPT MCP schema requires timeZone even for opening a message.');
      return {structuredContent:{data:{position:2,message:{}}}};
    }
    if(name==='get_mail'){
      assert.deepEqual(JSON.parse(JSON.stringify(args.message)),item.reference);
      return {structuredContent:{data:{subject:'Poptávka',text:'Prosím o nabídku.',
        from:[{address:'buyer@example.net'}],to:[{address:'alice@example.com'}],cc:[],
        date:'2026-09-25T09:00:00Z',attachments:[]}}};
    }
    if(name==='process_worklist_command'){
      assert.equal(args.command,'2 hotovo');
      assert.ok(args.timeZone,'The ChatGPT MCP schema requires timeZone for state changes.');
      return {structuredContent:{data:{results:[{status:'completed',state:'done'}]}}};
    }
    if(name==='get_worklist')return {structuredContent:{data:{...snapshot,
      items:[{...item,state:'done'}],pending:0}}};
    throw new Error(name);
  });
  widget.notify(snapshot);
  const row=widget.ids.get('items').children[0].children[0];
  await row.onclick();
  assert.match(content(widget.ids.get('detail')),/Prosím o nabídku/);
  await findButton(widget.ids.get('detail'),'Hotovo').onclick();
  assert.match(content(widget.ids.get('items')),/Hotovo/);
  assert.deepEqual(widget.calls.filter(x=>x.method==='tools/call').map(x=>x.params.name),
    ['review_worklist','get_mail','process_worklist_command','get_worklist']);
});

test('reply action displays an unsent draft and saves a revision without sending',async()=>{
  const item={number:1,reference:{folder:'INBOX',uid:8,uidValidity:'3'},
    from:'customer@example.net',subject:'Termín',priority:'review',state:'todo'};
  const snapshot={listId:'fixed-list',mailboxId:'mail-a',items:[item],pending:1,
    semanticStatus:'awaiting_chatgpt',olderUnscanned:false};
  const calls=[];
  const widget=mount(message=>{
    const {name,arguments:args}=message.params;calls.push(name);
    if(name==='review_worklist')return {structuredContent:{data:{position:1}}};
    if(name==='get_mail')return {structuredContent:{data:{subject:'Termín',text:'Potvrdíte termín?',
      from:[{address:item.from}],to:[{address:'alice@example.com'}],cc:[],attachments:[]}}};
    if(name==='draft_reply')return {structuredContent:{data:{draftId:'saved-draft',sendable:false}}};
    if(name==='preview_workflow_draft')return {structuredContent:{data:{draftId:'saved-draft',
      revision:1,kind:'reply',sendable:false,message:{from:'alice@example.com',to:[item.from],
        cc:[],bcc:[],subject:'Re: Termín',text:'',attachments:[]}}}};
    if(name==='update_workflow_draft'){
      assert.equal(args.revision,1);assert.equal(args.message.text,'Děkuji, termín potvrzuji.');
      return {structuredContent:{data:{draftId:'saved-draft',revision:2,sendable:false,
        message:{from:'alice@example.com',...args.message,attachments:[]}}}};
    }
    throw new Error(name);
  });
  widget.notify(snapshot);await widget.ids.get('items').children[0].children[0].onclick();
  await findButton(widget.ids.get('detail'),'Připravit odpověď').onclick();
  assert.match(content(widget.ids.get('draft')),/Návrh odpovědi/);
  const body=widget.ids.get('draft').children.find(x=>x.tag==='label'&&x.textContent==='Celé znění').children[0];
  body.value='Děkuji, termín potvrzuji.';
  await findButton(widget.ids.get('draft'),'Uložit návrh').onclick();
  assert.deepEqual(calls,['review_worklist','get_mail','draft_reply',
    'preview_workflow_draft','update_workflow_draft']);
  assert.doesNotMatch(calls.join(' '),/send_message|create_draft/);
});
