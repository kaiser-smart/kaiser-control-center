// Local integration preview only. No production build import, secret, GPS snapshot or database.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
import { READ_PATHS, AUTH_PATHS, permitted, relay } from './integration-proxy.mjs';
export { UPSTREAM, READ_PATHS, AUTH_PATHS, permitted, relay } from './integration-proxy.mjs';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
export async function startIntegration(port=5173){
 if(![5173,53000,0].includes(port))throw Error('Use a verified existing Google referrer port');
 const state={offline:false,requests:[]};
 const server=createServer(async(req,res)=>{
  const origin=`http://127.0.0.1:${server.address().port}`;
  const host=req.headers.host;
  const json=(body,status)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(host!==new URL(origin).host){json({error:'Unexpected host'},403);return;}
  const u=new URL(req.url,origin);
  if(u.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>4096){json({error:'Request too large'},413);return;}chunks.push(c);}
   const request=new Request(u,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   if(!permitted(request,origin)){json({error:'Izolovaný náhled: tento endpoint nebo zápis není povolen.'},403);return;}
   const started=Date.now();
   const r=state.offline&&!AUTH_PATHS.has(u.pathname)?Response.json({error:'Řízený výpadek spojení v integračním náhledu.'},{status:503}):await relay(request);
   state.requests.push({at:new Date().toISOString(),path:u.pathname,method:req.method,status:r.status,durationMs:Date.now()-started});
   if(state.requests.length>1000)state.requests.shift();
   // Metadata only; never cookies, payloads, vehicle IDs, coordinates or keys.
   console.log(JSON.stringify(state.requests.at(-1)));
   const headers=Object.fromEntries(r.headers);const cookies=r.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
   res.writeHead(r.status,headers);res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  if(req.method!=='GET'){json({error:'Read-only preview'},405);return;}
  if(u.pathname==='/integration-mobile'){
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
   res.end('<!doctype html><html lang="cs"><meta charset="utf-8"><title>Chráněný mobilní integrační náhled</title><body style="margin:0;background:#202821;color:white;font:14px sans-serif"><p>Skutečný backend · viewport 390 × 844 · přihlášení zůstává chráněné</p><iframe title="Mobilní sledování vozidel" src="/sledovani-vozidel" style="border:0;width:390px;height:844px"></iframe></body></html>');return;
  }
  const target=['/','/sledovani-vozidel'].includes(u.pathname)?'/index.html':u.pathname;
  // Serve the application assets only. Never expose repository/server files.
  if(target!=='/index.html'&&!/^\/(?:src|vehicles|fonts|icons|brand|images)\//.test(target)&&target!=='/manifest.webmanifest'){json({error:'Preview is limited to vehicle tracking'},404);return;}
  const local=path.resolve(root,`.${target}`),publicFile=path.resolve(root,'public',`.${target}`);
  if(!local.startsWith(root+path.sep)||!publicFile.startsWith(root+path.sep+'public'+path.sep)){json({error:'Invalid path'},403);return;}
  try{
   let body;try{body=await readFile(local);}catch{body=await readFile(publicFile);}
   if(target==='/index.html')body=Buffer.from(body.toString().replace('<body>','<body><div style="padding:8px 14px;background:#202821;color:white;font:12px Quicksand,sans-serif" role="note">CHRÁNĚNÝ INTEGRAČNÍ NÁHLED · skutečný backend · pouze čtení · bez produkčního nasazení</div>'));
   res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(body);
  }catch{json({error:'Not found'},404);}
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return{server,state,url:`http://127.0.0.1:${server.address().port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {server,state,url}=await startIntegration(Number(process.env.PORT||5173));
 process.on('SIGUSR2',()=>{state.offline=!state.offline;console.log(`CONTROLLED_CONNECTION_FAILURE ${state.offline}`);});
 console.log(`PROTECTED LIVE INTEGRATION ${url}/sledovani-vozidel PID ${process.pid}`);
}
