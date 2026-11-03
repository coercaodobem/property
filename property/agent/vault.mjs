import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export const VAULT_ITERATIONS = 600_000;
export const VAULT_FORMAT = 'property-agent-encrypted-key-v1';

function aad(format, pubkey, version) { return Buffer.from(`${format}\0${pubkey}\0${version}`, 'utf8'); }
function derive(password, salt) { return pbkdf2Sync(password, salt, VAULT_ITERATIONS, 32, 'sha256'); }

export function createVault(secret, pubkey, password) {
  const bytes = Buffer.from(secret);
  if (bytes.length !== 32 || !/^[0-9a-f]{64}$/.test(pubkey) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 12) throw new Error('Senha ou identidade local inválida.');
  const salt = randomBytes(16), iv = randomBytes(12), key = derive(password, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(VAULT_FORMAT, pubkey, 1));
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return { format: VAULT_FORMAT, version: 1, pubkey, kdf: 'PBKDF2-HMAC-SHA-256', iterations: VAULT_ITERATIONS, salt: salt.toString('base64'), cipher: 'AES-256-GCM', iv: iv.toString('base64'), ciphertext: encrypted.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64') };
  } finally { key.fill(0); bytes.fill(0); }
}

export function unlockVault(vault, password, nostr, context) {
  if (!vault || vault.format !== VAULT_FORMAT || vault.version !== 1 || vault.kdf !== 'PBKDF2-HMAC-SHA-256' || vault.iterations !== VAULT_ITERATIONS || vault.cipher !== 'AES-256-GCM' || !/^[0-9a-f]{64}$/.test(vault.pubkey) || typeof password !== 'string') throw new Error('Cofre Property Agent inválido ou incompatível.');
  const salt = Buffer.from(vault.salt, 'base64'), iv = Buffer.from(vault.iv, 'base64'), encrypted = Buffer.from(vault.ciphertext, 'base64'), tag = Buffer.from(vault.auth_tag, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || encrypted.length !== 32) throw new Error('Cofre Property Agent inválido ou incompatível.');
  const key = derive(password, salt);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(vault.format, vault.pubkey, vault.version));
    decipher.setAuthTag(tag);
    const secret = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const inContext = context.propertyAgentSecretHex;
    try {
      context.propertyAgentSecretHex = secret.toString('hex');
      const vmSecret = context.Uint8Array.from(context.propertyAgentSecretHex.match(/.{2}/g), value => parseInt(value, 16));
      const pubkey = nostr.getPublicKey(vmSecret);
      if (pubkey !== vault.pubkey) throw new Error('Cofre Property Agent inválido ou incompatível.');
      return { secretHex: secret.toString('hex'), pubkey };
    } finally { context.propertyAgentSecretHex = inContext; secret.fill(0); }
  } catch { throw new Error('Senha incorreta ou cofre adulterado.'); }
  finally { key.fill(0); }
}
