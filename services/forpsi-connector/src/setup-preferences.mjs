// Conservative Czech free-text parsing. Every output is a proposal, never a mailbox action.
const email=/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?/giu;
const weekday=[[/ponděl[íi]/iu,1],[/úter[ýyíi]/iu,2],[/střed[auy]/iu,3],
  [/čtvrt(?:ek|ka)/iu,4],[/pát(?:ek|ku)/iu,5],[/sobot[auu]/iu,6],[/neděl[eiiy]/iu,7]];
const normalized=text=>text.toLocaleLowerCase('cs-CZ').replace(/\s+/g,' ').trim();
const hhmm=(hour,minute='0')=>{
  const h=Number(hour),m=Number(minute);
  return h>=0&&h<=23&&m>=0&&m<=59?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`:null;
};
const bounds=text=>{
  const match=text.match(/(?:od\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:do|až|-|–)\s*(\d{1,2})(?::(\d{2}))?/iu);
  if(!match)return null;
  const start=hhmm(match[1],match[2]),end=hhmm(match[3],match[4]);
  return start&&end&&start<end?{start,end}:null;
};
function shorterDays(text,start,ambiguities){
  const results=[];
  for(const match of text.matchAll(/(?:v|ve)\s+(pondělí|úterý|středu|čtvrtek|pátek|sobotu|neděli)\s+(?:jen\s+)?do\s+(\d{1,2})(?::(\d{2}))?/giu)){
    const day=weekday.find(([pattern])=>pattern.test(match[1]))?.[1],end=hhmm(match[2],match[3]);
    if(day&&end&&end>start)results.push({day,start,end});
    else ambiguities.push('VÝJIMKA_PRACOVNÍHO_DNE_NEJASNÁ');
  }
  return results;
}

export function interpretSetupAnswer(raw,{questionId,observations,proposal,mailboxAddress,question}) {
  const text=normalized(raw),answers={},changes={},interpreted=[],ambiguities=[];
  if(!text)return {answers,changes,interpreted,ambiguities:['PRÁZDNÁ_ODPOVĚĎ']};
  if(text==='přeskočit'||text==='nevím')return {answers:{[questionId]:raw},changes,interpreted:['Téma přeskočeno.'],ambiguities};
  const segments=raw.split(/(?=\bnewsletter\b)|[.;]\s+(?=\p{L})/iu),contactSegments=segments.filter(s=>
    !/newsletter/iu.test(s)&&(questionId==='important_contacts'||/důležit|priorit|kontakt/iu.test(s)));
  const addresses=[...new Set(contactSegments.flatMap(s=>s.match(email)??[]).map(x=>x.toLowerCase()))];
  if(addresses.length){
    changes.importantContacts=[...new Set([...(proposal.importantContacts??[]),...addresses])];
    answers.important_contacts=raw;interpreted.push(`Důležité kontakty: ${addresses.join(', ')}.`);
  }else if(questionId==='important_contacts'&&/^(žádn[ýé]|nikoho)$/iu.test(text)){
    answers.important_contacts=raw;interpreted.push('Bez nově označených důležitých kontaktů.');
  }
  if(/(?:načítej|stahuj|synchronizuj|kontroluj)\s+(?:poštu\s+)?každých\s+(\d{1,3})\s+minut/iu.test(text)){
    const minutes=Number(text.match(/(?:načítej|stahuj|synchronizuj|kontroluj)\s+(?:poštu\s+)?každých\s+(\d{1,3})\s+minut/iu)[1]);
    if(minutes>=15&&minutes<=240&&minutes%15===0){
      changes.synchronization={mode:'interval',minutes};answers.loading_mode=raw;
      interpreted.push(`Přání načítat poštu každých ${minutes} minut; zapnutí vyžaduje serverový plánovač.`);
    }else ambiguities.push('INTERVAL_NEPODPOROVÁN');
  }else if(questionId==='loading_mode'&&/ručně|manuálně|jen na požádání/iu.test(text)){
    changes.synchronization={mode:'manual'};answers.loading_mode=raw;interpreted.push('Ruční načítání pošty.');
  }
  const alert=text.match(/(?:upozorněn[íi]|notifikac[eií]).{0,30}?(?:jen\s+)?(?:od\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:do|až|-|–)\s*(\d{1,2})(?::(\d{2}))?/iu);
  if(alert){
    const start=hhmm(alert[1],alert[2]),end=hhmm(alert[3],alert[4]);
    if(start&&end&&start<end){
      const exceptions=shorterDays(text,start,ambiguities);
      changes.notificationPreference={requested:true,window:{start,end,days:null,exceptions},
        status:'stored_wish_not_implemented'};
      interpreted.push(`Přání upozornění ${start}–${end}${exceptions.length?`; pátek do ${exceptions[0].end}`:''}. Upozornění do ChatGPT nejsou zapnutá.`);
      ambiguities.push('DNY_UPOZORNĚNÍ_NEURČENY');
    }else ambiguities.push('ČAS_UPOZORNĚNÍ_NEPLATNÝ');
  }else if(questionId==='notification_window'&&/bez upozornění|neupozorňuj|žádné notifikace/iu.test(text)){
    changes.notificationPreference={requested:false,status:'stored_wish_not_implemented'};
    answers.notification_window=raw;interpreted.push('Bez požadovaných upozornění.');
  }
  if(questionId==='notification_window'&&proposal.notificationPreference?.window?.days===null &&
    /po[–-]pá|pracovní dny|pondělí až pátek|každý den|všechny dny/iu.test(text)){
    changes.notificationPreference={...proposal.notificationPreference,
      window:{...proposal.notificationPreference.window,days:/každý den|všechny dny/iu.test(text)?
        [1,2,3,4,5,6,7]:[1,2,3,4,5]}};
    answers.notification_window=raw;interpreted.push('Dny časového okna upozornění byly doplněny do návrhu.');
  }
  if(questionId==='working_hours'||/pracovní\s+(?:dny|doba)|pracuji|po[–-]pá|pondělí\s+až\s+pátek/iu.test(text)){
    const workClause=text.match(/(?:pracovní\s+(?:dny|doba)|pracuji|po[–-]pá|pondělí\s+až\s+pátek).{0,110}/iu)?.[0]??text;
    const days=/po[–-]pá|pondělí\s+až\s+pátek/iu.test(workClause)?[1,2,3,4,5]:
      weekday.filter(([pattern])=>pattern.test(workClause)).map(([,number])=>number);
    const window=bounds(workClause);
    if(days.length&&window){
      const exceptions=shorterDays(workClause,window.start,ambiguities);
      changes.workingHours={days:[...new Set(days)],...window,timeZone:'Europe/Prague',exceptions};
      answers.working_hours=raw;interpreted.push(`Pracovní doba ${days.join(', ')}: ${window.start}–${window.end} (Europe/Prague).`);
    }else if(questionId==='working_hours'&&!/jen ruční režim/iu.test(text))ambiguities.push('PRACOVNÍ_DNY_NEBO_ČAS_CHYBÍ');
  }
  if(/newsletter/iu.test(text)){
    const newsletterSegment=segments.find(s=>/newsletter/iu.test(s))??'';
    const sender=newsletterSegment.match(email)?.[0]?.toLowerCase()??null;
    if(sender && /nedávej|nezobrazuj|mimo priorit/iu.test(text)){
      const candidates=(observations.reviewExamples??[]).filter(x=>x.sender?.toLowerCase()===sender);
      if(candidates.length===1&&candidates[0].subject){
        changes.newsletterRules=[...(proposal.newsletterRules??[]),{sender,subject:candidates[0].subject,
          action:'exclude_from_high_priority',evidence:candidates[0].reference,source:'explicit_free_answer'}];
        interpreted.push(`Zatím pouze doložené vydání newsletteru od ${sender}; pokračování série se musí ověřit.`);
      }else ambiguities.push('NEWSLETTER_SERIE_NEURČENA');
    }else ambiguities.push('NEWSLETTER_SERIE_NEURČENA');
  }
  if(questionId==='direct_vs_cc'){
    if(/kopi[ei].{0,30}méně|méně.{0,30}kopi[ei]/iu.test(text)){
      changes.directVsCc='direct_first';answers.direct_vs_cc=raw;interpreted.push('Kopie obvykle méně výrazné; výslovný požadavek zůstává ke kontrole.');
    }else if(/kopi[ei].{0,30}stejn|stejn.{0,30}kopi[ei]/iu.test(text)){
      changes.directVsCc='equal';answers.direct_vs_cc=raw;interpreted.push('Přímé zprávy a kopie bez automatického rozdílu.');
    }
  }
  if(questionId==='signature'){
    const full=raw.match(/pln[ýy]\s+podpis\s*:\s*([\s\S]*?)\s*krátk[ýy]\s+podpis\s*:/iu);
    const short=raw.match(/krátk[ýy]\s+podpis\s*:\s*([\s\S]*)$/iu);
    if(full?.[1]?.trim()&&short?.[1]?.trim()&&full[1].trim().length<=2000&&short[1].trim().length<=1000){
      changes.signature={senderAddress:mailboxAddress,fullText:full[1].trim(),
        shortText:short[1].trim(),source:'user_entered',confirmedAuthor:true};
      answers.signature=raw;interpreted.push('Vlastní plný a krátký podpis jsou v návrhu ke schválení.');
    }else ambiguities.push('PODPIS_VYŽADUJE_PLNOU_A_KRÁTKOU_VARIANTU');
  }
  if(questionId==='practical_review' && /ano|jen čtecí|souhlasím|bez zásahů/iu.test(text)){
    answers.practical_review=raw;interpreted.push('Návrh zůstává čtecí; schválení profilu je samostatný krok.');
  }
  if(questionId.startsWith('review_')){
    const item=question?.evidence;
    if(item?.messageKey && /^(prioritní|důležitá|běžná)\s+(jen\s+)?(tato|tahle)\s+zpráva$/iu.test(text)){
      answers[questionId]=raw;
      changes.messageOverrides=[...(proposal.messageOverrides??[]).filter(x=>x.messageKey!==item.messageKey),
        {messageKey:item.messageKey,priority:/běžná/iu.test(text)?'review':'high',
          evidence:item.reference,source:'explicit_setup_answer'}];
      interpreted.push(`Pouze tato doložená zpráva: ${/běžná/iu.test(text)?'běžná':'prioritní'}.`);
    }
  }
  return {answers,changes,interpreted,ambiguities};
}
