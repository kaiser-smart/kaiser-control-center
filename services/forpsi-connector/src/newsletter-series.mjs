// A series is scoped to an exact sender and a stable subject stem approved by the user.
// A bare "Newsletter" is too broad to establish a series from one example.
export function newsletterSeriesKey(subject=''){
  const stem=String(subject).toLocaleLowerCase('cs-CZ').replace(/^(re|fw|fwd):\s*/giu,'')
    .replace(/\s*(?:[#№]\s*\d+|\b(?:vydání|číslo)\s+\d+|\b\d{1,2}[./-]\d{4})\s*$/iu,'')
    .replace(/\s+/g,' ').replace(/[\s:|–-]+$/u,'').trim();
  return stem.length>=8 && !['newsletter','novinky','aktuality'].includes(stem)?stem:null;
}
