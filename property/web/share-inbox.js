'use strict';
(() => {
  const DB_NAME = 'property-share-inbox-v1';
  const STORE_NAME = 'shares';
  const MAX_PENDING = 10;
  const MAX_FILE_COUNT = 5;
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_BATCH_BYTES = 4 * 1024 * 1024;
  const MAX_PENDING_BYTES = 8 * 1024 * 1024;
  const MAX_REQUEST_BYTES = MAX_BATCH_BYTES + 64 * 1024;
  const MAX_MESSAGE_BYTES = 8 * 1024;
  const MAX_MESSAGE_CHARS = 4000;

  function cleanField(value, maxLength) {
    if (typeof value !== 'string') return { value: '', truncated: false };
    const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    let result = cleaned.slice(0, maxLength);
    if (/[\uD800-\uDBFF]$/.test(result)) result = result.slice(0, -1);
    return { value: result, truncated: result.length < cleaned.length };
  }

  function cleanFileName(value) {
    const leaf = String(value || '').split(/[\\/]/).pop() || 'shared-file';
    const cleaned = Array.from(leaf.replace(/[\u0000-\u001F\u007F]/g, '').trim()).slice(0, 120).join('');
    return cleaned || 'shared-file';
  }

  function normalizeFiles(input) {
    const source = Array.isArray(input.files) ? input.files : [];
    const files = [];
    const warnings = [];
    let totalBytes = 0;
    const warn = value => {
      if (warnings.length < 8) warnings.push(cleanFileName(value));
      else if (warnings.length === 8) warnings.push('…');
    };
    for (const file of source) {
      const name = cleanFileName(file?.name);
      if (!file || typeof file.arrayBuffer !== 'function' || !Number.isSafeInteger(file.size) || file.size <= 0) {
        warn(name);
        continue;
      }
      if (files.length >= MAX_FILE_COUNT || file.size > MAX_FILE_BYTES || totalBytes + file.size > MAX_BATCH_BYTES) {
        warn(name);
        continue;
      }
      files.push(file);
      totalBytes += file.size;
    }
    return { files, warnings };
  }

  function normalize(input = {}) {
    if (input.tooLarge === true) return { title: '', text: '', url: '', tooLarge: true, truncated: false };
    const title = cleanField(input.title, 240);
    const text = cleanField(input.text, 12000);
    const url = cleanField(input.url, 2048);
    const sharedFiles = normalizeFiles(input);
    const result = {
      title: title.value,
      text: text.value,
      url: url.value,
      tooLarge: false,
      truncated: title.truncated || text.truncated || url.truncated
    };
    if (sharedFiles.files.length) result.files = sharedFiles.files;
    if (sharedFiles.warnings.length) result.fileWarnings = sharedFiles.warnings;
    result.truncated ||= composeText(result).trim() !== formatText(result);
    return result;
  }

  function fromFormData(formData) {
    const field = name => {
      const value = formData?.get?.(name);
      return typeof value === 'string' ? value : '';
    };
    const files = formData?.getAll?.('files');
    return normalize({ title: field('title'), text: field('text'), url: field('url'), files: Array.isArray(files) ? files : [] });
  }

  function byteLength(value) { return new TextEncoder().encode(String(value)).length; }

  function composeText(item) {
    const text = String(item.text || '').trim();
    const url = String(item.url || '').trim();
    const title = String(item.title || '').trim();
    const parts = [title && !text.includes(title) ? title : '', text, url && !text.includes(url) ? url : ''].filter(Boolean);
    return parts.join('\n');
  }

  function formatText(item) {
    if (!item || item.tooLarge) return '';
    const source = composeText(item);
    let result = '';
    let bytes = 0;
    let chars = 0;
    for (const char of source) {
      const nextBytes = byteLength(char);
      if (chars + char.length > MAX_MESSAGE_CHARS || bytes + nextBytes > MAX_MESSAGE_BYTES) break;
      result += char;
      chars += char.length;
      bytes += nextBytes;
    }
    return result.trim();
  }

  function createIndexedDbStorage(indexedDb = globalThis.indexedDB) {
    let opening;
    function open() {
      if (!indexedDb) return Promise.reject(new Error('IndexedDB is unavailable.'));
      if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDb.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          }
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error || new Error('Could not open the local share inbox.'));
        request.onblocked = () => reject(new Error('The local share inbox is blocked by another tab.'));
      }).catch(error => { opening = null; throw error; });
      return opening;
    }
    function all() {
      return open().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('Could not read the local share inbox.'));
        transaction.onabort = () => reject(transaction.error || new Error('Could not read the local share inbox.'));
      }));
    }
    function enqueue(record, limit, byteLimit) {
      return open().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        let result = { accepted: false, item: null };
        const request = store.getAll();
        request.onsuccess = () => {
          const pending = request.result || [];
          const pendingBytes = pending.reduce((total, item) => total + (item.files || []).reduce((sum, file) => sum + (Number.isSafeInteger(file?.size) ? file.size : 0), 0), 0);
          const itemBytes = (record.files || []).reduce((total, file) => total + (Number.isSafeInteger(file?.size) ? file.size : 0), 0);
          if (pending.length >= limit || pendingBytes + itemBytes > byteLimit) return;
          const add = store.add(record);
          add.onsuccess = () => { result = { accepted: true, item: { ...record, id: add.result } }; };
          add.onerror = () => reject(add.error || new Error('Could not queue this shared item.'));
        };
        request.onerror = () => reject(request.error || new Error('Could not queue this shared item.'));
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error('Could not queue this shared item.'));
        transaction.onabort = () => reject(transaction.error || new Error('Could not queue this shared item.'));
      }));
    }
    function remove(id) {
      return open().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Could not remove the shared item.'));
        transaction.onabort = () => reject(transaction.error || new Error('Could not remove the shared item.'));
      }));
    }
    return { all, enqueue, remove };
  }

  function create(storage) {
    return Object.freeze({
      async enqueue(input) {
        const item = normalize(input);
        if (!item.tooLarge && !item.title && !item.text && !item.url && !item.files?.length && !item.fileWarnings?.length) return { accepted: false, item: null, empty: true };
        return storage.enqueue(item, MAX_PENDING, MAX_PENDING_BYTES);
      },
      list: () => storage.all(),
      remove: id => storage.remove(id)
    });
  }

  const api = create(createIndexedDbStorage());
  globalThis.PropertyShareInbox = Object.freeze({
    ...api,
    create,
    normalize,
    fromFormData,
    formatText,
    byteLength,
    MAX_PENDING,
    MAX_FILE_COUNT,
    MAX_FILE_BYTES,
    MAX_BATCH_BYTES,
    MAX_PENDING_BYTES,
    MAX_REQUEST_BYTES,
    MAX_MESSAGE_BYTES,
    MAX_MESSAGE_CHARS
  });
})();
