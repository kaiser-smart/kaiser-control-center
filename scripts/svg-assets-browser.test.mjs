// Verify real image loading, not just permissive inline HTML parsing.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=path.resolve(import.meta.dirname,'..');
const dist=path.resolve(process.env.PWA_DIST || path.join(root,'dist'));
const output=path.resolve(process.env.PWA_TEST_OUTPUT || path.join(root,'output/svg-assets'));
await mkdir(output,{recursive:true});
const files=[];
for(const folder of ['icons/ui','vehicles/icons'])for(const name of await readdir(path.join(dist,folder)))if(name.endsWith('.svg'))files.push('/'+folder+'/'+name);
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>SVG loading test</title>');return;}
  if(!files.includes(req.url)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','image/svg+xml');res.end(await readFile(path.join(dist,req.url)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await webkit.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results=await page.evaluate(async files=>await Promise.all(files.map(async url=>{
    const xml=await (await fetch(url)).text();const doc=new DOMParser().parseFromString(xml,'image/svg+xml');
    const image=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({loaded:true,width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>resolve({loaded:false});img.src=url;});
    return {url,xmlValid:!doc.querySelector('parsererror'),...image};
  })),files);
  await writeFile(path.join(output,'standalone-loading.json'),JSON.stringify({browser:browser.version(),results},null,2));
  const failures=results.filter(r=>!r.xmlValid||!r.loaded);
  if(process.env.ICONS_BASELINE)assert.equal(failures.length,files.length,'Reproduce baseline XML/image failure');
  else assert.deepEqual(failures,[],'Standalone SVG must parse and load as an actual image');
  console.log(JSON.stringify({assets:files.length,failures:failures.length,baseline:Boolean(process.env.ICONS_BASELINE)}));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
