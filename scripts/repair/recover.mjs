import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runner } from './client.mjs';
import { cf,smoke,deploymentSha,assertTarget } from './production.mjs';
const caseId=process.env.CASE_ID;
const {job}=await runner({action:'inspect',caseId});
if(['deployed','rolled_back','needs_decision','failed'].includes(job.state))process.exit(0);
if(job.state==='deploying') {
  try {
    assert.match(job.base_sha,/^[a-f0-9]{40}$/);assert.match(job.result_sha,/^[a-f0-9]{40}$/);
    const baselineCss=createHash('sha256').update(execFileSync('git',['show',`${job.base_sha}:src/styles.css`])).digest('hex');
    let project=await cf('');assertTarget(project);
    const main=execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s/)[0];
    if(main===job.result_sha && deploymentSha(project)===job.result_sha) {
      execFileSync('git',['fetch','origin',job.result_sha],{stdio:'ignore'});
      const css=createHash('sha256').update(execFileSync('git',['show',`${job.result_sha}:src/styles.css`])).digest('hex');
      await smoke(job.result_sha,css);
      await runner({action:'finish',caseId,state:'deployed',result_sha:job.result_sha,deployment_id:project.canonical_deployment.id,checks_passed:true,detail:'Nasazení bylo po přerušeném potvrzení znovu ověřeno.'});
      process.exit(0);
    }
    if(deploymentSha(project)===job.result_sha)await cf(`/deployments/${job.rollback_id}/rollback`,'POST');
    project=await cf('');assertTarget(project);assert.equal(project.canonical_deployment.id,job.rollback_id);assert.equal(deploymentSha(project),job.base_sha);
    await smoke(job.base_sha,baselineCss);
    await runner({action:'finish',caseId,state:'rolled_back',rollback_id:job.rollback_id,checks_passed:true,detail:'Přerušený běh: předchozí verze je obnovena a ověřena.'});
    process.exit(0);
  }catch{ /* A concurrent deployment or unverifiable rollback requires a decision. */ }
}
await runner({action:'finish',caseId,state:'needs_decision',detail:'Automatické podmínky nebyly splněny nebo běh nedokončil ověření. Je nutné zvláštní rozhodnutí; zkontrolujte audit běhu.'});
