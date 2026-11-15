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
    if (vault?.format !== undefined && !['property-encrypted-key-v1', 'property-encrypted-key-v2', 'liberdade-encrypted-key-v1'].includes(vault.format)) throw new Error('Backup Property inválido ou incompatível.');
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
  function validateRelay(value) {
    if (typeof value !== 'string' || value.length > 500) throw new Error('Backup local contém um relay inválido.');
    let url;
    try { url = new URL(value.trim()); } catch { throw new Error('Backup local contém um relay inválido.'); }
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase());
    if ((url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) || url.username || url.password || url.hash) {
      throw new Error('Backup local contém um relay inseguro ou inválido.');
    }
    return url.toString().replace(/\/$/, '');
  }
  function validatePortableState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema_version !== 1) throw new Error('Dados locais do backup incompatíveis.');
    if (Object.keys(value).some(key => !['schema_version', 'relay_preferences', 'contacts'].includes(key))) throw new Error('Dados locais do backup contêm campos não reconhecidos.');
    const preferences = value.relay_preferences;
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences) ||
      Object.keys(preferences).some(key => !['values', 'auto_selected'].includes(key)) || !Array.isArray(preferences.values) ||
      preferences.values.length > 12 || typeof preferences.auto_selected !== 'boolean') throw new Error('Preferências de relay do backup inválidas.');
    const relays = [...new Set(preferences.values.map(validateRelay))];
    if (relays.length !== preferences.values.length) throw new Error('Backup local contém relays duplicados.');
    if (!Array.isArray(value.contacts) || value.contacts.length > 500) throw new Error('Contatos locais do backup inválidos.');
    const seen = new Set();
    const contacts = value.contacts.map(contact => {
      if (!contact || typeof contact !== 'object' || Array.isArray(contact) ||
        Object.keys(contact).some(key => !['pubkey', 'title', 'relayHints'].includes(key)) ||
        !/^[0-9a-f]{64}$/.test(contact.pubkey || '') || typeof contact.title !== 'string' || contact.title.length > 80 ||
        !Array.isArray(contact.relayHints) || contact.relayHints.length > 3) throw new Error('Um contato local do backup é inválido.');
      if (seen.has(contact.pubkey)) throw new Error('Backup local contém contatos duplicados.');
      seen.add(contact.pubkey);
      return { pubkey: contact.pubkey, title: contact.title, relayHints: [...new Set(contact.relayHints.map(validateRelay))] };
    });
    const normalized = { schema_version: 1, relay_preferences: { values: relays, auto_selected: preferences.auto_selected }, contacts };
    if (new TextEncoder().encode(JSON.stringify(normalized)).length > 128 * 1024) throw new Error('Dados locais do backup excedem 128 KiB.');
    return normalized;
  }
  async function createPortableBackup(vault, password, localState, getPublicKey) {
    const verification = await unlockVault(vault, password, getPublicKey);
    verification.fill(0);
    const normalized = validatePortableState(localState);
    const key = await derivePasswordKey(password, fromBase64(vault.salt));
    const encrypted = await encryptBytes(key, new TextEncoder().encode(JSON.stringify(normalized)));
    const backup = exportBackup(vault);
    backup.format = 'property-encrypted-key-v2';
    backup.local_state = encrypted;
    return backup;
  }
  async function openPortableBackup(backup, password, getPublicKey) {
    const secret = await unlockVault(backup, password, getPublicKey);
    if (backup.format !== 'property-encrypted-key-v2') return { secret, localState: null };
    try {
      if (!backup.local_state || typeof backup.local_state.iv !== 'string' || typeof backup.local_state.cipher !== 'string') throw new Error('Dados locais do backup ausentes.');
      const key = await derivePasswordKey(password, fromBase64(backup.salt));
      const plaintext = await decryptBytes(key, backup.local_state.iv, backup.local_state.cipher);
      let parsed;
      try { parsed = JSON.parse(new TextDecoder().decode(plaintext)); }
      finally { plaintext.fill(0); }
      return { secret, localState: validatePortableState(parsed) };
    } catch (error) {
      secret.fill(0);
      throw new Error(error?.message === 'Dados locais do backup ausentes.' ? error.message : 'Dados locais do backup inválidos ou adulterados.');
    }
  }
  window.PropertyVault = Object.freeze({ ITERATIONS, toBase64, fromBase64, derivePasswordKey, encryptBytes, decryptBytes,
    makeSession, createVault, unlockVault, autoUnlock, exportBackup, validatePortableState, createPortableBackup, openPortableBackup });
})();
