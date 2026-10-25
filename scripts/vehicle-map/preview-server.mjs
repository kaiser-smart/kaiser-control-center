import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const state={scene:'overview',theme:'light',error:false,denied:false,unauthorized:false,revision:0,ttl:3600000,sessionDeadline:Date.now()+3600000,failMe:false,startedAt:Date.now(),requests:[]};
const user={id:'synthetic-preview-admin',name:'Syntetický náhled',email:'preview@example.test',role:'admin',active:true,status:'active'};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
export async function startPreview(port=5188){
 let browserApiKey="synthetic-sdk-not-a-key";
 if(process.env.VEHICLE_MAP_GOOGLE_RUNTIME){
  const config=await readFile(process.env.VEHICLE_MAP_GOOGLE_RUNTIME,"utf8");
  browserApiKey=config.match(/googleMapsApiKey[\s\"']*:[\s\"']*([A-Za-z0-9_-]{30,})/)?.[1];
  if(!browserApiKey)throw new Error("Existing Google browser configuration unavailable");
 }
 const googleMode=browserApiKey!=="synthetic-sdk-not-a-key";
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='GET'){json({error:'Isolated read-only preview'},405);return;}
  if(url.pathname==='/__preview/meta'){json({mapMode:googleMode?'google':'adapter'});return;}
  if(url.pathname==='/__preview/control'){
   if(url.searchParams.has('scene')){state.scene=url.searchParams.get('scene');state.startedAt=Date.now();}
   if(url.searchParams.has('toggleTheme'))state.theme=state.theme==='dark'?'light':'dark';
   if(url.searchParams.has('theme'))state.theme=url.searchParams.get('theme');
   if(url.searchParams.has('toggleError'))state.error=!state.error;
   for(const key of ['error','denied','unauthorized'])if(url.searchParams.has(key))state[key]=url.searchParams.get(key)==='1';
   if(url.searchParams.has('ttl')){state.ttl=Number(url.searchParams.get('ttl'));state.sessionDeadline=Date.now()+state.ttl;}
   if(url.searchParams.has('failMe'))state.failMe=url.searchParams.get('failMe')==='1';
   if(url.searchParams.has('revision'))state.revision++;
   json({scene:state.scene,theme:state.theme,error:state.error,requests:state.requests});return;
  }
  if(url.pathname.startsWith('/api/')){
   state.requests.push({method:req.method,path:url.pathname});
   if(state.unauthorized||Date.now()>=state.sessionDeadline){json({error:'Relace skončila'},401);return;}
   if(url.pathname==='/api/me'){if(state.failMe){json({error:'Syntetický výpadek ověření relace'},503);return;}json({user,sessionExpiresAt:state.sessionDeadline});return;}
   if(url.pathname==='/api/vehicle-tracking/status'){
    if(state.denied){json({error:'Oprávnění odebráno'},403);return;}
    if(state.error){json({apiStatus:'waiting',errorCode:'tcars_read_failed',message:'Syntetický výpadek',vehicles:[],locations:[]});return;}
    json(fixture(state.scene,state.startedAt,state.revision));return;
   }
   if(url.pathname==='/api/vehicle-tracking/maps-config'){json({configured:true,browserApiKey,provider:'google-maps-javascript',apiStatus:'ready'});return;}
   if(url.pathname==='/api/theme-settings'){json({settings:state.theme==='dark'?{backgroundColor:'#151C18',cardColor:'#202A23',textColor:'#EDF3EE',mutedTextColor:'#B2BEB3',paletteMode:'manual'}:{}});return;}
   if(url.pathname==='/api/vehicle-tracking/history'){json({vehicleKey:url.searchParams.get('vehicleKey'),points:[],apiStatus:'ready'});return;}
   json({apiStatus:'ready',settings:{},preferences:{},items:[],messages:[],users:[],show:false,showIntro:false,modules:[],rules:[],notifications:[]});return;
  }
  try{
   let target=url.pathname==='/'||['/sledovani-vozidel','/pripominky'].includes(url.pathname)?'/index.html':url.pathname;
   let filename=path.resolve(root,`.${target}`);
   if(!filename.startsWith(root+path.sep))throw Error('path');
   let body;
   try{body=await readFile(filename);}catch{filename=path.resolve(root,'public',`.${target}`);if(!filename.startsWith(root+path.sep+'public'+path.sep))throw Error('path');body=await readFile(filename);}
   if(target==='/index.html')body=Buffer.from(body.toString().replace('src="src/app.js"','src="/scripts/vehicle-map/preview-client.js"'));
   res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve({server,url:`http://127.0.0.1:${server.address().port}`,state})));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {url}=await startPreview(Number(process.env.PORT||5188));console.log(`ISOLATED SYNTHETIC PREVIEW ${url}/sledovani-vozidel`);}
