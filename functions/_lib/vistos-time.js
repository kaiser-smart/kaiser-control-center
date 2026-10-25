import { integrationError } from './vistos-integration-store.js';
export function pragueDayBounds(day) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw integrationError('invalid_date',400);
  const base=Date.parse(day+'T00:00:00Z');
  if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,10)!==day)throw integrationError('invalid_date',400);
  const midnight=target=>{
    let t=target;
    for(let i=0;i<3;i++) {
      const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t));
      const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
      const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);t+=target-wall;
    }
    return new Date(t).toISOString();
  };
  return {from:midnight(base),to:midnight(base+86400000)};
}
