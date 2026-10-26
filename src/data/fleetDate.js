// Operational vehicle dates must be explicit calendar dates, never numeric IDs.
// Values outside 1900–2100 require source verification rather than an "OK" badge.
export function fleetCalendarDate(value) {
  const raw = String(value ?? '').trim();
  let iso = '';
  const ms = raw.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
  const cz = raw.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  const date = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (ms) {
    const parsed = new Date(Number(ms[1]));
    if (!Number.isFinite(parsed.getTime())) return '';
    iso = parsed.toISOString().slice(0, 10);
  } else if (cz) iso = `${cz[3]}-${cz[2].padStart(2, '0')}-${cz[1].padStart(2, '0')}`;
  else if (date) iso = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const year = Number(iso.slice(0, 4));
  const parsed = new Date(`${iso}T00:00:00Z`);
  return year >= 1900 && year <= 2100 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : '';
}
