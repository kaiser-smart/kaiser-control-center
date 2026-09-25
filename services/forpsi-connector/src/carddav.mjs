import ICAL from 'ical.js';
import { z } from 'zod';
import { CalDav, safeDavUrl, multistatus } from './caldav.mjs';
import { id } from './schemas.mjs';
import { requireValue } from './errors.mjs';

const opaque = value => Buffer.from(value).toString('base64url');
const decode = value => Buffer.from(value, 'base64url').toString('utf8');
const davId = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/);
const etag = z.string().max(300).regex(/^"[^"\r\n]+"$/);
const fields = z.object({ displayName: z.string().min(1).max(300).optional(),
  givenName: z.string().max(150).optional(), familyName: z.string().max(150).optional(),
  emails: z.array(z.string().email().max(254)).max(10).optional(),
  phones: z.array(z.string().max(80).regex(/^[^\r\n\x00]+$/)).max(10).optional(),
  organization: z.string().max(300).optional(), note: z.string().max(5000).optional() }).strict();
const selection = { mailboxId: id, addressBookId: davId };
export const contactSchemas = {
  books: z.object({ mailboxId: id }).strict(),
  search: z.object({ ...selection, query: z.string().min(2).max(100) }).strict(),
  read: z.object({ ...selection, contactId: davId }).strict(),
  create: z.object({ ...selection, requestId: z.string().uuid(), contact: fields.refine(c => !!c.displayName, 'Display name required') }).strict(),
  update: z.object({ ...selection, contactId: davId, etag, patch: fields.refine(c => Object.keys(c).length > 0, 'Patch must not be empty') }).strict(),
  delete: z.object({ ...selection, contactId: davId, etag }).strict(),
};
const escapeXml = value => value.replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[c]);
function parseCard(text) {
  const card = new ICAL.Component(ICAL.parse(text));
  requireValue(card.name === 'vcard' && ['3.0','4.0'].includes(card.getFirstPropertyValue('version')), 'VCARD_NOT_SUPPORTED');
  return card;
}
function present(text, url, etag) {
  const card = parseCard(text);
  const name = card.getFirstPropertyValue('n') ?? [];
  return { contactId: opaque(url), etag, untrustedContent: true,
    displayName: card.getFirstPropertyValue('fn') ?? '', familyName: name[0] ?? '', givenName: name[1] ?? '',
    emails: card.getAllProperties('email').map(p => p.getFirstValue()),
    phones: card.getAllProperties('tel').map(p => p.getFirstValue()),
    organization: card.getFirstPropertyValue('org') ?? '', note: card.getFirstPropertyValue('note') ?? '' };
}
function patchCard(card, patch) {
  if (patch.displayName !== undefined) card.updatePropertyWithValue('fn', patch.displayName);
  if (patch.givenName !== undefined || patch.familyName !== undefined) {
    const old = card.getFirstPropertyValue('n') ?? ['', '', '', '', ''];
    card.updatePropertyWithValue('n', [patch.familyName ?? old[0], patch.givenName ?? old[1], ...old.slice(2)]);
  }
  if (patch.organization !== undefined) card.updatePropertyWithValue('org', [patch.organization]);
  if (patch.note !== undefined) card.updatePropertyWithValue('note', patch.note);
  for (const [field, property] of [['emails','email'], ['phones','tel']]) {
    if (patch[field] === undefined) continue;
    card.removeAllProperties(property);
    for (const value of patch[field]) card.addPropertyWithValue(property, value);
  }
}

export class CardDav extends CalDav {
  async addressBooks() {
    const root = await this.propfind('https://syncdav.forpsi.com/', '<d:current-user-principal/>');
    const principal = root.find(r => r.props['current-user-principal']?.href)?.props['current-user-principal'].href;
    requireValue(principal, 'CARDDAV_DISCOVERY_UNAVAILABLE');
    const user = await this.propfind(safeDavUrl(principal), '<a:addressbook-home-set/>');
    const home = user.find(r => r.props['addressbook-home-set']?.href)?.props['addressbook-home-set'].href;
    requireValue(home, 'CARDDAV_DISCOVERY_UNAVAILABLE');
    const collections = await this.propfind(safeDavUrl(home), '<d:displayname/><d:resourcetype/>', '1');
    return { addressBooks: collections.filter(r => Object.hasOwn(r.props.resourcetype ?? {}, 'addressbook')).map(r => ({
      id: opaque(safeDavUrl(r.href)), name: r.props.displayname ?? '' })) };
  }
  async book(addressBookId) {
    const match = (await this.addressBooks()).addressBooks.find(b => b.id === addressBookId);
    requireValue(match, 'ADDRESS_BOOK_NOT_AVAILABLE');
    const url = safeDavUrl(decode(addressBookId));
    requireValue(url.endsWith('/'), 'INVALID_ADDRESS_BOOK'); return url;
  }
  async searchContacts(args) {
    const collection = await this.book(args.addressBookId);
    const query = escapeXml(args.query);
    const body = `<?xml version="1.0"?><a:addressbook-query xmlns:d="DAV:" xmlns:a="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><a:address-data/></d:prop><a:filter test="anyof"><a:prop-filter name="FN"><a:text-match collation="i;unicode-casemap" match-type="contains">${query}</a:text-match></a:prop-filter><a:prop-filter name="EMAIL"><a:text-match collation="i;unicode-casemap" match-type="contains">${query}</a:text-match></a:prop-filter></a:filter><a:limit><a:nresults>100</a:nresults></a:limit></a:addressbook-query>`;
    const rows = multistatus((await this.request(collection, 'REPORT', body, { depth: '1' })).text);
    // A limit error from the server must not become a false empty result.
    requireValue(rows.every(r => r.props['address-data']), 'CONTACT_SEARCH_INCOMPLETE_NARROW_QUERY');
    requireValue(rows.length < 100, 'CONTACT_SEARCH_LIMIT_NARROW_QUERY');
    return { contacts: rows.map(r => present(r.props['address-data'], this.objectUrl(opaque(safeDavUrl(r.href)), collection), r.props.getetag ?? null)) };
  }
  async readContact(args) {
    const collection = await this.book(args.addressBookId);
    const url = this.objectUrl(args.contactId, collection);
    const response = await this.request(url, 'GET');
    return present(response.text, url, response.etag);
  }
  async createContact(args) {
    const collection = await this.book(args.addressBookId);
    const card = new ICAL.Component(['vcard', [], []]);
    card.addPropertyWithValue('version', '3.0');
    card.addPropertyWithValue('uid', args.requestId);
    patchCard(card, { givenName: '', familyName: '', ...args.contact });
    const url = safeDavUrl(`${collection}${args.requestId}.vcf`);
    const response = await this.request(url, 'PUT', card.toString(), { 'content-type': 'text/vcard; charset=utf-8', 'if-none-match': '*' });
    return { created: true, contactId: opaque(url), etag: response.etag };
  }
  async mutateContact(args, remove = false) {
    const collection = await this.book(args.addressBookId);
    const url = this.objectUrl(args.contactId, collection);
    const original = await this.request(url, 'GET');
    requireValue(original.etag === args.etag, 'CONTACT_VERSION_CONFLICT');
    if (remove) {
      await this.request(url, 'DELETE', undefined, { 'if-match': args.etag });
      return { deleted: true, contactId: args.contactId };
    }
    const card = parseCard(original.text);
    patchCard(card, args.patch);
    const response = await this.request(url, 'PUT', card.toString(), { 'content-type': 'text/vcard; charset=utf-8', 'if-match': args.etag });
    return { updated: true, contactId: args.contactId, etag: response.etag };
  }
}
