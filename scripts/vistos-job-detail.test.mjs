import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decimalText,dateText,itemRows,overview,documents,execution,historyEvents,fieldsTable} from '../src/components/VistosJobDetail.js';
const f=(value,availability='known')=>({value,availability,label:'Zdrojový údaj'});
test('Presentation preserves exact decimal strings, zero and source timezone',()=>{
 assert.equal(decimalText('12345678901234567890.01800'),'12\u00a0345\u00a0678\u00a0901\u00a0234\u00a0567\u00a0890,018');
 assert.equal(decimalText('0.000'),'0');assert.equal(decimalText('-0.018'),'-0,018');
 assert.equal(dateText('2026-07-02'),'2. 7. 2026.');assert.equal(dateText('2026-10-25T02:30:00'),'2026-10-25T02:30:00');
});
test('One item row per source item, no guessed unit, safe product text and no financial summary without right',()=>{
 const items=[{fields:{Product_FK_Caption:f('<img src=x onerror=alert(1)>','unverified'),Quantity:f('0.018','unverified'),UOM_FK:f('42'),PriceWithTax:f('0')}}];
 const before=JSON.stringify(items),html=itemRows(items,{});assert.equal((html.match(/class="vj-item-row"/g)||[]).length,1);
 assert.ok(html.includes('0,018'));assert.ok(html.includes('Nedoložena'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<th scope="col">Cena s DPH'));
 assert.equal(JSON.stringify(items),before);
 assert.ok(itemRows([{fields:{UOM_FK_Caption:f('t'),Quantity:f('0')}}]).includes('>t</td>'));
 const finance=itemRows(items,{finance:true});assert.ok(finance.includes('Měna není doložena'));assert.ok(finance.includes('>0</span>'));assert.ok(!finance.includes('Kč'));
});
test('Unavailable states remain distinct; stale source survives search and contacts are safe links only when verified',()=>{
 for(const [state,text]of [['null','Nevyplněno ve Vistosu'],['not_exposed','Vistos neposkytuje'],['forbidden','Nedostupné pro tento přístup'],['error','Načtení se nezdařilo']])assert.ok(fieldsTable({x:f(null,state)}).includes(text));
 assert.ok(fieldsTable({x:{...f('old','error'),stale:true,valueObservedAt:'2026-07-02'}},'old').includes('Poslední známá hodnota'));
 const job={fields:{Phone:f('+420 123 456 789'),Email:f('x@example.com')},vehicleIds:['1','2']};
 assert.ok(overview(job,{personal:true}).includes('href="tel:+420123456789"'));assert.ok(!overview(job,{}).includes('href="tel:'));
 job.fields.Phone=f('javascript:alert(1)');assert.ok(!overview(job,{personal:true}).includes('href="javascript'));
 assert.ok(documents(job,{}).includes('Přílohy zatím nejsou dostupné'));assert.ok(!documents(job,{}).includes('<h4>Faktura'));
});
test('Execution unavailable is not zero; partial intervals have no invented duration and events escape values',()=>{
 const html=execution({},{assignmentStatus:'unavailable',coverageStatus:'unavailable'},s=>String(s));
 assert.ok(html.includes('Není doloženo'));assert.ok(!html.includes('0 min'));
 const partial=execution({},{visits:[{arrival:['2026-07-02T07:00:00Z','2026-07-02T07:01:00Z'],gaps:[['a','b']]}]},s=>String(s));
 assert.ok(partial.includes('has-gaps'));assert.ok(partial.includes('Mezera: a – b'));assert.ok(!partial.includes('≈ 0'));
 assert.ok(historyEvents([{kind:'source_changed',actor:'<img>',changedFields:[{field:'Quantity',label:'Množství'}]}]).includes('&lt;img&gt;'));
});
test('Content, metadata, warnings, and action text meet 4.5:1 contrast',()=>{
 const luminance=hex=>{const rgb=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 for(const [fg,bg]of [['11191d','ffffff'],['5e686d','f0f2f3'],['946200','fff1d4'],['11191d','75bd25'],['395e20','ffffff'],['3d5034','edf3e8']]){const a=luminance(fg),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,fg+'/'+bg);}
});
