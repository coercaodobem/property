import { open, readFile, rename, mkdir, chmod, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { profileName, createEmptyConfig, validateConfig } from './core.mjs';

export function resolvePaths(profile = 'default', env = process.env, home = os.homedir()) {
  const selectedProfile = profileName(profile);
  const dataRoot = path.resolve(env.XDG_DATA_HOME || path.join(home, '.local', 'share'));
  const runtimeRoot = path.resolve(env.XDG_RUNTIME_DIR || `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 'unknown'}`);
  const dataDir = path.join(dataRoot, 'property', 'agents', selectedProfile);
  const runtimeDir = path.join(runtimeRoot, 'property-agent');
  const socketPath = path.join(runtimeDir, `${selectedProfile}.sock`);
  if (Buffer.byteLength(socketPath) > 100) throw new Error('O caminho do socket local é longo demais; configure XDG_RUNTIME_DIR curto.');
  return { profile: selectedProfile, dataDir, vaultPath: path.join(dataDir, 'agent.vault.json'), configPath: path.join(dataDir, 'agent.json'), runtimeDir, socketPath };
}

export async function ensurePrivateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('Diretório de dados não pertence ao usuário atual.');
  await chmod(directory, 0o700);
  const mode = (await lstat(directory)).mode & 0o777;
  if (mode !== 0o700) throw new Error('Não foi possível restringir as permissões do diretório local.');
}

export async function writePrivateJson(file, value) {
  await ensurePrivateDirectory(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temp, file);
  await chmod(file, 0o600);
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function loadOrCreateConfig(file, pubkey) {
  try {
    const config = validateConfig(await readJson(file));
    if (config.pubkey !== pubkey) throw new Error('A identidade da configuração não corresponde ao cofre.');
    return config;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const config = createEmptyConfig(pubkey);
    await writePrivateJson(file, config);
    return config;
  }
}

export async function replaceContact(file, pubkey, contact) {
  const config = validateConfig(await readJson(file));
  if (config.pubkey !== pubkey) throw new Error('A identidade da configuração não corresponde ao cofre.');
  const next = config.contacts.filter(item => item.pubkey !== contact.pubkey);
  if (contact.status !== 'revoked') next.push(contact);
  if (next.length > 100) throw new Error('O limite de contatos aprovados foi atingido.');
  await writePrivateJson(file, { ...config, contacts: next });
}

export async function setInboxRelays(file, pubkey, relays) {
  const config = validateConfig(await readJson(file));
  if (config.pubkey !== pubkey) throw new Error('A identidade da configuração não corresponde ao cofre.');
  await writePrivateJson(file, { ...config, inbox_relays: relays });
}

export async function decideApproval(file, pubkey, requestId, decision) {
  const config = validateConfig(await readJson(file));
  if (config.pubkey !== pubkey) throw new Error('A identidade da configuração não corresponde ao cofre.');
  const index = config.pending_approvals.findIndex(item => item.id === requestId && item.status === 'pending');
  if (index < 0) throw new Error('approval-request-not-found');
  const request = config.pending_approvals[index];
  if (decision === 'approve') {
    const contact = config.contacts.find(item => item.pubkey === request.conversation_pubkey && item.status === 'approved');
    if (!contact) throw new Error('Aprove primeiro o contato e seus relays com `property-agent contact grant`.');
    contact[request.permission] = true;
    config.pending_approvals[index] = { ...request, status: 'approved' };
  } else config.pending_approvals[index] = { ...request, status: 'denied' };
  await writePrivateJson(file, config);
  return config.pending_approvals[index];
}
