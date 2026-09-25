import { unseal } from './crypto.mjs';
import { requireValue } from './errors.mjs';

export const credentialContext = mailbox => `credentials:${mailbox.tenant_id}:${mailbox.id}:${mailbox.address}`;
export async function mailboxPassword(env, mailbox) {
  if (mailbox.credential_key.startsWith('vault:')) {
    requireValue(env.DB && env.CREDENTIALS_KEY, 'MAILBOX_NOT_CONFIGURED');
    const row = await env.DB.prepare('SELECT ciphertext FROM mailbox_credentials WHERE mailbox_id=?').bind(mailbox.id).first();
    requireValue(row, 'MAILBOX_NOT_CONFIGURED');
    return (await unseal(row.ciphertext, env.CREDENTIALS_KEY, credentialContext(mailbox))).password;
  }
  const secrets = JSON.parse(env.MAILBOX_CREDENTIALS ?? '{}');
  const password = Object.hasOwn(secrets, mailbox.credential_key) ? secrets[mailbox.credential_key] : null;
  requireValue(typeof password === 'string' && password.length > 0, 'MAILBOX_NOT_CONFIGURED');
  return password;
}
