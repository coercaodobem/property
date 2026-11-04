import { setTimeout as delay } from 'node:timers/promises';

const tracked = new Map();
const signalCleanupInstalled = new WeakSet();

function send(child, signal) {
  if (!child?.pid) return false;
  try {
    process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return false;
  }
}

export function processGroupExists(child) {
  if (!child?.pid) return false;
  try {
    process.kill(process.platform === 'win32' ? child.pid : -child.pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

export function registerProcessGroup(child) {
  if (!child?.pid) throw new Error('A child process with a pid is required.');
  tracked.set(child.pid, child);
  return child;
}

export async function stopProcessGroup(child, { graceMs = 1500, verifyMs = 1000 } = {}) {
  if (!child?.pid) return { stopped: true, pid: null };
  const registered = tracked.get(child.pid);
  if (!registered) return { stopped: !processGroupExists(child), pid: child.pid, tracked: false };
  send(child, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (processGroupExists(child) && Date.now() < deadline) await delay(50);
  if (processGroupExists(child)) send(child, 'SIGKILL');
  const verifyDeadline = Date.now() + verifyMs;
  while (processGroupExists(child) && Date.now() < verifyDeadline) await delay(25);
  const stopped = !processGroupExists(child);
  tracked.delete(child.pid);
  return { stopped, pid: child.pid, tracked: true };
}

export function installProcessGroupSignalCleanup({ forceAfterMs = 1000 } = {}) {
  if (signalCleanupInstalled.has(process)) return;
  signalCleanupInstalled.add(process);
  let received = false;
  const handle = signal => {
    if (received) return;
    received = true;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    const children = [...tracked.values()];
    for (const child of children) send(child, 'SIGTERM');
    const force = setTimeout(() => {
      for (const child of children) if (processGroupExists(child)) send(child, 'SIGKILL');
    }, forceAfterMs);
    force.unref();
  };
  process.on('SIGINT', handle);
  process.on('SIGTERM', handle);
}
