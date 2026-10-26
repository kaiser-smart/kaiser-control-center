import { createHash } from 'node:crypto';
import { mkdirSync,writeFileSync,appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const origin='https://smart-odpady.ai';
export const runId=()=>`${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
export async function runner(input) {
  const token=process.env.REPAIR_RUNNER_TOKEN;if(!token||token.length<32)throw new Error('Missing REPAIR_RUNNER_TOKEN');
  const response=await fetch(`${origin}/api/repair/runner`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({...input,runId:runId(),lease:createHash('sha256').update(`${token}:${runId()}`).digest('hex')}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Repair API HTTP ${response.status}`);return response.json();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {job}=await runner({action:'claim'});mkdirSync('request',{recursive:true});
  if(job){
    const {image,...report}=job;
    writeFileSync('request/report.json',JSON.stringify(report));
    if(image){if(!['image/png','image/jpeg'].includes(image.type))throw new Error('Unsupported image');writeFileSync(`request/screenshot.${image.type==='image/png'?'png':'jpg'}`,Buffer.from(image.base64,'base64'));}
  }
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`has_job=${!!job}\ncase_id=${job?.caseId||''}\n`);
}
