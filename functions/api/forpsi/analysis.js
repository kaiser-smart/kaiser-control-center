// Server-to-server analysis for the consented Mail Brain pilot. The OpenAI key stays in Pages.
const reply=(code,status)=>Response.json({error:code},{status,headers:{'Cache-Control':'no-store'}});

function equalSecret(expected,supplied){
  const a=new TextEncoder().encode(expected),b=new TextEncoder().encode(supplied);
  let difference=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)difference|=(a[i]??0)^(b[i]??0);
  return difference===0;
}

export async function handleAnalysisProxy({request,env,fetcher=fetch}){
  if(request.method!=='POST')return reply('METHOD_NOT_ALLOWED',405);
  const expected=env.FORPSI_ADMIN_TOKEN;
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  if(typeof expected!=='string'||expected.length<32||supplied.length>256||
    !equalSecret(expected,supplied))
    return reply('ACCESS_DENIED',401);
  if(!env.OPENAI_API_KEY)return reply('ANALYSIS_UNAVAILABLE',503);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')
    return reply('INVALID_ARGUMENTS',415);
  if(Number(request.headers.get('content-length')??0)>16000)return reply('INVALID_ARGUMENTS',413);
  let body;
  try{
    const source=await request.text();
    if(source.length>12000)throw Error();
    body=JSON.parse(source);
    if(body.model!=='gpt-5-mini'||body.store!==false||body.max_output_tokens!==1600||
      body.input?.length!==2||body.input[0]?.role!=='system'||
      body.input[1]?.role!=='user'||body.text?.format?.type!=='json_schema'||
      body.text.format.name!=='mail_brain_analysis'||body.text.format.strict!==true)
      throw Error();
  }catch{return reply('INVALID_ARGUMENTS',400);}
  try{
    const response=await fetcher('https://api.openai.com/v1/responses',{
      method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,
        'content-type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.timeout(35000)});
    if(!response.ok)return reply('ANALYSIS_UNAVAILABLE',503);
    const result=await response.json();
    const serialized=JSON.stringify(result);
    if(serialized.length>100000)return reply('ANALYSIS_UNAVAILABLE',503);
    return new Response(serialized,{status:200,headers:{'Content-Type':'application/json',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return reply('ANALYSIS_UNAVAILABLE',503);}
}

export const onRequestPost=context=>handleAnalysisProxy(context);
export const onRequestGet=()=>reply('METHOD_NOT_ALLOWED',405);
