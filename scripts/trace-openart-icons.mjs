// Build-time only: npm potrace@2.1.8, Python Pillow/numpy/opencv-python-headless.
// Run with a downloaded OpenArt source directory as the first argument.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const require=createRequire(import.meta.url);
const potrace=require(process.env.POTRACE_MODULE_PATH || 'potrace');
const repo=path.resolve(import.meta.dirname,'..');
const sources=path.resolve(process.argv[2]);
const review=path.join(sources,'review');
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
execFileSync(process.env.PYTHON || 'python3',[path.join(repo,'scripts/prepare-openart-masks.py'),sources,...(only?['--only',only]:[])],{stdio:'inherit'});
let provenance=JSON.parse(await readFile(path.join(review,'provenance.json'),'utf8'));
const definitions=only?{...(await import('../src/components/icons/definitions.js')).iconDefinitions}:{};
for(const item of provenance){
  const layers=[];
  for(const channel of ['graphite','green']){
    const svg=await new Promise((resolve,reject)=>potrace.trace(path.join(review,`${item.name}-${channel}-mask.png`),{threshold:128,turdSize:0,alphaMax:1,optCurve:true,optTolerance:.2},(err,svg)=>err?reject(err):resolve(svg)));
    const d=svg.match(/<path d="([^"]+)"/)[1];
    // Potrace uses absolute coordinates throughout; preserve each curve and hole.
    if(/[ahqstv]/i.test(d))throw new Error('Unexpected non-absolute Potrace path');
    const digits=item.sourceType==='user-attachment'?2:3;
    const normalized=d.replace(/-?\d+(?:\.\d+)?/g,value=>String(Number((Number(value)/16).toFixed(digits))))
      .replace(/, /g,' ').replace(/([MLCZ]) /g,'$1').replace(/ (?=-)/g,'');
    layers.push(`<path fill-rule="evenodd" d="${normalized}"/>`);
  }
  definitions[item.name]=layers;
  await writeFile(path.join(review,`${item.name}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" fill="#243128">${layers[0]}<g fill="#75BD25">${layers[1]}</g></svg>`);
}
await writeFile(path.join(repo,'src/components/icons/definitions.js'),'// Generated ONLY by scripts/trace-openart-icons.mjs from recorded OpenArt pixels.\n// Source identity: docs/icon-provenance.json. Do not hand-edit geometry.\nexport const iconDefinitions = Object.freeze('+JSON.stringify(definitions)+');\n');
execFileSync(process.execPath,[path.join(repo,'scripts/export-icons.mjs')],{stdio:'inherit'});
if(only){const changed=new Map(provenance.map(item=>[item.name,item]));provenance=JSON.parse(await readFile(path.join(repo,'docs/icon-provenance.json'),'utf8')).map(item=>changed.get(item.name)||item);}
for(const item of provenance)item.svgSha256=createHash('sha256').update(await readFile(path.join(repo,item.svgFile))).digest('hex');
await writeFile(path.join(repo,'docs/icon-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
await writeFile(path.join(review,'provenance.json'),JSON.stringify(only?provenance.filter(item=>only.split(',').includes(item.name)):provenance,null,2)+'\n');
console.log(`Traced ${provenance.length} OpenArt icons to smooth SVG curves.`);
