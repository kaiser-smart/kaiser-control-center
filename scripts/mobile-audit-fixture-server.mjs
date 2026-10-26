// Local synthetic UI verification only. No upstream proxy or production writes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const user={id:'audit-user',name:'Test auditu',email:'audit@example.test',role:'admin',active:true,status:'active'};
const base={employeeId:user.id,employeeName:user.name,type:'vacation',status:'approved',dateFrom:'2026-09-29',dateTo:'2026-10-02',daysCount:4,createdAt:'2026-10-25T09:00:00Z'};
const requests=[{...base,id:'approved'},{...base,id:'pending',status:'pending_approval',dateFrom:'2026-10-05',dateTo:'2026-10-06',daysCount:2},{...base,id:'rejected',status:'rejected',dateFrom:'2026-09-01',dateTo:'2027-09-24',daysCount:389}];
const tyres=Array.from({length:63},(_,i)=>({id:`tyre-${i+1}`,manufacturer:i%2?'Michelin':'Continental',model:'Audit',size:'315/80 R22.5',state:i?'na vozidle':'sklad',vehicle:i?'TEST 001':'',position:i?'L1':'',currentTread:8}));
const vehicle={id:'fixture',licensePlate:'TEST 001',registrationPlate:'TEST 001',vehicleType:'Svozové vozidlo',type:'Svozové vozidlo',brand:'MAN',model:'Test',configuration:['L1','R1'],insuranceValidTo:'8160-01-01'};
const writes=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json','.woff2':'font/woff2'};
createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:4179');
  if(u.pathname==='/__audit/writes'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(writes));return;}
  if(u.pathname.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   let data={apiStatus:'ready',settings:{},items:[],messages:[],users:[],show:false};
   if(req.method!=='GET'){const chunks=[];for await(const c of req)chunks.push(c);writes.push({method:req.method,path:u.pathname,body:Buffer.concat(chunks).toString()});res.statusCode=503;res.end(JSON.stringify({error:'Izolovaný test: simulované odmítnutí uložení.'}));return;}
   if(u.pathname==='/api/me')data={user,sessionExpiresAt:Date.now()+3600000};
   else if(u.pathname==='/api/users')data={users:[user]};
   else if(u.pathname==='/api/employees')data={employees:[{...user,firstName:'Test',lastName:'auditu',department:'Test',employmentStatus:'active'}],items:[user]};
   else if(u.pathname==='/api/absence-requests')data={apiStatus:'ready',requests};
   else if(u.pathname==='/api/absence-requests/pending')data={apiStatus:'ready',requests:requests.filter(r=>r.status==='pending_approval')};
   else if(u.pathname.startsWith('/api/absence-requests/'))data={request:requests.find(r=>r.id===u.pathname.split('/').at(-1)),apiStatus:'ready'};
   else if(u.pathname==='/api/tyres'){
    const q=(u.searchParams.get('q')||'').toLowerCase();const list=tyres.filter(t=>t.manufacturer.toLowerCase().includes(q));const page=Number(u.searchParams.get('page')||1),size=Number(u.searchParams.get('pageSize')||25);
    if(q)await new Promise(r=>setTimeout(r,350));
    data={apiStatus:'ready',items:list.slice((page-1)*size,page*size),total:list.length,page,pageSize:size,vehicles:[vehicle],summary:{},attention:[],activity:[],facets:{}};
   }
   else if(u.pathname.startsWith('/api/tyres/vehicles/'))data={vehicle,tyres:tyres.slice(1,3)};
   else if(u.pathname.startsWith('/api/tyres/'))data={tyre:tyres.find(t=>t.id===u.pathname.split('/').at(-1)),measurements:[],services:[],audit:[],costs:0};
   else if(u.pathname==='/api/vehicles')data={vehicles:[vehicle],apiStatus:'ready'};
   else if(u.pathname==='/api/vehicles/fixture')data={vehicle,driverCandidates:[{id:'driver-test',name:'Test řidiče'}],apiStatus:'ready'};
   else if(u.pathname.includes('/notifications'))data={items:[{id:'n-1',type:'absence_request',channel:'email',status:'sent',absenceRequestId:'rejected',employeeName:user.name,recipient:'audit@example.test',createdAt:'2026-10-25T09:00:00Z'}],total:1,emailSent:1,apiStatus:'ready'};
   else if(u.pathname==='/api/fleet/orwii-fuel/analytics')data={apiStatus:'ready',period:'30d',summary:{transactionCount:633,liters:6330,totalCost:221550},byVehicle:[],byDay:[],recentTransactions:Array.from({length:633},(_,i)=>({externalId:String(i),licensePlate:'TEST 001',vehicleName:'Test',fuelType:'Nafta',liters:10,totalPrice:350,matchStatus:'matched',occurredAt:'2026-10-25T09:00:00Z'}))};
   res.end(JSON.stringify(data));return;
  }
  let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
  if(!path.extname(file))file=path.join(file,'index.html');
  let content;try{content=await readFile(file);}catch{file=path.join(root,'404.html');content=await readFile(file);}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"connect-src 'self'; img-src 'self' data:; font-src 'self' data:; media-src 'none'; frame-src 'none'");
  res.end(content);
 }catch(e){res.statusCode=500;res.end('Fixture error');console.error(e.message);}
}).listen(4179,'127.0.0.1',()=>console.log('Synthetic audit fixture http://127.0.0.1:4179; all writes rejected locally.'));
