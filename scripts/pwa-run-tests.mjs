import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root=process.cwd(), output=path.join(root,"output/pwa-final");
mkdirSync(output,{recursive:true}); mkdirSync(path.join(root,"output/pwa-test-logs"),{recursive:true});
const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","scripts","services/forpsi-connector/test"],{encoding:"utf8"}).trim().split('\n').filter(p=>/\.test\.(?:mjs|js)$/.test(p) && !p.endsWith("pwa-browser.test.mjs"));
const results=[]; let index=0;
async function worker() {
 while(index<files.length) {
  const file=files[index++], start=Date.now();
  const result=await new Promise(resolve=>{
   const child=spawn(process.execPath,["--import",pathToFileURL(path.join(root,"scripts/pwa-test-network.mjs")).href,file],{cwd:root,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,LANG:"en_US.UTF-8",TZ:"Europe/Prague",NODE_ENV:"test"},stdio:["ignore","pipe","pipe"]});
   let text=""; child.stdout.on("data",x=>text+=x);child.stderr.on("data",x=>text+=x);
   const timer=setTimeout(()=>child.kill("SIGTERM"),180000);
   child.on("close",code=>{clearTimeout(timer);writeFileSync(path.join(root,"output/pwa-test-logs",file.replaceAll("/","_")),text);resolve({file,status:code===0?"passed":"failed",exitCode:code,durationMs:Date.now()-start});});
  });
  results.push(result); console.log(`${result.status}: ${file}`);
 }
}
await Promise.all([worker(),worker(),worker()]);
const report={checkedAt:new Date().toISOString(),network:"external HTTP/fetch blocked; synthetic mocks only",total:results.length,passed:results.filter(r=>r.status==="passed").length,failed:results.filter(r=>r.status!=="passed"),results:results.sort((a,b)=>a.file.localeCompare(b.file))};
writeFileSync(path.join(output,"tests.json"),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed}));
process.exitCode=report.failed.length?1:0;
