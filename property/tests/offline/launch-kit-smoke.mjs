#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const kit = JSON.parse(await readFile(path.join(root, 'property/docs/launch-kit.json'), 'utf8'));
async function gitMetadata() {
  let gitDir = path.join(root, '.git');
  try {
    const pointer = await readFile(gitDir, 'utf8');
    const match = pointer.match(/^gitdir:\s*(.+)\s*$/m);
    assert.ok(match, 'worktree .git pointer is malformed');
    gitDir = path.resolve(root, match[1]);
  } catch (error) {
    if (error.code !== 'EISDIR') throw error;
  }
  const head = await readFile(path.join(gitDir, 'HEAD'), 'utf8');
  const branchRef = head.match(/^ref:\s+refs\/heads\/(.+)\s*$/m);
  assert.ok(branchRef, 'checkout must be on a named branch');
  let commonDir = gitDir;
  try { commonDir = path.resolve(gitDir, (await readFile(path.join(gitDir, 'commondir'), 'utf8')).trim()); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = await readFile(path.join(commonDir, 'config'), 'utf8');
  const remoteBlock = config.match(/^\[remote "property"\]([^[]*)/m)?.[1] || '';
  const url = remoteBlock.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
  assert.ok(url, 'configured property remote was not found');
  return { branch: branchRef[1], remote: url.replace(/\.git$/, '') };
}
const { branch, remote } = await gitMetadata();
assert.equal(remote, kit.repository_url, 'launch-kit repository URL must match the configured Property remote');
assert.equal(branch, 'modelo-mvp', 'launch-kit contribution link must use the current public working branch');
await stat(path.join(root, 'CONTRIBUTING.md'));
assert.equal(kit.contribution_url, `${kit.repository_url}/blob/${branch}/CONTRIBUTING.md`);

const docs = new Map();
for (const locale of ['en', 'pt-BR']) {
  const file = locale === 'en' ? 'launch-kit.md' : 'launch-kit.pt-BR.md';
  docs.set(locale, await readFile(path.join(root, 'property/docs', file), 'utf8'));
}
const limits = kit.platform_budgets;
const rows = [];
const urlPattern = /https:\/\/[^\s)]+/g;
async function checkPost(platform, locale, text, max, requiresCta = false) {
  const chars = Array.from(text).length;
  assert.ok(chars <= max, `${platform} ${locale}: ${chars} characters exceeds ${max}`);
  assert.ok(docs.get(locale).includes(text), `${platform} ${locale}: canonical text is missing from the human-readable launch kit`);
  const links = text.match(urlPattern) || [];
  if (requiresCta) {
    assert.ok(links.length > 0, `${platform} ${locale}: no contribution link`);
    assert.ok(links.some(link => link === kit.repository_url || link === kit.contribution_url), `${platform} ${locale}: call to action does not target the repository or guide`);
  }
  for (const link of links) {
    const url = new URL(link);
    assert.equal(url.origin, 'https://github.com', `${platform} ${locale}: unexpected external host`);
    assert.ok(url.pathname === '/coercaodobem/property' || url.pathname === `/coercaodobem/property/blob/${branch}/CONTRIBUTING.md`, `${platform} ${locale}: link is not represented by the local checkout`);
    if (url.pathname.endsWith('/CONTRIBUTING.md')) await stat(path.join(root, 'CONTRIBUTING.md'));
  }
  rows.push({ platform, locale, characters: chars, maximum: max, links: links.length, result: 'PASS' });
}

for (const locale of ['en', 'pt-BR']) {
  const reddit = kit.posts.reddit[locale];
  const community = kit.posts.community[locale];
  await checkPost('x_post', locale, kit.posts.x_post[locale], limits.x_post, true);
  await checkPost('reddit_title', locale, reddit.title, limits.reddit_title);
  await checkPost('reddit_body', locale, reddit.body, limits.reddit_body, true);
  await checkPost('community_title', locale, community.title, limits.community_title);
  await checkPost('community_body', locale, community.body, limits.community_body, true);
}

const report = { schema_version: 1, result: 'PASS', branch, repository_url: kit.repository_url,
  contribution_guide_exists: true, platform_budgets_are_project_defined: true, validated_posts: rows.length, posts: rows };
if (process.argv[2]) {
  const output = path.resolve(process.argv[2]);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
process.stdout.write(`${JSON.stringify(report)}\n`);
