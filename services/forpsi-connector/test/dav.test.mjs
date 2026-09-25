import test from 'node:test';
import assert from 'node:assert/strict';
import { CalDav, safeDavUrl, multistatus } from '../src/caldav.mjs';
import { CardDav } from '../src/carddav.mjs';
import { capabilities } from '../src/capabilities.mjs';

const origin = 'https://syncdav.forpsi.com';
const calendarPath = '/calendars/alice/personal/';
const bookPath = '/addressbooks/alice/contacts/';
const opaque = value => Buffer.from(value).toString('base64url');
const calendarId = opaque(origin + calendarPath);
const addressBookId = opaque(origin + bookPath);
const eventData = { summary: 'Porada, tým', description: 'Řádek 1\nŘádek 2', location: 'Praha',
  start: '2026-09-26T10:00:00+02:00', end: '2026-09-26T11:00:00+02:00' };
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const multi = (href, props) => `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="urn:ietf:params:xml:ns:carddav"><d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
function fixture() {
  const calls = []; const objects = new Map();
  const fetcher = async (url, request) => {
    calls.push({ url, ...request });
    const path = new URL(url).pathname;
    if (request.method === 'PROPFIND') {
      let response;
      if (path === '/') response = multi('/', '<d:current-user-principal><d:href>/principals/alice/</d:href></d:current-user-principal>');
      else if (path === '/principals/alice/') response = multi(path,
        '<c:calendar-home-set><d:href>/calendars/alice/</d:href></c:calendar-home-set><a:addressbook-home-set><d:href>/addressbooks/alice/</d:href></a:addressbook-home-set>');
      else if (path === '/calendars/alice/') response = multi(calendarPath,
        '<d:displayname>Pracovní</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>');
      else if (path === '/addressbooks/alice/') response = multi(bookPath,
        '<d:displayname>Kontakty</d:displayname><d:resourcetype><d:collection/><a:addressbook/></d:resourcetype>');
      return new Response(response, { status: 207 });
    }
    if (request.method === 'GET') {
      const object = objects.get(url);
      return object ? new Response(object.text, { headers: { etag: object.etag } }) : new Response(null, { status: 404 });
    }
    if (request.method === 'PUT') {
      if (request.headers['if-none-match'] === '*' && objects.has(url)) return new Response(null, { status: 412 });
      if (request.headers['if-match'] && objects.get(url)?.etag !== request.headers['if-match']) return new Response(null, { status: 412 });
      const etag = `"${objects.has(url) ? 2 : 1}"`;
      objects.set(url, { text: request.body, etag });
      return new Response(null, { status: 201, headers: { etag } });
    }
    if (request.method === 'DELETE') {
      assert.equal(request.headers['if-match'], objects.get(url)?.etag);
      objects.delete(url); return new Response(null, { status: 204 });
    }
    if (request.method === 'REPORT') {
      const [url, item] = [...objects].find(([key]) => key.startsWith(origin + path)) ?? [];
      if (!url) return new Response('<d:multistatus xmlns:d="DAV:"/>', { status: 207 });
      return new Response(multi(new URL(url).pathname, `<d:getetag>${item.etag}</d:getetag><${path.startsWith('/calendars') ? 'c:calendar-data' : 'a:address-data'}>${escape(item.text)}</${path.startsWith('/calendars') ? 'c:calendar-data' : 'a:address-data'}>`), { status: 207 });
    }
    throw new Error('Unexpected request');
  };
  const env = { MAILBOX_CREDENTIALS: '{"secret":"fake-test-password"}' };
  const mailbox = { address: 'alice@example.com', credential_key: 'secret' };
  return { calls, objects, calendar: new CalDav(env, mailbox, fetcher), contacts: new CardDav(env, mailbox, fetcher) };
}

test('CalDAV discovers actual collection paths, creates, reads, edits and deletes with ETags', async () => {
  const f = fixture();
  assert.equal((await f.calendar.calendars()).calendars[0].id, calendarId);
  const created = await f.calendar.create({ calendarId, requestId: crypto.randomUUID(), event: eventData });
  const original = await f.calendar.read({ calendarId, eventId: created.eventId });
  assert.equal(original.events[0].summary, eventData.summary);
  assert.equal(original.events[0].start, '2026-09-26T08:00:00Z');
  assert.equal((await f.calendar.list({ calendarId, start: eventData.start, end: eventData.end })).objects.length, 1);
  await assert.rejects(f.calendar.mutate({ calendarId, eventId: created.eventId, etag: '"old"', event: eventData }), /VERSION_CONFLICT/);
  const edited = await f.calendar.mutate({ calendarId, eventId: created.eventId, etag: original.etag,
    event: { ...eventData, summary: 'Nový předmět' } });
  assert.equal(edited.etag, '"2"');
  await f.calendar.mutate({ calendarId, eventId: created.eventId, etag: edited.etag }, true);
  assert.equal(f.objects.size, 0);
  assert.ok(f.calls.every(c => c.redirect === 'error'));
});
test('repeat calendar creation conflicts without duplicating; attendee writes are rejected', async () => {
  const f = fixture(); const args = { calendarId, requestId: crypto.randomUUID(), event: eventData };
  const created = await f.calendar.create(args);
  await assert.rejects(f.calendar.create(args), /VERSION_CONFLICT/);
  const url = Buffer.from(created.eventId, 'base64url').toString('utf8');
  const item = f.objects.get(url);
  item.text = item.text.replace('END:VEVENT', 'ATTENDEE:mailto:other@example.com\r\nEND:VEVENT');
  await assert.rejects(f.calendar.mutate({ calendarId, eventId: created.eventId, etag: item.etag }, true), /COMPLEX_EVENT/);
  assert.equal(f.objects.size, 1);
});
test('DAV rejects external URLs, credentials in URLs, XML entities and cross-collection object IDs', async () => {
  for (const url of ['https://attacker.example/', 'http://syncdav.forpsi.com/', 'https://x:secret@syncdav.forpsi.com/',
    `${origin}${calendarPath}%2e%2e%2fother.ics`, `${origin}${calendarPath}%252e%252e%252fother.ics`]) {
    assert.throws(() => safeDavUrl(url), /DAV_URL_DENIED/);
  }
  assert.throws(() => multistatus('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///secret">]><x/>'), /DAV_XML_DENIED/);
  const f = fixture();
  await assert.rejects(f.calendar.read({ calendarId, eventId: opaque(origin + '/calendars/bob/secret.ics') }), /EVENT_OUTSIDE_CALENDAR/);
  assert.equal(f.calls.some(c => c.method === 'GET'), false);
});
test('CardDAV contacts support creation, search, patch and deletion while preserving omitted fields', async () => {
  const f = fixture();
  assert.equal((await f.contacts.addressBooks()).addressBooks[0].id, addressBookId);
  const created = await f.contacts.createContact({ addressBookId, requestId: crypto.randomUUID(), contact: {
    displayName: 'Žaneta Nováková', givenName: 'Žaneta', familyName: 'Nováková',
    emails: ['zaneta@example.com'], phones: ['+420123456789'], note: 'Původní poznámka' } });
  const original = await f.contacts.readContact({ addressBookId, contactId: created.contactId });
  assert.equal(original.displayName, 'Žaneta Nováková');
  assert.equal(original.familyName, 'Nováková');
  const result = await f.contacts.searchContacts({ addressBookId, query: 'Žaneta & Co <all>' });
  assert.equal(result.contacts.length, 1);
  assert.match(f.calls.find(c => c.method === 'REPORT').body, /&amp; Co &lt;all&gt;/);
  const changed = await f.contacts.mutateContact({ addressBookId, contactId: created.contactId, etag: original.etag,
    patch: { displayName: 'Žaneta N.' } });
  const updated = await f.contacts.readContact({ addressBookId, contactId: created.contactId });
  assert.equal(updated.note, 'Původní poznámka'); assert.deepEqual(updated.emails, ['zaneta@example.com']);
  await assert.rejects(f.contacts.mutateContact({ addressBookId, contactId: created.contactId, etag: '"old"', patch: { note: 'stale' } }), /VERSION_CONFLICT/);
  await f.contacts.mutateContact({ addressBookId, contactId: created.contactId, etag: changed.etag }, true);
  assert.equal(f.objects.size, 0);
});
test('unsupported groupware modules are reported honestly', () => {
  const status = capabilities();
  assert.equal(status.liveAccountVerified, false);
  for (const id of ['files','tasks','notes','signatures']) {
    assert.equal(status.modules.find(m => m.id === id).implementation, 'NOT_IMPLEMENTED');
  }
  assert.equal(status.modules.find(m => m.id === 'labels').implementation, 'CONNECTOR_STORAGE');
});
