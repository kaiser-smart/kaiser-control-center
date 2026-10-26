import { SelfRepairStoreError } from './self-repair-store.js';
export const REPAIR_MAX_BYTES = 5 * 1024 * 1024;
export const repairError = (message, status = 400) => new SelfRepairStoreError(message, status, 'repair_input');
export async function digest(value) {
  const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2, '0')).join('');
}
export function repairRoute(value) {
  const url = new URL(String(value || '/'), 'https://smart-odpady.ai');
  if (url.origin !== 'https://smart-odpady.ai' || url.username || url.password) throw repairError('Použijte odkaz na stránku smart-odpady.ai.');
  // Query strings and fragments may contain credentials or personal identifiers.
  return url.pathname.slice(0, 600);
}
export function assertImage(bytes, type) {
  const b = new Uint8Array(bytes), v = new DataView(bytes);
  const ascii = (start, end) => String.fromCharCode(...b.slice(start, end));
  if (!b.length || b.length > REPAIR_MAX_BYTES) throw repairError('Fotografie může mít nejvýše 5 MB.', 413);
  let width = 0, height = 0;
  if (type === 'image/png' && b.length >= 45 && [137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x) && ascii(12,16)==='IHDR' && ascii(b.length-8,b.length-4)==='IEND') {
    width=v.getUint32(16); height=v.getUint32(20);
  } else if (type === 'image/jpeg' && b[0]===255 && b[1]===216 && b.at(-2)===255 && b.at(-1)===217) {
    for(let p=2;p+4<b.length;) {
      if(b[p]!==255) break;
      const marker=b[p+1], length=v.getUint16(p+2);
      if(length<2 || p+2+length>b.length) break;
      if([0xc0,0xc1,0xc2].includes(marker) && length>=8) {height=v.getUint16(p+5);width=v.getUint16(p+7);break;}
      if(marker===0xda) break;
      p+=length+2;
    }
  }
  // Accept only bounded raster PNG/JPEG, never SVG/HTML or arbitrary documents.
  if(!width || !height || width>8000 || height>8000 || width*height>32000000) throw repairError('Přiložte platný PNG nebo JPEG obrázek do 32 megapixelů.');
  return {width,height};
}
export async function boundedForm(request) {
  const maximum=REPAIR_MAX_BYTES+64*1024;
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw repairError('Odešlete formulář.',415);
  if(Number(request.headers.get('content-length'))>maximum) throw repairError('Příloha je příliš velká.',413);
  const reader=request.body?.getReader(); if(!reader) throw repairError('Prázdný formulář.');
  let size=0; const chunks=[];
  for(;;) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>maximum) {await reader.cancel();throw repairError('Příloha je příliš velká.',413);} chunks.push(value); }
  return new Response(new Blob(chunks),{headers:{'content-type':request.headers.get('content-type')}}).formData();
}
