const encoder = new TextEncoder();
const decoder = new TextDecoder();
const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const base64 = value => Buffer.from(value).toString('base64');
async function key(secret) {
  const raw = bytes(secret);
  if (raw.length !== 32) throw new Error('Invalid encryption key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
// Bind ciphertext to tenant and job; moving encrypted rows cannot change ownership.
export async function seal(value, secret, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: encoder.encode(context) }, await key(secret), encoder.encode(JSON.stringify(value)));
  return `v1.${base64(iv)}.${base64(ciphertext)}`;
}
export async function unseal(value, secret, context) {
  const [version, iv, ciphertext] = value.split('.');
  if (version !== 'v1') throw new Error('Invalid ciphertext');
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv),
    additionalData: encoder.encode(context) }, await key(secret), bytes(ciphertext));
  return JSON.parse(decoder.decode(raw));
}
export async function digest(value) {
  return base64(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value))));
}
