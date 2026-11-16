#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : '';
const patterns = [
  ['aws_access_id', /\bAKIA[0-9A-Z]{16}\b/g],
  ['github_token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g],
  ['nostr_nsec', /\bnsec1[023456789acdefghjklmnpqrstuvwxyz]{58}\b/gi],
  ['private_key_pem', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g]
];

async function collectFiles(relativeRoot) {
  const root = path.join(ROOT, relativeRoot), files = [];
  async function visit(directory, relative = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
      const absolutePath = path.join(directory, entry.name);
      const info = await lstat(absolutePath);
      if (info.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else if (info.isFile()) files.push({ relativePath: `${relativeRoot}/${relativePath}`, absolutePath });
    }
  }
  await visit(root);
  return files;
}

const candidateCommit = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.match(candidateCommit, /^[0-9a-f]{40}$/);
const files = (await Promise.all(['property/web', 'property/agent', 'property/relay'].map(collectFiles))).flat();
let scanned = 0, skippedBinaryOrInvalidUtf8 = 0;
const matches = [];
for (const file of files) {
  const bytes = await readFile(file.absolutePath);
  if (bytes.includes(0)) { skippedBinaryOrInvalidUtf8++; continue; }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { skippedBinaryOrInvalidUtf8++; continue; }
  scanned++;
  for (const [rule, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) matches.push({ path: file.relativePath, rule });
  }
}
const report = {
  schema_version: 1,
  gate: 'G9',
  result: matches.length === 0 ? 'PASS_LIMITED_PATTERNS' : 'FAIL',
  candidate_commit: candidateCommit,
  roots: ['property/web', 'property/agent', 'property/relay'],
  text_files_scanned: scanned,
  binary_or_invalid_utf8_files_skipped: skippedBinaryOrInvalidUtf8,
  patterns: patterns.map(([rule]) => rule),
  matches,
  limitations: 'Four high-confidence credential/key patterns only; this is not a comprehensive secret scan, binary scan, or human audit.'
};
if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
process.stdout.write(`${JSON.stringify(report)}\n`);
assert.equal(matches.length, 0, 'no configured credential or private-key pattern may match');
