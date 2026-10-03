// Server-to-server analysis for the consented Mail Brain pilot. The OpenAI key stays in Pages.
const reply=(code,status)=>Response.json({error:code},{status,headers:{'Cache-Control':'no-store'}});

function equalSecret(expected,supplied){
  const a=new TextEncoder().encode(expected),b=new TextEncoder().encode(supplied);
  let difference=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)difference|=(a[i]??0)^(b[i]??0);
  return difference===0;
}

// Temporary, analysis-only capability. The secret stores token + expiry + seven request hashes.
function evaluationAccess(request,env,supplied){
  if(request.url!=='https://smart-odpady.ai/api/forpsi/analysis'||
    request.headers.get('authorization')!==`Bearer ${supplied}`)return null;
  try{
    const policy=JSON.parse(env.FORPSI_ANALYSIS_EVAL_TOKEN??'null');
    if(!policy||typeof policy!=='object'||Array.isArray(policy)||
      Object.keys(policy).length!==3||
      Object.keys(policy).some(key=>!['token','expiresAt','requestSha256'].includes(key))||
      typeof policy.token!=='string'||!/^[a-f0-9]{64}$/.test(policy.token)||
      supplied.length!==64||!equalSecret(policy.token,supplied)||
      !Number.isSafeInteger(policy.expiresAt)||policy.expiresAt<=Date.now()||
      !Array.isArray(policy.requestSha256)||policy.requestSha256.length!==7||
      new Set(policy.requestSha256).size!==7||
      !policy.requestSha256.every(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)))
      return null;
    return new Set(policy.requestSha256);
  }catch{return null;}
}

async function boundedBody(request,limit){
  const reader=request.body?.getReader();
  if(!reader)throw Error();
  const chunks=[];let length=0;
  try{
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>limit){await reader.cancel();throw Error();}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

export async function handleAnalysisProxy({request,env,fetcher=fetch}){
  if(request.method!=='POST')return reply('METHOD_NOT_ALLOWED',405);
  const expected=env.FORPSI_ADMIN_TOKEN;
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  const adminAuthorized=typeof expected==='string'&&expected.length>=32&&
    supplied.length<=256&&equalSecret(expected,supplied);
  const evaluation=adminAuthorized?null:evaluationAccess(request,env,supplied);
  if(!adminAuthorized&&!evaluation)return reply('ACCESS_DENIED',401);
  if(!env.OPENAI_API_KEY)return reply('ANALYSIS_UNAVAILABLE',503);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')
    return reply('INVALID_ARGUMENTS',415);
  if(Number(request.headers.get('content-length')??0)>(evaluation?16000:96000))return reply('INVALID_ARGUMENTS',413);
  let body;
  try{
    let source;
    if(evaluation){
      const bytes=await boundedBody(request,16000);
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      // Pin the whole approved request, including prompt, nested schema and case input.
      if(!evaluation.has(hash))return reply('INVALID_ARGUMENTS',400);
      source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }else source=new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,96000));
    if(source.length>(evaluation?12000:96000))throw Error();
    body=JSON.parse(source);
    const v2=!evaluation&&body.text?.format?.name==='mail_brain_work_v2';
    if(body.model!=='gpt-5-mini'||body.store!==false||body.max_output_tokens!==(v2?7000:2400)||
      body.reasoning?.effort!=='minimal'||
      body.input?.length!==2||body.input[0]?.role!=='system'||
      body.input[1]?.role!=='user'||body.text?.format?.type!=='json_schema'||
      body.text.format.name!==(v2?'mail_brain_work_v2':'mail_brain_analysis')||body.text.format.strict!==true||
      (!v2&&source.length>12000))
      throw Error();
  }catch{return reply('INVALID_ARGUMENTS',400);}
  try{
    const response=await fetcher('https://api.openai.com/v1/responses',{
      method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,
        'content-type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.timeout(body.text.format.name==='mail_brain_work_v2'?45000:35000),redirect:'manual'});
    // Workers fetch supports manual redirects; reject instead of following Location.
    if(response.redirected||(response.status>=300&&response.status<400)||
      (response.url&&response.url!=='https://api.openai.com/v1/responses'))
      return reply('ANALYSIS_UNAVAILABLE',503);
    if(!response.ok)return Response.json({error:'ANALYSIS_UNAVAILABLE',
      upstreamStatus:response.status},{status:503,headers:{'Cache-Control':'no-store'}});
    const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(response,
      body.text.format.name==='mail_brain_work_v2'?160000:100000)));
    const serialized=JSON.stringify(result);
    if(serialized.length>(body.text.format.name==='mail_brain_work_v2'?160000:100000))return reply('ANALYSIS_UNAVAILABLE',503);
    return new Response(serialized,{status:200,headers:{'Content-Type':'application/json',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return reply('ANALYSIS_UNAVAILABLE',503);}
}

export const onRequestPost=context=>handleAnalysisProxy(context);
export const onRequestGet=()=>reply('METHOD_NOT_ALLOWED',405);
