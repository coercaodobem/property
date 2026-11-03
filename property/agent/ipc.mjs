import { createServer, connect } from 'node:net';
import { randomUUID } from 'node:crypto';
import { lstat, chmod, mkdir, unlink } from 'node:fs/promises';
import { MAX_IPC_BYTES, exactObject } from './core.mjs';

export function parseStrictJson(raw, maxBytes = MAX_IPC_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error('ipc-frame-too-large');
  let index = 0;
  const ws = () => { while (/[\u0009\u000a\u000d\u0020]/.test(raw[index] || '')) index++; };
  function string() {
    const start = index++;
    while (index < raw.length) {
      if (raw[index] === '\\') { index += 2; continue; }
      if (raw[index++] === '"') return JSON.parse(raw.slice(start, index));
    }
    throw new Error('ipc-invalid-json');
  }
  function value(depth = 0) {
    ws();
    if (depth > 12) throw new Error('ipc-json-too-deep');
    if (raw[index] === '"') { string(); return; }
    if (raw[index] === '{') {
      index++; ws(); const keys = new Set(); if (raw[index] === '}') { index++; return; }
      while (index < raw.length) {
        ws(); if (raw[index] !== '"') throw new Error('ipc-invalid-json');
        const key = string(); if (keys.has(key)) throw new Error('ipc-duplicate-key'); keys.add(key);
        ws(); if (raw[index++] !== ':') throw new Error('ipc-invalid-json');
        value(depth + 1); ws(); if (raw[index] === '}') { index++; return; }
        if (raw[index++] !== ',') throw new Error('ipc-invalid-json');
      }
      throw new Error('ipc-invalid-json');
    }
    if (raw[index] === '[') {
      index++; ws(); if (raw[index] === ']') { index++; return; }
      let count = 0;
      while (index < raw.length) {
        value(depth + 1); if (++count > 1000) throw new Error('ipc-array-too-large');
        ws(); if (raw[index] === ']') { index++; return; }
        if (raw[index++] !== ',') throw new Error('ipc-invalid-json');
      }
      throw new Error('ipc-invalid-json');
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(raw.slice(index));
    if (!match) throw new Error('ipc-invalid-json');
    index += match[0].length;
  }
  value(); ws(); if (index !== raw.length) throw new Error('ipc-invalid-json');
  return JSON.parse(raw);
}

export async function startUnixJsonServer(socketPath, dispatch) {
  const parent = socketPath.slice(0, socketPath.lastIndexOf('/'));
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  try {
    const info = await lstat(socketPath);
    if (!info.isSocket() || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('O caminho MCP local já existe e não é um socket Property seguro.');
    await new Promise((resolve, reject) => {
      const probe = connect(socketPath);
      probe.once('connect', () => { probe.destroy(); reject(new Error('Já existe um daemon Property Agent ativo para este perfil.')); });
      probe.once('error', resolve);
    });
    await unlink(socketPath);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const server = createServer(socket => {
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (Buffer.byteLength(buffer, 'utf8') > MAX_IPC_BYTES) { socket.destroy(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        void (async () => {
          let request;
          try {
            request = parseStrictJson(line);
            if (!exactObject(request, ['id', 'method', 'params']) || typeof request.id !== 'string' || !/^[0-9a-f-]{36}$/.test(request.id) || typeof request.method !== 'string' || request.method.length > 64 || !request.params || typeof request.params !== 'object' || Array.isArray(request.params)) throw new Error('invalid-ipc-request');
            const result = await dispatch(request.method, request.params);
            socket.write(`${JSON.stringify({ id: request.id, ok: true, result })}\n`);
          } catch (error) {
            const message = typeof error?.message === 'string' && /^[a-z0-9-]{1,80}$/.test(error.message) ? error.message : 'request-failed';
            socket.write(`${JSON.stringify({ id: request?.id || '', ok: false, error: message })}\n`);
          }
        })();
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  await chmod(socketPath, 0o600);
  return async () => {
    await new Promise(resolve => server.close(resolve));
    try { await unlink(socketPath); } catch {}
  };
}

export async function callUnixJson(socketPath, method, params, timeoutMs = 5000) {
  const id = randomUUID();
  const request = JSON.stringify({ id, method, params });
  if (Buffer.byteLength(request, 'utf8') > MAX_IPC_BYTES) throw new Error('invalid-arguments');
  return await new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buffer = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('agent-daemon-unavailable')); }, timeoutMs);
    const fail = error => { clearTimeout(timer); socket.destroy(); reject(error); };
    socket.once('error', () => fail(new Error('agent-daemon-unavailable')));
    socket.on('connect', () => socket.write(`${request}\n`));
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (Buffer.byteLength(buffer, 'utf8') > MAX_IPC_BYTES) return fail(new Error('invalid-daemon-response'));
      const newline = buffer.indexOf('\n'); if (newline < 0) return;
      try {
        const response = parseStrictJson(buffer.slice(0, newline));
        if (!exactObject(response, ['id', 'ok', ...(response.ok ? ['result'] : ['error'])]) || response.id !== id || typeof response.ok !== 'boolean') throw new Error('invalid-daemon-response');
        clearTimeout(timer); socket.end();
        if (response.ok) resolve(response.result);
        else reject(new Error(typeof response.error === 'string' ? response.error : 'agent-request-failed'));
      } catch (error) { fail(error); }
    });
  });
}
