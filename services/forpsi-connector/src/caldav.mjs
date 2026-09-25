import { mailboxPassword } from './credentials.mjs';
import { XMLParser } from 'fast-xml-parser';
import ICAL from 'ical.js';
import { z } from 'zod';
import { id } from './schemas.mjs';
import { requireValue, ConnectorError } from './errors.mjs';

const ORIGIN = 'https://syncdav.forpsi.com';
const array = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const opaque = value => Buffer.from(value).toString('base64url');
const decode = value => Buffer.from(value, 'base64url').toString('utf8');
const davId = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/);
const etag = z.string().max(300).regex(/^"[^"\r\n]+"$/);
const time = z.string().datetime({ offset: true });
const event = z.object({ summary: z.string().min(1).max(500), description: z.string().max(10000).default(''),
  location: z.string().max(500).default(''), start: time, end: time }).strict()
  .refine(e => Date.parse(e.end) > Date.parse(e.start), 'End must follow start');
const selection = { mailboxId: id, calendarId: davId };
export const calendarSchemas = {
  calendar: z.object({ mailboxId: id }).strict(),
  list: z.object({ ...selection, start: time, end: time }).strict().refine(
    a => Date.parse(a.end) > Date.parse(a.start) && Date.parse(a.end) - Date.parse(a.start) <= 31 * 86400000, 'Maximum 31 days'),
  read: z.object({ ...selection, eventId: davId }).strict(),
  create: z.object({ ...selection, requestId: z.string().uuid(), event }).strict(),
  update: z.object({ ...selection, eventId: davId, etag, event }).strict(),
  delete: z.object({ ...selection, eventId: davId, etag }).strict(),
};
export function safeDavUrl(value, base = ORIGIN) {
  const url = new URL(value, base);
  requireValue(url.origin === ORIGIN && !url.username && !url.password && !url.search && !url.hash, 'DAV_URL_DENIED');
  for (const segment of url.pathname.split('/')) {
    const decoded = decodeURIComponent(segment);
    requireValue(!/[\\/%\x00-\x1f\x7f]/.test(decoded) && decoded !== '.' && decoded !== '..', 'DAV_URL_DENIED');
  }
  return url.href;
}
const xml = names => `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="urn:ietf:params:xml:ns:carddav"><d:prop>${names}</d:prop></d:propfind>`;
export function multistatus(text) {
  requireValue(!/<!DOCTYPE|<!ENTITY/i.test(text), 'DAV_XML_DENIED');
  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, parseTagValue: false }).parse(text);
  return array(parsed.multistatus?.response).map(response => ({ href: response.href,
    props: Object.assign({}, ...array(response.propstat).filter(p => /\s200\s/.test(p.status)).map(p => p.prop)) }));
}
const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
function component(text) { return new ICAL.Component(ICAL.parse(text)); }
function requireSimple(calendar) {
  const events = calendar.getAllSubcomponents('vevent');
  requireValue(events.length === 1 && !events[0].hasProperty('rrule') && !events[0].hasProperty('rdate') &&
    !events[0].hasProperty('recurrence-id') && !events[0].hasProperty('attendee') && !events[0].hasProperty('organizer') &&
    !events[0].getAllSubcomponents('valarm').some(a => a.getFirstPropertyValue('action') === 'EMAIL'),
  'COMPLEX_EVENT_WRITE_NOT_SUPPORTED');
  return events[0];
}
function patchEvent(vevent, data) {
  for (const field of ['summary', 'description', 'location']) vevent.updatePropertyWithValue(field, data[field]);
  vevent.updatePropertyWithValue('dtstart', ICAL.Time.fromJSDate(new Date(data.start), true));
  vevent.removeAllProperties('duration');
  vevent.updatePropertyWithValue('dtend', ICAL.Time.fromJSDate(new Date(data.end), true));
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
}
function present(text, url, etag) {
  const calendar = component(text);
  return { eventId: opaque(url), etag, untrustedContent: true, occurrencesExpanded: false,
    events: calendar.getAllSubcomponents('vevent').map(e => ({
      uid: e.getFirstPropertyValue('uid'), summary: e.getFirstPropertyValue('summary') ?? '',
      description: e.getFirstPropertyValue('description') ?? '', location: e.getFirstPropertyValue('location') ?? '',
      start: e.getFirstPropertyValue('dtstart')?.toString() ?? null,
      end: e.getFirstPropertyValue('dtend')?.toString() ?? null,
      timezone: e.getFirstProperty('dtstart')?.getParameter('tzid') ?? null,
      recurring: e.hasProperty('rrule') || e.hasProperty('rdate') || e.hasProperty('recurrence-id'),
      hasAttendees: e.hasProperty('attendee'),
    })) };
}

