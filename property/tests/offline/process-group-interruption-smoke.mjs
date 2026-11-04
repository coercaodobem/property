#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installProcessGroupSignalCleanup, processGroupExists, registerProcessGroup } from './process-groups.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1] || '') : null;
const fixture = process.argv.includes('--fixture');

if (fixture) {
  const readyPath = path.resolve(process.argv[process.argv.indexOf('--ready') + 1]);
  const worker = spawn(process.execPath, ['-e', 'process.stdout.write("WORKER_READY\\n");setInterval(()=>{},1000)'], {
    detached: process.platform !== 'win32', stdio: 'ignore', windowsHide: true
  });
  registerProcessGroup(worker);
  installProcessGroupSignalCleanup({ forceAfterMs: 250 });
  process.once('SIGTERM', () => setTimeout(() => process.exit(143), 500).unref());
  await writeFile(readyPath, JSON.stringify({ parent_pid: process.pid, child_pid: worker.pid }) + '\n', { mode: 0o600 });
  setInterval(() => {}, 1000);
} else {
  assert.ok(output, '--output is required');
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const temp = await mkdtemp(path.join(os.tmpdir(), 'property-process-group-'));
  const readyPath = path.join(temp, 'ready.json');
  const parent = spawn(process.execPath, [SCRIPT, '--fixture', '--ready', readyPath], {
    detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true
  });
  let stderr = '';
  parent.stderr.setEncoding('utf8');
  parent.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1200); });
  let ready = null;
  for (let attempt = 0; attempt < 120 && !ready; attempt++) {
    try { ready = JSON.parse(await readFile(readyPath, 'utf8')); } catch {}
    if (!ready) await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (!ready) {
    try { process.kill(process.platform === 'win32' ? parent.pid : -parent.pid, 'SIGKILL'); } catch {}
    throw new Error(`Signal fixture failed to become ready: ${stderr}`);
  }
  try { parent.kill('SIGTERM'); } catch {}
  const closed = await Promise.race([
    new Promise(resolve => parent.once('close', (code, signal) => resolve({ code, signal }))),
    new Promise(resolve => setTimeout(() => resolve(null), 2500))
  ]);
  if (!closed) {
    try { process.kill(process.platform === 'win32' ? parent.pid : -parent.pid, 'SIGKILL'); } catch {}
  }
  let workerAlive = true;
  for (let attempt = 0; attempt < 80 && workerAlive; attempt++) {
    try { process.kill(process.platform === 'win32' ? ready.child_pid : -ready.child_pid, 0); }
    catch (error) { if (error?.code === 'ESRCH') workerAlive = false; }
    if (workerAlive) await new Promise(resolve => setTimeout(resolve, 25));
  }
  const report = { schema_version: 1, case: 'G00-04-process-group-cleanup', result: closed && !workerAlive ? 'PASS' : 'FAIL',
    fixture_ready: true, parent_exit_code: closed?.code ?? null, parent_signal: closed?.signal ?? null,
    detached_worker_group_stopped: !workerAlive, worker_pid: ready.child_pid,
    no_external_network: true, diagnostic: stderr || null };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  process.stdout.write(JSON.stringify(report) + '\n');
  assert.equal(report.result, 'PASS', 'detached child process group survived parent interruption');
}
