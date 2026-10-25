// Deliberately isolated local UI fixture server. Never imported by build or production functions.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const user={id:'fixture-user',name:'Testovací účet',displayName:'Testovací účet',email:'fixture@example.invalid',role:'admin',status:'active',active:true,permissions:['view','manage','view_finance','view_personal'].map(action=>({moduleId:'jobs',action,allowed:true})).concat([{moduleId:'integrations',action:'manage',allowed:true},{moduleId:'receivables',action:'vistos_write',allowed:true}])};
const field=(label,value,extra={})=>({label,value,availability:'known',disclosure:'operational',source:'detail',valueObservedAt:'2026-10-25T07:00:00Z',...extra});
const rows=Array.from({length:61},(_,i)=>({id:'fixture-job-'+(i+1),number:'ZL-2026-'+String(i+1).padStart(4,'0'),companyId:'1',customer:['Obec Lhota · TEST','Testovací společnost','Areál Sever · TEST'][i%3],place:['ČOV Lhota','Provozovna Jih','Nádvoří areálu'][i%3],service:'Odvoz odpadní vody',plannedDay:i%9?null:'2026-10-25',plannedStart:i%9?'2026-10-25T08:00:00Z':null,status:['planned','in_progress','done','unverified'][i%4],driverId:null,vehicleIds:['Vistos 17','Vistos 29'],unassigned:true,needsReview:i%4===3,receivedAt:'2026-10-25T07:00:00Z',fields:{Number:field('Číslo listu','ZL-2026-'+(i+1)),Description:field('Poznámka','<img src=x onerror=alert(1)> · pouze text'),PriceWithTax:field('Cena s DPH','12100.00',{disclosure:'financial'}),Currency_FK:field('Měna','CZK'),DateTime_From:field('Plánovaný čas','2026-10-25T08:00:00Z'),ResolutionDate:field('Uzavření',null,{availability:'null'}),UnknownSource:field('Nedostupné pole',undefined,{availability:'not_exposed'})}}));
let columns=[],calls=[];
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1:5199');let payload;
 if(u.pathname.startsWith('/api/')){
  calls.push({path:u.pathname,query:u.search});
  if(u.pathname==='/api/me')payload={user};
  else if(u.pathname==='/api/jobs/preferences'){if(req.method==='POST'){let body='';for await(const c of req)body+=c;columns=JSON.parse(body).columns;}payload={columns};}
  else if(u.pathname==='/api/jobs'){
   const p=u.searchParams,page=Number(p.get('page')||1),size=Number(p.get('pageSize')||50),search=(p.get('q')||'').toLowerCase();
   const selected=rows.filter(r=>(!search||[r.number,r.customer,r.place].some(t=>t.toLowerCase().includes(search)))&&(!p.get('status')||r.status===p.get('status'))&&(!p.get('quality')||p.get('quality')==='unassigned'||r.needsReview));
   payload={rows:selected.slice((page-1)*size,page*size),pagination:{page,pageSize:size,total:selected.length},stats:{total:selected.length,inProgress:selected.filter(r=>r.status==='in_progress').length,unassigned:selected.length,review:selected.filter(r=>r.needsReview).length,unknownDate:0},dateVerified:true,period:p.get('period')||'today',rights:{finance:true,personal:true,tracking:true,manage:true},companies:['1'],streams:[{mode:'initial_backfill',status:'partial',last_success_at:null}]};
  }else if(u.pathname.endsWith('/history'))payload={events:[{id:'e1',kind:'Načtení zakázkového listu',created_at:'2026-10-25T07:00:00Z'}],next:null};
  else if(u.pathname.endsWith('/execution'))payload={id:'e1',revision:1,assignmentStatus:'incomplete',coverageStatus:'incomplete',useForPayroll:false,reasons:['history_gap'],canConfirm:false,visits:[{arrival:['2026-10-25T08:21:00Z','2026-10-25T08:22:00Z'],departure:null,observedFrom:'2026-10-25T08:22:00Z',observedTo:'2026-10-25T08:40:00Z',durationSeconds:null,gaps:[['2026-10-25T08:25:00Z','2026-10-25T08:30:00Z']]}]};
  else if(u.pathname.startsWith('/api/jobs/'))payload={job:rows.find(r=>r.id===u.pathname.split('/').at(-1))||rows[0],items:[],itemsAvailable:false,rights:{finance:true,personal:true,tracking:true,manage:true}};
  else if(u.pathname==='/api/receivables/vistos/payment-transfers')payload={rows:[{id:'payment-1',state:'outcome_unknown',invoice_source_id:'10',payload:{amount:'2500.00',currencyId:'CZK',bankDate:'2026-10-24',companyId:'1'}}],stats:[{state:'outcome_unknown',count:1}],writerEnabled:false};
  else if(u.pathname==='/api/integrations/vistos/status')payload={streams:[{entity:'ServiceList',mode:'initial_backfill',status:'partial',offset:1200,error_code:'vistos_count_unverified'}],runs:[],tracking:[],missing:['read_contract'],contractRevision:'unverified',writer:{configured:false}};
  else payload={};
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));return;
 }
 if(u.pathname==='/fixture-calls'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(calls));return;}
 let file=u.pathname==='/reference'&&process.argv[2]?path.resolve(process.argv[2]):path.resolve(root,'dist','.'+u.pathname);
 if(!file.startsWith(path.join(root,'dist'))&&u.pathname!=='/reference'){res.writeHead(403);res.end();return;}
 if(!path.extname(file))file=path.join(root,'dist/index.html');
 const data=await readFile(file);res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end('Fixture file unavailable');}});
server.listen(5199,'127.0.0.1',()=>console.log('Isolated fixture UI: http://127.0.0.1:5199/zakazky'));
