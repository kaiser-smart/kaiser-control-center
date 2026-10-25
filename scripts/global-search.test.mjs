import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {searchNavigation,matchesSearch} from '../src/data/globalSearch.js';
import {hasPermission} from '../src/permissions.js';
import {searchRecords,searchSources} from '../functions/_lib/global-search-store.js';
import {onRequestGet} from '../functions/api/ai/search.js';
import {createSessionCookie} from '../functions/_lib/auth.js';
const admin={id:'search-admin',name:'Search test',email:'search@example.test',role:'admin',active:true,status:'active'};
const reader={id:'search-reader',name:'Reader',email:'reader@example.test',role:'readonly',active:true,status:'active'};
const env={AUTH_MODE:'mock',APP_ENV:'test',AUTH_USERS_JSON:JSON.stringify([admin,reader])};
const request=async(user,q='vozidla')=>new Request(`https://example.test/api/ai/search?q=${encodeURIComponent(q)}`,{headers:user?{cookie:(await createSessionCookie(env,user)).split(';')[0]}:{}});
assert.equal((await onRequestGet({env,request:await request(null)})).status,401);
for(const role of ['admin','management','kancelar','garazmistr','dispecer','ridic','readonly']) {
 const user={...reader,role};
 for(const item of searchNavigation(user,'')) assert.ok(hasPermission(user,item.moduleId,'view'));
}
assert.ok(searchNavigation(admin,'vozidla').some(i=>i.route==='/vozovy-park'));
assert.ok(searchNavigation(admin,'zakazky').some(i=>i.route==='/zakazky'));
assert.equal(searchNavigation({...admin,permissions:[{moduleId:'jobs',action:'view',allowed:false}]},'zakazky').length,0);
assert.ok(searchNavigation(admin,'nepritomnost').length);
assert.ok(searchNavigation(admin,'kalendar nepritomnosti').length);
assert.equal(searchNavigation(reader,'ke schvaleni').length,0);
assert.equal(searchNavigation(admin,'zzzz-no-match').length,0);
assert.ok(matchesSearch({title:'3BI 2007 Mercedes',description:'Řidič Karel'},'mercedes 2007'));
const response=await onRequestGet({env,request:await request(admin)});
assert.match(response.headers.get('cache-control'),/no-store/);
assert.ok((await response.json()).modules.some(i=>i.id==='fleet'));
let forbiddenCalled=false;
const sources=[
 {id:'fleet',title:'Vozidla',path:'/api/vehicles',key:'vehicles',map:v=>({id:v.id,title:v.name,route:'/vozovy-park/'+v.id}),handler:async()=>Response.json({vehicles:[{id:'1',name:'Nákladní vůz',secret:'MUST NOT LEAK'},{id:'2',name:'Jiné'}]})},
 {id:'users',title:'Uživatelé',path:'/api/users',key:'users',map:v=>v,handler:async()=>{forbiddenCalled=true;throw Error('no');}},
 {id:'absence',title:'Zaměstnanci',path:'/api/employees',key:'employees',map:v=>v,handler:async()=>Response.json({error:'down'},{status:503})}
];
const result=await searchRecords({env,request:await request(reader)},reader,'nakladni',sources);
assert.equal(forbiddenCalled,false);
assert.equal(result.records.length,1);
assert.equal(result.records[0].secret,undefined);
assert.deepEqual(result.unavailable,['Zaměstnanci']);
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE receivable_customers(id TEXT,company_name TEXT,ico TEXT); CREATE TABLE receivable_invoices(id TEXT,customer_id TEXT,invoice_number TEXT,due_date TEXT);
INSERT INTO receivable_customers VALUES('c1','Česká firma','12345678'),('c2','100% Úklid','87654321'); INSERT INTO receivable_invoices VALUES('i1','c1','202600042','2026-10-25');`);
const db={prepare(text){let values=[];return {bind(...params){values=params;return this;},async all(){return {results:sql.prepare(text).all(...values)};},async first(){return sql.prepare(text).get(...values);}};}};
const sqlEnv={...env,DB_CORE:db,DB_MESSAGES:db,DB_ARCHIVE:db,DB_AUDIT:db};
for(const [query,expected] of [['ceska firma',2],['202600042',1],['100%',1],["' OR 1=1 --",0]]){
 const found=await searchRecords({env:sqlEnv,request:await request(admin,query)},admin,query,[searchSources[0]]);
 assert.deepEqual(found.unavailable,[],query);
 assert.equal(found.records.length,expected,query);
}
sql.close();
console.log('Global search: navigation, 7 roles, authentication, no-store, scoped sources, partial failure, Czech matching and SQL injection/wildcards passed.');
