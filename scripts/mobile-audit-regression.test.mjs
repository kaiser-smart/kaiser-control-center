import assert from 'node:assert/strict';
import { countAbsenceDays, monthlyAbsenceTotals, monthlyAbsenceDoctorHours, generateMonthlyAbsenceReport, monthlyAbsenceReportToCsv, absenceDaysInMonth } from '../src/data/absence.js';
import { fleetCalendarDate } from '../src/data/fleetDate.js';
import { __test as vistos } from '../functions/_lib/fleet-vistos-vehicle-preview.js';
import { buildOrwiiFuelAnalytics } from '../functions/_lib/orwii-fuel-store.js';

const base = { createdAt:'2026-10-25T10:00:00Z', type: 'vacation', employeeId:'test', employeeName:'Test', status:'approved', dateFrom:'2026-09-29', dateTo:'2026-10-02', daysCount:4 };
const requests = [base, {...base,status:'pending_approval', dateFrom:'2026-10-05',dateTo:'2026-10-06',daysCount:2}, {...base,status:'rejected',dateFrom:'2026-09-01',dateTo:'2027-09-24',daysCount:389}, {...base,status:'cancelled',dateFrom:'2026-10-01',dateTo:'2026-10-31',daysCount:31}];
assert.equal(monthlyAbsenceTotals(requests,'2026-10').Dovolená,2);
assert.equal(monthlyAbsenceTotals(requests,'2026-10',{pending:true}).Dovolená,2);
assert.equal(absenceDaysInMonth({...base,halfDayFrom:true},'2026-10'),2);
assert.equal(absenceDaysInMonth({...base,halfDayTo:true},'2026-10'),1.5);
assert.equal(countAbsenceDays('2026-03-28','2026-03-30'),3,'DST must not remove a calendar day');
assert.equal(countAbsenceDays('2026-02-30','2026-03-02'),0);
assert.equal(countAbsenceDays('2026-10-20','2026-10-19'),0);
const doctor = {...base,type:'doctor',unit:'hours',startTime:'09:00',endTime:'12:00',hoursCount:3,dateFrom:'2026-10-03',dateTo:'2026-10-03'};
assert.equal(monthlyAbsenceDoctorHours([doctor,{...doctor,status:'rejected'}],'2026-10'),3);
const state = {requests, settings:{recipientEmail:'test@example.test'}};
const result = generateMonthlyAbsenceReport(state,{id:'test',role:'admin',active:true},{month:'2026-10'});
assert.equal(result.report.periodMonth,10);
const csv = monthlyAbsenceReportToCsv(result.report,result.requests);
assert.match(csv,/Období reportu;10\/2026/);
assert.match(csv,/Dovolená celkem dnů;2/);
assert.match(csv,/Čekající Dovolená dnů;2/);
assert.throws(()=>generateMonthlyAbsenceReport(state,{id:'test',role:'admin'},{month:'2026-13'}));
assert.equal(generateMonthlyAbsenceReport(state,{id:'test',role:'admin',active:true},{month:'2026-10',status:'Schváleno'}).requests.length,1);
for (const date of ['8160','9382','13635','8160-01-01','2026-02-30','2026-13-01','42','not a date']) assert.equal(fleetCalendarDate(date),'',date);
for (const date of ['2026-10-25','25. 10. 2026','2026-10-25T00:00:00Z','/Date(1792886400000)/']) assert.equal(fleetCalendarDate(date),'2026-10-25',date);
const vehicle=vistos.mapVehicle({Id:'test',RegistrationPlate:'TEST',CarCategory_FK:17579,c_InsuranceValidTo:'8160'}, {fields:{insuranceValidTo:{columnName:'c_InsuranceValidTo'}}});
assert.equal(vehicle.insuranceValidTo,'');
assert.equal(vehicle.category,'');
assert.equal(vehicle.categoryId,'17579');
assert.equal(vistos.mapVehicle({CarCategory_FK:17579,CarCategory_FK_Caption:'Svozové vozidlo'}).category,'Svozové vozidlo');
const fuel = buildOrwiiFuelAnalytics(Array.from({length:633},(_,i)=>({external_id:String(i),liters:10,total_price:350,occurred_at:'2026-10-25T10:00:00Z'})));
assert.equal(fuel.recentTransactions.length,633);
assert.equal(fuel.recentTransactions.length,fuel.summary.transactionCount);
assert.equal(fuel.recentTransactions.at(-1).externalId,'632');
console.log('Mobile audit data regressions passed (B05/B11/B12/B14/B16 + calendar boundaries).');

// Execute the actual quick-entry handlers with a minimal DOM boundary, no browser or API.
const {readFile} = await import('node:fs/promises');
const vm = await import('node:vm');
const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
function handler(name) {
 const start=source.indexOf(`function ${name}(`);
 assert.ok(start>=0);
 const end=source.indexOf('\n}',start)+2;
 return source.slice(start,end);
}
const quickState={dateFrom:'2026-10-25',dateTo:'2026-10-25',startTime:'09:00',endTime:'11:00',step:'date',error:''};
const fields={'[data-quick-date-from]':{value:''},'[data-quick-date-to]':{value:''},'[data-quick-start-time]':{value:'09:00'},'[data-quick-end-time]':{value:'12:00'},'[data-quick-hours-preview]':{textContent:''}};
const ctx=vm.createContext({quickAbsenceState:quickState,quickAbsenceType:()=>({id:'doctor'}),document:{querySelector:s=>fields[s]},countAbsenceHours:(a,b)=>(Number(b.slice(0,2))-Number(a.slice(0,2))),countAbsenceDays,formatAbsenceHours:n=>`${n} h`,render:()=>{},quickSetDate:()=>{throw Error('Unexpected transition');}});
vm.runInContext(handler('continueQuickCustomDate')+'\n'+handler('updateQuickDateField'),ctx);
vm.runInContext('continueQuickCustomDate()',ctx);
assert.equal(quickState.step,'date');assert.match(quickState.error,/zadejte datum/);
vm.runInContext('updateQuickDateField("endTime", "12:00")',ctx);
assert.equal(fields['[data-quick-hours-preview]'].textContent,'Rozsah: 3 h');
fields['[data-quick-date-from]'].value='2026-10-25';
vm.runInContext('continueQuickCustomDate()',ctx);
assert.equal(quickState.step,'summary');assert.equal(quickState.endTime,'12:00');
console.log('Mobile quick-entry handler regressions passed (B02/B03).');

assert.equal(vistos.termColumnScore({columnName:'InsuranceValidTo_FK',type:'Int32'}, {aliases:['InsuranceValidTo_FK']}),0);
assert.equal(vistos.termColumnScore({columnName:'InsuranceValidTo',type:'DateTime'}, {aliases:['InsuranceValidTo']}),120);
assert.equal(vehicle.termSources.insuranceValidTo.invalid,true);
