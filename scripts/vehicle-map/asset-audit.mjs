import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE,VEHICLE_ICON_BY_TYPE} from '../../src/data/vehicleTracking.js';
const reference=process.argv[2];const files=[];
for(const type of ['collection_truck','tanker','skip_loader','van'])for(const size of ['128x96','256x192']){
 const name=`${type}-${size}.webp`,body=await readFile(`public/vehicles/openart/${name}`);
 const hash=createHash('sha256').update(body).digest('hex');
 const same=reference?body.equals(await readFile(`${reference}/assets/openart/${name}`)):null;
 if(same===false)throw Error(`Source mismatch: ${name}`);files.push({name,bytes:body.length,sha256:hash,identicalToSuppliedExport:same});
}
const old=[];for(const path of new Set([...Object.values(VEHICLE_TRACKING_CUSTOM_ICON_BY_LICENSE_PLATE),...Object.values(VEHICLE_ICON_BY_TYPE)])){try{old.push({path,bytes:(await stat(`public${path}`)).size});}catch{old.push({path,missing:true});}}
const lum=hex=>{const c=hex.match(/[\da-f]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const contrast=[['brand text','#202821','#75BD25'],['light secondary','#657164','#F5F7F3'],['light stale','#9A531D','#FFFFFF'],['light stopped','#5B6875','#FFFFFF'],['light movement','#3F7416','#FFFFFF'],['dark secondary','#B2BEB3','#202A23'],['dark stale','#E9B380','#202A23'],['dark stopped','#BAC6D0','#202A23'],['neutral monogram','#5B6875','#FFFFFF']].map(([use,text,background])=>({use,text,background,ratio:ratio(text,background)}));
if(contrast.some(c=>c.ratio<4.5))throw Error('Text contrast fails');
const result={files,mapBytes:files.filter(f=>f.name.includes('128x96')).reduce((s,f)=>s+f.bytes,0),listDetailBytes:files.filter(f=>f.name.includes('256x192')).reduce((s,f)=>s+f.bytes,0),totalBytes:files.reduce((s,f)=>s+f.bytes,0),oldReferencedPngCatalog:{files:old,totalBytes:old.reduce((s,f)=>s+(f.bytes||0),0),scope:'Static unique PNG files referenced by former generic and individual mapping, NOT a measured browser transfer; shared legacy assets retained for other modules.'},contrast};
await writeFile('../outputs/asset-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({mapBytes:result.mapBytes,listDetailBytes:result.listDetailBytes,totalBytes:result.totalBytes,oldCatalogBytes:result.oldReferencedPngCatalog.totalBytes,minTextContrast:Math.min(...contrast.map(c=>c.ratio))}));
