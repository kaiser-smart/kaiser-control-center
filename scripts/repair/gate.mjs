import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
// Initial automatic scope is deliberately narrow: bounded numeric spacing/type changes
// in existing non-sensitive class rules. All code, new selectors and bulk edits need a decision.
export function validateCss(before,after) {
  const a=before.split('\n'),b=after.split('\n');assert.equal(a.length,b.length,'New/deleted rules require a decision');
  let changes=0;const stack=[];
  const declaration=/^(\s*)(font-size|line-height|gap|row-gap|column-gap|padding(?:-top|-bottom|-left|-right)?|margin(?:-top|-bottom|-left|-right)?|border-radius):\s*(\d+(?:\.\d+)?)(px|rem);\s*$/;
  for(let i=0;i<a.length;i++) {
    if(a[i]!==b[i]) {
      const old=a[i].match(declaration),next=b[i].match(declaration);
      assert.ok(old&&next&&old[2]===next[2]&&old[4]===next[4],'Only existing numeric presentation values');
      const context=stack.join(' ');
      assert.match(context,/\.(?:tyre-|fleet-|feedback-workflow-|repair-module)[a-z0-9_-]*/i,'Only approved module classes');
      assert.ok(!/auth|login|session|permission|consent|payment|invoice|receivable|bank|kb-|data-box|ds-|user-bar|kiosk|driver|hidden|modal|dialog|overlay|root|\*/i.test(context),'Sensitive/global selector');
      const x=Number(old[3]),y=Number(next[3]),scale=old[4]==='rem'?16:1;
      assert.ok(x>0&&y>0&&Math.abs(y-x)<=x*.25&&Math.abs(y-x)*scale<=8,'Change exceeds bounded scope');
      if(old[2]==='font-size')assert.ok(y*scale>=12&&y*scale<=48,'Readable type required');
      changes++;
    }
    // Braces inside comments/strings make this conservative parser decline the patch.
    if(a[i].includes('{'))stack.push(a[i].slice(0,a[i].indexOf('{')));
    if(a[i].includes('}'))stack.pop();
  }
  assert.ok(changes>0&&changes<=8,'One to eight declaration changes only');return {changes,policy:'bounded-css-v1'};
}
export function gate(patchPath,base) {
  assert.match(base,/^[a-f0-9]{40}$/);assert.equal(git('rev-parse','HEAD'),base,'Unexpected base');
  const patch=readFileSync(patchPath);assert.ok(patch.length>0&&patch.length<=16384,'Patch size limit');
  execFileSync('git',['apply','--check','--index',patchPath]);
  execFileSync('git',['apply','--index',patchPath]);
  assert.equal(git('diff','--cached','--name-status'), 'M\tsrc/styles.css','Protected paths or non-CSS change');
  assert.equal(git('ls-files','--stage','src/styles.css').split(' ')[0],'100644','Regular file required');
  const result=validateCss(git('show',`${base}:src/styles.css`)+'\n',readFileSync('src/styles.css','utf8'));
  return {...result,base,patchSha:createHash('sha256').update(patch).digest('hex')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=gate(process.argv[2],process.argv[3]);writeFileSync('gate.json',JSON.stringify(result));console.log(JSON.stringify(result));}