export class CalDav {
  constructor(env, mailbox, fetcher = fetch) {
    this.env = env;
    this.mailbox = mailbox;
    this.fetcher = fetcher;
  }
  async request(url, method, body, headers = {}) {
    const password = await mailboxPassword(this.env, this.mailbox);
    const authorization = `Basic ${Buffer.from(`${this.mailbox.address}:${password}`).toString('base64')}`;
    // Native Workers fetch must not receive the DAV instance as its `this` value.
    const fetcher = this.fetcher;
    const response = await fetcher(safeDavUrl(url), { method, redirect: 'manual',
      signal: AbortSignal.timeout(20000), headers: { authorization,
        'content-type': 'application/xml; charset=utf-8', ...headers }, ...(body === undefined ? {} : { body }) });
    if (!response.ok) {
      const error = new ConnectorError(response.status >= 300 && response.status < 400 ? 'DAV_REDIRECT_DENIED' :
        response.status === 412 ? 'CALENDAR_VERSION_CONFLICT' :
        [401,403].includes(response.status) ? 'CALDAV_ACCESS_DENIED' : 'CALDAV_UNAVAILABLE');
      error.httpStatus = response.status;
      await response.body?.cancel();
      throw error;
    }
    const chunks = []; let length = 0;
    if (response.body) for await (const chunk of response.body) {
      length += chunk.length; requireValue(length <= 2 * 1024 * 1024, 'DAV_RESPONSE_TOO_LARGE'); chunks.push(chunk);
    }
    return { text: Buffer.concat(chunks).toString('utf8'), etag: response.headers.get('etag') };
  }
  async propfind(url, properties, depth = '0', stage) {
    try { return multistatus((await this.request(url, 'PROPFIND', xml(properties), { depth })).text); }
    catch (error) { error.davStage = stage; throw error; }
  }
  async calendars() {
    const root = await this.propfind(`${ORIGIN}/`, '<d:current-user-principal/>', '0', 'root');
    const principal = root.find(r => r.props['current-user-principal']?.href)?.props['current-user-principal'].href;
    requireValue(principal, 'CALDAV_DISCOVERY_UNAVAILABLE');
    const user = await this.propfind(safeDavUrl(principal), '<c:calendar-home-set/>', '0', 'principal');
    const home = user.find(r => r.props['calendar-home-set']?.href)?.props['calendar-home-set'].href;
    requireValue(home, 'CALDAV_DISCOVERY_UNAVAILABLE');
    const collections = await this.propfind(safeDavUrl(home), '<d:displayname/><d:resourcetype/><c:supported-calendar-component-set/>', '1', 'collections');
    return { calendars: collections.filter(r => Object.hasOwn(r.props.resourcetype ?? {}, 'calendar')).map(r => ({
      id: opaque(safeDavUrl(r.href)), name: r.props.displayname ?? '',
      components: array(r.props['supported-calendar-component-set']?.comp).map(c => c['@_name']),
    })) };
  }
  async collection(calendarId) {
    const match = (await this.calendars()).calendars.find(c => c.id === calendarId);
    requireValue(match && match.components.includes('VEVENT'), 'CALENDAR_NOT_AVAILABLE');
    const url = safeDavUrl(decode(calendarId));
    requireValue(url.endsWith('/'), 'INVALID_CALENDAR_COLLECTION'); return url;
  }
  objectUrl(eventId, collection) {
    const url = safeDavUrl(decode(eventId));
    requireValue(url.startsWith(collection) && url !== collection && !url.slice(collection.length).includes('/'), 'EVENT_OUTSIDE_CALENDAR');
    return url;
  }
  async list(args) {
    const collection = await this.collection(args.calendarId);
    const body = `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(args.start)}" end="${stamp(args.end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
    const rows = multistatus((await this.request(collection, 'REPORT', body, { depth: '1' })).text);
    requireValue(rows.length <= 100, 'TOO_MANY_EVENTS_NARROW_DATE_RANGE');
    return { calendarId: args.calendarId, objects: rows.filter(r => r.props['calendar-data']).map(r => {
      const url = this.objectUrl(opaque(safeDavUrl(r.href)), collection);
      return present(r.props['calendar-data'], url, r.props.getetag ?? null);
    }), occurrencesExpanded: false };
  }
  async read(args) {
    const collection = await this.collection(args.calendarId);
    const url = this.objectUrl(args.eventId, collection);
    const response = await this.request(url, 'GET');
    return present(response.text, url, response.etag);
  }
  async create(args) {
    const collection = await this.collection(args.calendarId);
    const calendar = new ICAL.Component(['vcalendar', [], []]);
    calendar.updatePropertyWithValue('version', '2.0');
    calendar.updatePropertyWithValue('prodid', '-//Company Forpsi Connector//EN');
    const vevent = new ICAL.Component('vevent');
    vevent.updatePropertyWithValue('uid', args.requestId); patchEvent(vevent, args.event);
    calendar.addSubcomponent(vevent);
    const url = safeDavUrl(`${collection}${args.requestId}.ics`);
    const response = await this.request(url, 'PUT', calendar.toString(), { 'content-type': 'text/calendar; charset=utf-8', 'if-none-match': '*' });
    return { eventId: opaque(url), etag: response.etag, created: true };
  }
  async mutate(args, remove = false) {
    const collection = await this.collection(args.calendarId);
    const url = this.objectUrl(args.eventId, collection);
    const original = await this.request(url, 'GET');
    requireValue(original.etag === args.etag, 'CALENDAR_VERSION_CONFLICT');
    const calendar = component(original.text); const vevent = requireSimple(calendar);
    if (remove) {
      await this.request(url, 'DELETE', undefined, { 'if-match': args.etag });
      return { deleted: true, eventId: args.eventId };
    }
    patchEvent(vevent, args.event);
    vevent.updatePropertyWithValue('sequence', (vevent.getFirstPropertyValue('sequence') ?? 0) + 1);
    const response = await this.request(url, 'PUT', calendar.toString(), { 'content-type': 'text/calendar; charset=utf-8', 'if-match': args.etag });
    return { updated: true, eventId: args.eventId, etag: response.etag };
  }
}
