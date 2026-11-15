#!/usr/bin/env node
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const agentDir = process.argv[2];
if (!agentDir || !pathToFileURL(agentDir).href) throw new Error('installed-agent-directory-required');
const input = JSON.parse(await new Promise((resolve, reject) => {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; if (raw.length > 4096) reject(new Error('cycle-request-too-large')); });
  process.stdin.on('end', () => resolve(raw));
  process.stdin.on('error', reject);
}));
assert.equal(typeof input.password, 'string');
assert.match(input.expectedPubkey, /^[0-9a-f]{64}$/);
const listenArguments = [];
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function patchedListen(...args) {
  listenArguments.push(args[0]);
  return originalListen.apply(this, args);
};
const originalStderrWrite = process.stderr.write;
let capturedStderr = '';
process.stderr.write = function captureStderr(chunk, ...args) {
  capturedStderr = `${capturedStderr}${String(chunk)}`.slice(-4096);
  if (typeof args[0] === 'function') args[0]();
  return true;
};
let daemon;
try {
  const [{ runDaemon }, { callUnixJson }] = await Promise.all([
    import(pathToFileURL(`${agentDir}/daemon.mjs`)),
    import(pathToFileURL(`${agentDir}/ipc.mjs`)),
  ]);
  daemon = await runDaemon({ password: input.password, profile: 'default' });
  const status = await callUnixJson(daemon.paths.socketPath, 'status', {});
  const socketPath = daemon.paths.socketPath;
  assert.equal(status.unlocked, true);
  assert.equal(status.pubkey, input.expectedPubkey);
  assert.equal(listenArguments.length, 1);
  assert.equal(listenArguments[0], daemon.paths.socketPath, 'the only listener is the private Unix domain socket');
  await daemon.shutdown();
  daemon = null;
  await assert.rejects(readFile(socketPath), /ENOENT/);
  assert.equal(capturedStderr.includes(input.password), false);
  assert.equal(capturedStderr.includes(input.secretHex), false);
  process.stdout.write(JSON.stringify({ result: 'PASS', identity_matches: true, listener_count: listenArguments.length,
    listener_transport: 'unix', secret_not_logged: true }) + '\n');
} finally {
  if (daemon) await daemon.shutdown().catch(() => {});
  net.Server.prototype.listen = originalListen;
  process.stderr.write = originalStderrWrite;
}
