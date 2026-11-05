'use strict';
(() => {
  const MAX_FOLDERS = 24;
  const MAX_NAME_LENGTH = 40;
  const CONVERSATION_ID = /^(?:[0-9a-f]{64}|group:(?:[0-9a-f]{64}:){2,9}[0-9a-f]{64})$/i;
  const FOLDER_ID = /^[a-zA-Z0-9_-]{1,80}$/;

  function normalizeName(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  }
  function nameKey(value) { return normalizeName(value).normalize('NFKC').toLocaleLowerCase('en-US'); }
  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const folders = [];
    const ids = new Set();
    const names = new Set();
    for (const candidate of Array.isArray(source.folders) ? source.folders : []) {
      if (!candidate || typeof candidate !== 'object' || typeof candidate.id !== 'string' || !FOLDER_ID.test(candidate.id) || ids.has(candidate.id)) continue;
      const name = normalizeName(candidate.name);
      const key = nameKey(name);
      if (!name || name.length > MAX_NAME_LENGTH || names.has(key)) continue;
      ids.add(candidate.id);
      names.add(key);
      folders.push({ id: candidate.id, name, collapsed: candidate.collapsed === true });
      if (folders.length >= MAX_FOLDERS) break;
    }
    const assignments = {};
    if (source.assignments && typeof source.assignments === 'object' && !Array.isArray(source.assignments)) {
      for (const [conversationId, folderId] of Object.entries(source.assignments).slice(0, 1000)) {
        if (CONVERSATION_ID.test(conversationId) && typeof folderId === 'string' && ids.has(folderId)) assignments[conversationId] = folderId;
      }
    }
    return { version: 1, folders, assignments };
  }
  function validateName(raw, config, currentId = '') {
    const name = normalizeName(raw);
    if (!name) throw new Error('folder-name-required');
    if (name.length > MAX_NAME_LENGTH) throw new Error('folder-name-too-long');
    if (config.folders.some(folder => folder.id !== currentId && nameKey(folder.name) === nameKey(name))) throw new Error('folder-name-duplicate');
    return name;
  }
  function create(raw, rawName, id) {
    const config = normalize(raw);
    if (config.folders.length >= MAX_FOLDERS) throw new Error('folder-limit-reached');
    if (typeof id !== 'string' || !FOLDER_ID.test(id) || config.folders.some(folder => folder.id === id)) throw new Error('folder-id-invalid');
    const name = validateName(rawName, config);
    return normalize({ ...config, folders: [...config.folders, { id, name, collapsed: false }] });
  }
  function rename(raw, id, rawName) {
    const config = normalize(raw);
    const folder = config.folders.find(item => item.id === id);
    if (!folder) throw new Error('folder-not-found');
    const name = validateName(rawName, config, id);
    return normalize({ ...config, folders: config.folders.map(item => item.id === id ? { ...item, name } : item) });
  }
  function setCollapsed(raw, id, collapsed) {
    const config = normalize(raw);
    if (!config.folders.some(folder => folder.id === id)) throw new Error('folder-not-found');
    return normalize({ ...config, folders: config.folders.map(folder => folder.id === id ? { ...folder, collapsed: collapsed === true } : folder) });
  }
  function move(raw, conversationId, folderId = '') {
    const config = normalize(raw);
    if (typeof conversationId !== 'string' || !CONVERSATION_ID.test(conversationId)) throw new Error('conversation-id-invalid');
    if (folderId && !config.folders.some(folder => folder.id === folderId)) throw new Error('folder-not-found');
    const assignments = { ...config.assignments };
    if (folderId) assignments[conversationId] = folderId;
    else delete assignments[conversationId];
    return normalize({ ...config, assignments });
  }
  function remove(raw, id) {
    const config = normalize(raw);
    if (!config.folders.some(folder => folder.id === id)) throw new Error('folder-not-found');
    return normalize({ ...config, folders: config.folders.filter(folder => folder.id !== id) });
  }
  function reorder(raw, id, direction) {
    const config = normalize(raw);
    const index = config.folders.findIndex(folder => folder.id === id);
    if (index < 0) throw new Error('folder-not-found');
    const target = index + Math.sign(direction);
    if (target < 0 || target >= config.folders.length || target === index) return config;
    const folders = [...config.folders];
    [folders[index], folders[target]] = [folders[target], folders[index]];
    return normalize({ ...config, folders });
  }
  function sections(conversations, raw, query = '') {
    const config = normalize(raw);
    const rows = Array.isArray(conversations) ? conversations : [];
    if (String(query).trim()) return rows.length ? [{ id: 'search-results', name: '', isFolder: false, isOther: false, collapsed: false, conversations: rows }] : [];
    if (!config.folders.length) return rows.length ? [{ id: 'all-conversations', name: '', isFolder: false, isOther: false, collapsed: false, conversations: rows }] : [];
    const result = config.folders.map(folder => ({
      id: folder.id, name: folder.name, isFolder: true, isOther: false, collapsed: folder.collapsed,
      conversations: rows.filter(conversation => config.assignments[conversation.pubkey] === folder.id)
    }));
    const other = rows.filter(conversation => !config.assignments[conversation.pubkey]);
    if (other.length) result.push({ id: 'other-conversations', name: '', isFolder: false, isOther: true, collapsed: false, conversations: other });
    return result;
  }
  window.PropertyConversationFolders = Object.freeze({ MAX_FOLDERS, MAX_NAME_LENGTH, normalize, create, rename, setCollapsed, move, remove, reorder, sections });
})();
