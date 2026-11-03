(() => {
  const FORMAT_HELP = 'Este campo não busca nomes de usuário. Cole um npub ou nprofile completo, ou informe uma chave pública hex de 64 caracteres.';

  function parsePublicKey(value, decodeNip19 = globalThis.NostrTools?.nip19?.decode) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new Error('Informe o contato público antes de abrir a conversa.');
    if (/^[0-9a-f]{64}$/i.test(text)) return { pubkey: text.toLowerCase(), relayHints: [] };
    if (/^nsec1/i.test(text)) {
      throw new Error('Essa entrada parece ser uma chave privada nsec. Não a compartilhe; peça à pessoa o npub ou nprofile público.');
    }
    if (!/^(?:npub|nprofile)1/i.test(text)) throw new Error(FORMAT_HELP);
    if (typeof decodeNip19 !== 'function') throw new Error('O decodificador local de contatos não está disponível. Recarregue o app.');

    let decoded;
    try {
      decoded = decodeNip19(text);
    } catch {
      const kind = /^nprofile1/i.test(text) ? 'nprofile' : 'npub';
      throw new Error(`Não foi possível validar este ${kind}. Confira se o contato está completo ou peça à pessoa que o compartilhe novamente.`);
    }

    if (decoded?.type === 'npub' && typeof decoded.data === 'string' && /^[0-9a-f]{64}$/i.test(decoded.data)) {
      return { pubkey: decoded.data.toLowerCase(), relayHints: [] };
    }
    if (decoded?.type === 'nprofile' && decoded.data && typeof decoded.data.pubkey === 'string' && /^[0-9a-f]{64}$/i.test(decoded.data.pubkey)) {
      if (decoded.data.relays !== undefined && !Array.isArray(decoded.data.relays)) throw new Error('Este nprofile contém uma lista de relays inválida. Peça à pessoa que compartilhe o contato novamente.');
      return { pubkey: decoded.data.pubkey.toLowerCase(), relayHints: decoded.data.relays || [] };
    }
    throw new Error(FORMAT_HELP);
  }

  globalThis.PropertyContact = Object.freeze({ parsePublicKey });
})();
