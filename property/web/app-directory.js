'use strict';
(() => {
  const validPubkey = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

  function directHumanConversations(conversations, ownPubkey, agentAccessRecords) {
    if (!validPubkey(ownPubkey) || !Array.isArray(conversations) || !Array.isArray(agentAccessRecords)) return [];
    const agentKeys = new Set(agentAccessRecords
      .filter(record => record && (record.status === 'approved' || record.status === 'blocked'))
      .map(record => record.pubkey)
      .filter(validPubkey));
    const seen = new Set();
    return conversations.filter(conversation => {
      if (!conversation || typeof conversation !== 'object' || Array.isArray(conversation)) return false;
      const pubkey = conversation.pubkey;
      if (!validPubkey(pubkey) || pubkey === ownPubkey || conversation.group === true || conversation.agent === true || agentKeys.has(pubkey) || seen.has(pubkey)) return false;
      seen.add(pubkey);
      return true;
    });
  }

  window.PropertyAppDirectory = Object.freeze({ directHumanConversations });
})();
