(() => {
  const localized = (en, pt) => globalThis.PropertyI18n?.language === 'pt-BR' ? pt : en;
  const formatHelp = () => localized(
    'Use a public npub, nprofile, Property contact link, or 64-character hex key. For a NIP-05 name@domain, tap Resolve NIP-05 first; a name alone is not unique.',
    'Use um npub público, nprofile, link de contato do Property ou chave hex de 64 caracteres. Para NIP-05 name@domínio, toque em Resolver NIP-05; um nome sozinho não é único.'
  );

  function unwrapContact(value) {
    let text = typeof value === 'string' ? value.trim() : '';
    if (/^nostr:/i.test(text)) text = text.slice(6).trim();
    if (/^https?:\/\//i.test(text)) {
      try {
        const url = new URL(text);
        const contact = url.searchParams.get('contact') || new URLSearchParams(url.hash.replace(/^#/, '')).get('contact');
        if (contact) return contact.trim();
      } catch {}
    }
    if (text.startsWith('#')) {
      const contact = new URLSearchParams(text.slice(1)).get('contact');
      if (contact) return contact.trim();
    }
    return text;
  }

  function createShare({ pubkey, relayUrls, nprofileEncode, npubEncode, baseUrl }) {
    if (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(pubkey)) throw new TypeError(localized('Invalid public identity.', 'Identidade pública inválida.'));
    if (typeof nprofileEncode !== 'function' || typeof npubEncode !== 'function') throw new TypeError(localized('Local Nostr encoding is unavailable.', 'A codificação Nostr local não está disponível.'));
    const relayHints = [];
    for (const raw of Array.isArray(relayUrls) ? relayUrls : []) {
      if (typeof raw !== 'string') continue;
      try {
        const relay = new URL(raw);
        if (relay.protocol !== 'wss:' || !relay.hostname || relay.username || relay.password || relay.search || relay.hash || relay.href.length > 255) continue;
        if (!relayHints.includes(relay.href)) relayHints.push(relay.href);
      } catch {}
      if (relayHints.length === 3) break;
    }
    const normalizedPubkey = pubkey.toLowerCase();
    const nprofile = nprofileEncode({ pubkey: normalizedPubkey, relays: relayHints });
    const url = new URL('./', baseUrl);
    if (!['https:', 'http:'].includes(url.protocol)) throw new TypeError(localized('Property contact links require an HTTP(S) page.', 'Links de contato Property exigem uma página HTTP(S).'));
    url.search = '';
    url.hash = new URLSearchParams({ contact: nprofile }).toString();
    return { npub: npubEncode(normalizedPubkey), nprofile, relayHints, url: url.href };
  }

  function parsePublicKey(value, decodeNip19 = globalThis.NostrTools?.nip19?.decode) {
    const text = unwrapContact(value);
    if (!text) throw new Error(globalThis.PropertyI18n?.language === 'pt-BR' ? 'Informe o contato público antes de abrir a conversa.' : 'Enter a public contact before opening a conversation.');
    if (/^[0-9a-f]{64}$/i.test(text)) return { pubkey: text.toLowerCase(), relayHints: [] };
    if (/^nsec1/i.test(text)) {
      throw new Error(globalThis.PropertyI18n?.language === 'pt-BR'
        ? 'Essa entrada parece ser uma chave privada nsec. Não a compartilhe; peça à pessoa o npub ou nprofile público.'
        : 'This looks like a private nsec key. Do not share it; ask for the person’s public npub or nprofile.');
    }
    if (!/^(?:npub|nprofile)1/i.test(text)) throw new Error(formatHelp());
    if (typeof decodeNip19 !== 'function') throw new Error(globalThis.PropertyI18n?.language === 'pt-BR'
      ? 'O decodificador local de contatos não está disponível. Recarregue o app.'
      : 'The local contact decoder is unavailable. Reload the app.');

    let decoded;
    try {
      decoded = decodeNip19(text);
    } catch {
      const kind = /^nprofile1/i.test(text) ? 'nprofile' : 'npub';
      throw new Error(globalThis.PropertyI18n?.language === 'pt-BR'
        ? `Não foi possível validar este ${kind}. Confira se o contato está completo ou peça à pessoa que o compartilhe novamente.`
        : `This ${kind} could not be validated. Check that it is complete or ask the person to share it again.`);
    }

    if (decoded?.type === 'npub' && typeof decoded.data === 'string' && /^[0-9a-f]{64}$/i.test(decoded.data)) {
      return { pubkey: decoded.data.toLowerCase(), relayHints: [] };
    }
    if (decoded?.type === 'nprofile' && decoded.data && typeof decoded.data.pubkey === 'string' && /^[0-9a-f]{64}$/i.test(decoded.data.pubkey)) {
      if (decoded.data.relays !== undefined && !Array.isArray(decoded.data.relays)) throw new Error(localized(
        'This nprofile has an invalid relay list. Ask the person to share their contact again.',
        'Este nprofile contém uma lista de relays inválida. Peça à pessoa que compartilhe o contato novamente.'
      ));
      return { pubkey: decoded.data.pubkey.toLowerCase(), relayHints: decoded.data.relays || [] };
    }
    throw new Error(formatHelp());
  }

  globalThis.PropertyContact = Object.freeze({ parsePublicKey, createShare, unwrapContact });
})();
