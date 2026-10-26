import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runner } from './client.mjs';
export const target={account:'3b25838c1e15dbfe5f3ac0c273826576',project:'kaiser-control-center-legacy',origin:'https://smart-odpady.ai'};
export async function cf(endpoint='',method='GET') {
  assert.ok(/^\/(deployments(?:\/[a-f0-9-]+(?:\/rollback)?)?)?$/.test(endpoint||'/'));
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account}/pages/projects/${target.project}${endpoint}`,{method,headers:{authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Cloudflare HTTP ${response.status}`);const data=await response.json();assert.equal(data.success,true);return data.result;
}
export function deploymentSha(project) {return project?.canonical_deployment?.deployment_trigger?.metadata?.commit_hash;}
export function assertTarget(project) {
  assert.equal(project.name,target.project);assert.equal(project.production_branch,'main');assert.ok(project.domains.includes('smart-odpady.ai'));
  assert.equal(project.canonical_deployment?.environment,'production');assert.equal(project.canonical_deployment?.latest_stage?.status,'success');
}
export async function smoke(sha,cssHash,request=fetch) {
  const get=async path=>{const response=await request(`${target.origin}${path}${path.includes('?')?'&':'?'}repair-check=${Date.now()}`,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});return response;};
  const meta=await get('/src/data/buildMeta.js');assert.equal(meta.status,200);assert.ok((await meta.text()).includes(`"commit": "${sha.slice(0,7)}"`),'Published commit mismatch');
  // Pages redirects directory routes to their canonical trailing-slash URL.
  // Keep redirect rejection for unexpected destinations, including auth/API checks.
  for(const route of ['/','/opravit/','/pripominky/']){const r=await get(route);assert.equal(r.status,200);assert.ok((await r.text()).includes('src/app.js'));}
  const style=await get('/src/styles.css');assert.equal(style.status,200);assert.equal(createHash('sha256').update(Buffer.from(await style.arrayBuffer())).digest('hex'),cssHash,'Published CSS mismatch');
  for(const route of ['/api/me','/api/users','/api/repair/reports']){const r=await get(route);assert.equal(r.status,401,`Anonymous ${route}`);assert.match(r.headers.get('cache-control')||'',/no-store/);}
  return true;
}
export async function verifyOrRollback({base,head,rollbackId,baselineCss,patchedCss},api=cf,check=smoke) {
  let current=await api('');
  try {
    assertTarget(current);assert.equal(deploymentSha(current),head);await check(head,patchedCss);
    return {state:'deployed',deployment_id:current.canonical_deployment.id,checks_passed:true};
  } catch(error) {
    current=await api('');
    if(deploymentSha(current)!==head)throw new Error('Production changed outside this run; manual decision required');
    await api(`/deployments/${rollbackId}/rollback`,'POST');
    current=await api('');assertTarget(current);assert.equal(current.canonical_deployment.id,rollbackId);assert.equal(deploymentSha(current),base);
    await check(base,baselineCss);
    return {state:'rolled_back',rollback_id:rollbackId,checks_passed:true};
  }
}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export async function deploy() {
  const caseId=process.env.CASE_ID,base=process.env.BASE_SHA;
  const report=JSON.parse(readFileSync('gate.json','utf8'));assert.equal(report.base,base);
  assert.equal(git('rev-parse','HEAD'),base);
  assert.equal(git('ls-remote','origin','refs/heads/main').split(/\s/)[0],base,'Main changed; re-evaluate');
  const project=await cf('');assertTarget(project);assert.equal(deploymentSha(project),base,'Production differs from base');
  // Automatic Git integrations would bypass this controller and must be disabled first.
  assert.ok(!project.source?.config?.production_deployments_enabled,'Cloudflare Git auto-deploy must be disabled');
  const rollbackId=project.canonical_deployment.id;
  const baselineCss=createHash('sha256').update(execFileSync('git',['show',`${base}:src/styles.css`])).digest('hex');
  const patchedCss=createHash('sha256').update(readFileSync('src/styles.css')).digest('hex');
  await smoke(base,baselineCss);
  git('-c','user.name=Smart Odpady repair','-c','user.email=repair@users.noreply.github.com','commit','-m',`Repair ${caseId}: bounded presentation correction`);
  const head=git('rev-parse','HEAD');
  // Preserve an auditable isolated branch before deploying; never force main.
  const branch=`codex/repair-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  git('push','origin',`HEAD:refs/heads/${branch}`);
  // Trusted build scripts, unchanged by the accepted CSS-only patch.
  const publicMaps=readFileSync('wrangler.toml','utf8').match(/^VITE_GOOGLE_MAPS_API_KEY\s*=\s*"([^"\r\n]+)"/m)?.[1];assert.ok(publicMaps);
  execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit',env:{...process.env,VITE_APP_COMMIT:head,VITE_APP_BRANCH:'main',VITE_APP_VERSION:`${JSON.parse(readFileSync('package.json')).version}-repair.${process.env.GITHUB_RUN_ID}`,VITE_GOOGLE_MAPS_API_KEY:publicMaps}});
  await runner({action:'finish',caseId,state:'deploying',result_sha:head,rollback_id:rollbackId,detail:'Testy prošly, nasazuje se drobná úprava vzhledu.'});
  const current=await cf('');assert.equal(current.canonical_deployment.id,rollbackId,'Concurrent deploy');assert.equal(git('ls-remote','origin','refs/heads/main').split(/\s/)[0],base,'Concurrent main update');
  let uploadError;
  try {execFileSync('npx',['--yes','wrangler@4.142.0','pages','deploy','dist','--project-name',target.project,'--branch','main','--commit-hash',head,'--commit-dirty=true'],{stdio:'inherit',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:target.account}});}catch(e){uploadError=e;}
  const after=await cf('');
  if(deploymentSha(after)===base&&after.canonical_deployment.id===rollbackId&&uploadError)throw new Error('Upload failed; production stayed on baseline');
  let result=await verifyOrRollback({base,head,rollbackId,baselineCss,patchedCss});
  if(result.state==='deployed') {
    try {git('push','origin','HEAD:refs/heads/main');}
    catch {
      // Do not leave production ahead of a main branch that we failed to advance.
      result=await verifyOrRollback({base,head,rollbackId,baselineCss,patchedCss},cf,async sha=>{if(sha===head)throw new Error('Main advance failed');return smoke(base,baselineCss);});
    }
  }
  writeFileSync('deployment-result.json',JSON.stringify({...result,head,base}));
  await runner({action:'finish',caseId,...result,result_sha:head,detail:result.state==='deployed'?'Oprava je nasazená a základní kontroly produkce prošly. Prosím ověřte původní problém.':'Kontrola neprošla. Předchozí verze byla obnovena a ověřena.'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await deploy();
