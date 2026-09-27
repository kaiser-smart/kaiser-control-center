import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { SETUP_UI_URI, setupWidget } from '../src/setup-widget.mjs';

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.value='';this.checked=false;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.textContent='';this.children=[...children];}
  querySelectorAll(selector){
    const found=[];
    const visit=element=>{for(const child of element.children??[]){
      if(selector==='input:checked'&&child.tag==='input'&&child.checked)found.push(child);
      visit(child);
    }};
    visit(this);return found;
  }
}

const content=element=>[element.textContent??'',...(element.children??[]).map(content)].join(' ');
const findButton=(app,label)=>{
  const visit=element=>{
    if(element.tag==='button'&&element.textContent===label)return element;
    for(const child of element.children??[]){const match=visit(child);if(match)return match;}
    return null;
  };
  return visit(app);
};

function mountedWidget(respond){
  const app=new Element('main'),calls=[];
  app.id='app';
  let onMessage;
  const parent={postMessage(message){
    if(message.method==='ui/notifications/initialized')return;
    calls.push(message);
    const result=message.method==='ui/initialize'?{}:respond(message);
    onMessage({source:parent,data:{jsonrpc:'2.0',id:message.id,result}});
  }};
  const document={getElementById(id){
    const visit=element=>element.id===id?element:(element.children??[]).map(visit).find(Boolean);
    return visit(app);
  },createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text,children:[]})};
  const window={parent,addEventListener(name,callback){if(name==='message')onMessage=callback}};
  const source=setupWidget.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source);
  vm.runInNewContext(source,{document,window});
  return {app,calls,notify:data=>onMessage({source:parent,data:{jsonrpc:'2.0',
    method:'ui/notifications/tool-result',params:{structuredContent:{data}}}})};
}

const question=(id,title)=>({sessionId:'saved-interview',status:'questioning',
  nextQuestion:{id,title,options:['ano, relevantní','přeskočit']}});

test('answer A renders question B in the same card without reload or chat command',async()=>{
  assert.match(SETUP_UI_URI,/setup-v3\.html$/u);
  const first=question('agenda_1','Patří první věc k vaší práci?');
  const second=question('agenda_2','Patří druhá věc k vaší práci?');
  const widget=mountedWidget(message=>{
    assert.equal(message.params.name,'answer_mail_setup');
    assert.deepEqual(JSON.parse(JSON.stringify(message.params.arguments)),{
      sessionId:'saved-interview',questionId:'agenda_1',answer:'ano, relevantní'});
    return {structuredContent:{data:second}};
  });
  widget.notify(first);
  assert.match(content(widget.app),/Patří první věc/u);
  await findButton(widget.app,'Ano, patří k mé práci').onclick();
  assert.match(content(widget.app),/Patří druhá věc/u);
  assert.doesNotMatch(content(widget.app),/Patří první věc/u);
  assert.deepEqual(widget.calls.map(x=>x.method),['ui/initialize','tools/call']);
});

test('an outdated card refreshes the first unanswered question and an unclear answer shows its follow-up',async()=>{
  const first=question('agenda_1','Starší otázka');
  const second=question('agenda_2','Aktuální otázka');
  let calls=0;
  const widget=mountedWidget(message=>{
    calls++;
    if(calls===1)return {isError:true,content:[{type:'text',text:'QUESTION_OUT_OF_SEQUENCE'}]};
    assert.equal(message.params.name,'get_mail_setup');
    return {structuredContent:{data:second}};
  });
  widget.notify(first);
  await findButton(widget.app,'Ano, patří k mé práci').onclick();
  assert.match(content(widget.app),/Aktuální otázka/u);
  assert.doesNotMatch(content(widget.app),/Starší otázka/u);

  const followUp=mountedWidget(message=>({structuredContent:{data:{...second,
    clarification:'Máte na mysli přátelský, nebo formální tón?'}}}));
  followUp.notify(second);
  await findButton(followUp.app,'Ano, patří k mé práci').onclick();
  assert.match(content(followUp.app),/Máte na mysli přátelský, nebo formální tón/u);
});

test('a host response without structured data reloads saved progress in the same card',async()=>{
  const first=question('agenda_1','Původní otázka');
  const second=question('agenda_2','Další uložená otázka');
  let calls=0;
  const widget=mountedWidget(message=>{
    calls++;
    if(calls===1)return {};
    assert.equal(message.params.name,'get_mail_setup');
    return {structuredContent:{data:second}};
  });
  widget.notify(first);
  await findButton(widget.app,'Ano, patří k mé práci').onclick();
  assert.match(content(widget.app),/Další uložená otázka/u);
  assert.deepEqual(widget.calls.map(x=>x.method),['ui/initialize','tools/call','tools/call']);
});
