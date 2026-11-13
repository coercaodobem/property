import { open, readFile, rename, mkdir, chmod, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseStrictJson } from './ipc.mjs';
import { profileName, createEmptyConfig, validateConfig } from './core.mjs';

const MAX_STORE_BYTES = 256 * 1024;
const MAX_ENCRYPTED_JOURNAL_BYTES = 512 * 1024;

export function resolvePaths(profile = 'default', env = process.env, home = os.homedir()) {
  const selectedProfile = profileName(profile);
  const dataRoot = path.resolve(env.XDG_DATA_HOME || path.join(home, '.local', 'share'));
  const runtimeRoot = path.resolve(env.XDG_RUNTIME_DIR || `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 'unknown'}`);
  const dataDir = path.join(dataRoot, 'property', 'agents', selectedProfile);
  const runtimeDir = path.join(runtimeRoot, 'property-agent');
  const socketPath = path.join(runtimeDir, `${selectedProfile}.sock`);
  if (Buffer.byteLength(socketPath) > 100) throw new Error('O caminho do socket local é longo demais; configure XDG_RUNTIME_DIR curto.');
  return { profile: selectedProfile, dataDir, vaultPath: path.join(dataDir, 'agent.vault.json'), configPath: path.join(dataDir, 'agent.json'),
    xnoVaultPath: path.join(dataDir, 'xno-wallet.vault.json'), xnoJournalPath: path.join(dataDir, 'xno-trades.json'), runtimeDir, socketPath };
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

export async function readJson(file, { maxBytes = MAX_STORE_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ENCRYPTED_JOURNAL_BYTES) throw new Error('Limite de leitura local inválido.');
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('Arquivo local não é regular ou não pertence ao usuário atual.');
  if ((info.mode & 0o777) !== 0o600) throw new Error('Arquivo local precisa ter permissão 0600.');
  if (info.size > maxBytes) throw new Error('Arquivo local excede o limite de tamanho.');
  return parseStrictJson(await readFile(file, 'utf8'), maxBytes);
}

export async function loadOrCreateConfig(file, pubkey) {
  try {
    const stored = await readJson(file);
    const config = validateConfig(stored);
    if (config.pubkey !== pubkey) throw new Error('A identidade da configuração não corresponde ao cofre.');
    if (stored.schema !== config.schema || stored.version !== config.version) await writePrivateJson(file, config);
    return config;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const config = createEmptyConfig(pubkey);
    await writePrivateJson(file, config);
    return config;
  }
}
