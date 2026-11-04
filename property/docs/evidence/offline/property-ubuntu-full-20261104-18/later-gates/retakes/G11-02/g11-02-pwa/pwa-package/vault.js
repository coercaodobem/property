'use strict';
(() => {
  const ITERATIONS = 600000;
  const encoder = new TextEncoder();
  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function fromBase64(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
  async function derivePasswordKey(password, salt) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptBytes(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { iv: toBase64(iv), cipher: toBase64(new Uint8Array(cipher)) };
  }
  async function decryptBytes(key, iv, cipher) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(cipher)));
  }
  async function makeSession(secret) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const encrypted = await encryptBytes(key, secret);
    return { key, iv: encrypted.iv, cipher: encrypted.cipher };
  }
  async function createVault(secret, password, remember, getPublicKey) {
    if (password.length < 12) throw new Error('Escolha uma senha com pelo menos 12 caracteres.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await derivePasswordKey(password, salt);
    const encrypted = await encryptBytes(key, secret);
    const vault = { id: 'account', version: 1, pubkey: getPublicKey(secret), salt: toBase64(salt), iv: encrypted.iv, cipher: encrypted.cipher, createdAt: Date.now() };
    if (remember) vault.session = await makeSession(secret);
    return vault;
  }
  async function unlockVault(vault, password, getPublicKey) {
    if (vault?.format !== undefined && !['property-encrypted-key-v1', 'liberdade-encrypted-key-v1'].includes(vault.format)) throw new Error('Backup Property inválido ou incompatível.');
    if (vault?.version !== 1 || !vault.salt || !vault.iv || !vault.cipher || !vault.pubkey) throw new Error('Backup Property inválido ou incompatível.');
    try {
      const key = await derivePasswordKey(password, fromBase64(vault.salt));
      const secret = await decryptBytes(key, vault.iv, vault.cipher);
      if (getPublicKey(secret) !== vault.pubkey) throw new Error('Senha incorreta ou backup inválido.');
      return secret;
    } catch (error) {
      if (error.message === 'Senha incorreta ou backup inválido.' || error.message === 'Backup Property inválido ou incompatível.') throw error;
      throw new Error('Senha incorreta ou backup inválido.');
    }
  }
  async function autoUnlock(vault, getPublicKey) {
    if (!vault?.session?.key) return null;
    try {
      const secret = await decryptBytes(vault.session.key, vault.session.iv, vault.session.cipher);
      return getPublicKey(secret) === vault.pubkey ? secret : null;
    } catch { return null; }
  }
  function exportBackup(vault) {
    const { id, version, pubkey, salt, iv, cipher, createdAt } = vault;
    return { format: 'property-encrypted-key-v1', id, version, pubkey, salt, iv, cipher, createdAt };
  }
  window.PropertyVault = Object.freeze({ ITERATIONS, toBase64, fromBase64, derivePasswordKey, encryptBytes, decryptBytes, makeSession, createVault, unlockVault, autoUnlock, exportBackup });
})();
