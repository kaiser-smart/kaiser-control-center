import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function dataBoxPlusConnectionError'), source.indexOf('function dataBoxPlusMailboxCard'));
const action = source.slice(source.indexOf('async function testDataBoxPlusMailboxConnection(mailboxIdValue)'), source.indexOf('async function importDataBoxPlusCredentialsFromDataBox'));
const state = { mailboxTestingId: '', mailboxTestResults: {}, mailboxes: [{id: 'a', isdsId: 'abc1234'}, {id: 'b', isdsId: 'bad'}] };
let resolveRequest, rejectRequest, requests = 0, refreshes = 0;
const apiJson = () => { requests++; return new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; }); };
const { test, feedback, humanError } = new Function('dataBoxPlusState', 'apiJson', 'loadDataBoxPlusData', `
 const render = () => {};
 const dataBoxPlusMailboxes = () => dataBoxPlusState.mailboxes;
 const escapeHtml = (v) => String(v).replaceAll('<', '&lt;');
 const formatDateTime = (v) => v;
 ${helpers} ${action}
 return {test:testDataBoxPlusMailboxConnection, feedback:dataBoxPlusMailboxTestFeedback, humanError:dataBoxPlusConnectionError};
`)(state, apiJson, async () => { refreshes++; });
await test('b');
assert.equal(requests, 0);
assert.match(state.mailboxTestResults.b.message, /ID.*nesprávný formát/);
let pending = test('a');
assert.equal(state.mailboxTestResults.a.status, 'pending');
await test('a');
assert.equal(requests, 1);
resolveRequest({status:'success'}); await pending;
assert.equal(state.mailboxTestResults.a.status, 'success');
assert.match(feedback(state.mailboxes[0]), /Připojení je v pořádku/);
assert.match(state.mailboxTestResults.a.message, /ID.*neověřuje/);
pending = test('a');
rejectRequest({payload:{code:'data_box_isds_auth_failed'}}); await pending;
assert.equal(state.mailboxTestResults.a.status, 'error');
assert.match(feedback(state.mailboxes[0]), /role="alert"/);
assert.match(state.mailboxTestResults.a.message, /login a heslo/);
assert.equal(state.mailboxTestingId, '');
pending = test('a'); resolveRequest({}); await pending;
assert.equal(state.mailboxTestResults.a.status, 'error', 'HTTP 200 without confirmed success must fail closed');
assert.equal(refreshes, 3);
pending = test('a');
resolveRequest({status:'error', code:'data_box_isds_auth_failed', error:'ISDS odmítlo login nebo heslo.'}); await pending;
assert.equal(state.mailboxTestResults.a.status, 'error');
assert.match(state.mailboxTestResults.a.message, /ISDS odmítlo přihlášení/);
const routeSource = readFileSync(new URL('../functions/api/data-box-plus/mailboxes/[id]/test.js', import.meta.url), 'utf8');
const routeBody = routeSource.slice(routeSource.indexOf('export async function')).replace('export async function', 'async function');
const handler = new Function('json', 'requireUserPermission', 'testDataBoxPlusMailboxConnection', 'dataBoxPlusStoreErrorResponse', `${routeBody}; return onRequestPost;`)(
 (payload, status = 200) => ({payload, status}), async () => ({user:{}}),
 async () => { throw {code:'data_box_isds_auth_failed'}; },
 (error) => ({payload:{code:error.code,error:'ISDS odmítlo login nebo heslo.'},status:502})
);
const rejectedLogin = await handler({request:{},env:{},params:{id:'a'}});
assert.equal(rejectedLogin.status, 200);
assert.equal(rejectedLogin.payload.status, 'error');
assert.equal(rejectedLogin.payload.code, 'data_box_isds_auth_failed');
assert.match(humanError({payload:{code:'data_box_isds_access_denied'}}), /oprávnění účtu/);
assert.match(humanError({payload:{code:'data_box_plus_mailbox_credentials_missing'}}), /Chybí aktivní login nebo heslo/);
assert.match(humanError({name:'TypeError', message:'Failed to fetch'}), /chyba nepotvrzuje/);
assert.match(humanError({payload:{error:'Nepřihlášeno.'}}), /Přihlášení do Smart odpady vypršelo/);
assert.match(humanError({payload:{error:'Nemáte oprávnění.'}}), /oprávnění ve Smart odpady/);
const client = readFileSync(new URL('../functions/_lib/data-box-isds-client.js', import.meta.url), 'utf8');
const statusSource = client.slice(client.indexOf('function assertIsdsStatus'), client.indexOf('async function withTimeout'));
const check = new Function(`class DataBoxIsdsError extends Error { constructor(message,status,code) { super(message); this.status=status; this.code=code; } } const tagValue=()=>''; const soapFaultMessage=()=>''; ${statusSource}; return assertIsdsStatus;`)();
assert.throws(() => check('',401), {code:'data_box_isds_auth_failed'});
assert.throws(() => check('',403), {code:'data_box_isds_access_denied'});
assert.throws(() => check('',503), {code:'data_box_isds_http_failed'});
console.log('Connection feedback: ID validation, pending, duplicate guard, success, retry, auth, permissions, unknown response and outage passed.');

const storeSource = readFileSync(new URL('../functions/_lib/data-box-plus-store.js', import.meta.url), 'utf8');
const bootstrapSource = storeSource.slice(storeSource.indexOf('export async function ensureDataBoxPlusMailboxes'), storeSource.indexOf('export async function ensureDataBoxPlusMailboxes') + storeSource.slice(storeSource.indexOf('export async function ensureDataBoxPlusMailboxes')).indexOf('\nexport ', 1)).replace('export async function', 'async function');
let configuredSlot7 = false;
const ensuredSlots = [];
const bootstrap = new Function('configuredAccounts', 'ensureMailbox', `
 const LEGACY_BOOTSTRAP_MAILBOX_COUNT = 7;
 const MAILBOX_NAMES = [];
 const dataBoxPlusDatabase = () => ({});
 const dataBoxIsdsStatus = () => ({accounts:configuredAccounts()});
 const dataBoxIsdsAccountConfigs = configuredAccounts;
 const fallbackAccountMap = () => new Map();
 const sourceDataBoxMap = async () => new Map();
 const sourceDataBoxIdForSlot = slot => String(slot);
 const sourceLabelForRow = (_, name) => name;
 const cleanString = value => String(value || '').trim();
 const mailboxRowsWithCredentials = async () => [];
 ${bootstrapSource}
 return ensureDataBoxPlusMailboxes;
`)(() => configuredSlot7 ? [{slot:7,isdsId:'abc1234'}] : [], async (_, account) => ensuredSlots.push(account.slot));
await bootstrap({});
assert.deepEqual(ensuredSlots, [1,2,3,4,5,6], 'Removed empty slot 7 must not be recreated');
ensuredSlots.length = 0;
configuredSlot7 = true;
await bootstrap({});
assert.deepEqual(ensuredSlots, [1,2,3,4,5,6,7], 'Configured slot 7 must remain supported');
console.log('Empty holding bootstrap removal and configured slot preservation passed.');
