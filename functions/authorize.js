import { currentUser } from './_lib/auth.js';
import { proxyForpsiOAuth } from './_lib/forpsi-oauth-proxy.js';

const escape=value=>String(value).replace(/[&<>"']/g,char=>`&#${char.charCodeAt(0)};`);
export async function onRequest({request,env}){
  if(!['GET','POST'].includes(request.method))return new Response('Method not allowed',{status:405});
  if(request.method==='POST'&&
    (request.headers.get('origin')!==new URL(request.url).origin||
      request.headers.get('sec-fetch-site')==='cross-site'))return new Response('Forbidden',{status:403});
  let user;
  try{user=await currentUser(env,request,{strict:true});}
  catch{return new Response('Přihlášení SO.ai nyní nelze ověřit.',{status:503});}
  if(!user){
    if(request.method==='POST')return new Response('Přihlášení SO.ai vypršelo.',{status:401});
    const current=escape(request.url);
    return new Response(`<!doctype html><html lang="cs"><meta charset="utf-8"><title>Přihlášení SO.ai</title>
      <body style="font:16px system-ui;max-width:40rem;margin:3rem auto;line-height:1.5">
      <h1>Přihlaste se do SO.ai</h1><p>Přihlášení k Forpsi používá váš existující účet SO.ai.</p>
      <p><a href="/" target="_blank" rel="noopener">Otevřít přihlášení SO.ai</a></p>
      <p>Po přihlášení se vraťte sem a pokračujte:</p><p><a href="${current}">Pokračovat v připojení</a></p></body></html>`,
    {status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  return proxyForpsiOAuth(request,env,{userId:user.id,consentCookie:request.method==='POST'});
}
