import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'property-migration-'));
try {
  const launcher = join(root, 'relay/start.sh');
  await mkdir(join(root, 'relay/dist/geode/bin'), { recursive: true });
  await copyFile(new URL('../relay/start.sh', import.meta.url), launcher);
  await copyFile(new URL('../relay/resource-limits.sh', import.meta.url), join(root, 'relay/resource-limits.sh'));
  // A fixture executable isolates configuration selection; real Geode runs in integration.
  await writeFile(join(root, 'relay/dist/geode/bin/geode'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const data = join(root, 'data');
  const config = join(root, 'config');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(PROPERTY|LIBERDADE)_RELAY_/.test(name)));
  Object.assign(env, { XDG_DATA_HOME: data, XDG_CONFIG_HOME: config });
  function run(overrides = {}) {
    return spawnSync('bash', [launcher], { env: { ...env, ...overrides }, encoding: 'utf8' });
  }
  const oldData = join(data, 'liberdade-relay');
  const oldConfig = join(config, 'liberdade-relay');
  await mkdir(oldData, { recursive: true });
  await mkdir(oldConfig, { recursive: true });
  await writeFile(join(oldData, 'events.db'), 'existing-fixture-events');
  await writeFile(join(oldConfig, 'geode.toml'), 'existing-fixture-config');
  const legacy = run();
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.ok(legacy.stdout.includes(oldData));
  assert.equal(await readFile(join(oldData, 'events.db'), 'utf8'), 'existing-fixture-events');
  const migratedToml = await readFile(join(oldConfig, 'geode.toml'), 'utf8');
  assert.ok(migratedToml.startsWith('existing-fixture-config'), 'legacy operator config remains intact');
  assert.ok(migratedToml.includes('[rate_limits]'), 'legacy config receives bounded rate defaults');
  assert.ok(migratedToml.includes('max_event_age_seconds = 31536000'), 'legacy config receives the local retention default');
  const preferred = join(root, 'chosen-data');
  const chosenConfig = join(root, 'chosen-config');
  const configured = run({ PROPERTY_RELAY_DATA_DIR: preferred, PROPERTY_RELAY_CONFIG_DIR: chosenConfig,
    PROPERTY_RELAY_PORT: '17459', LIBERDADE_RELAY_PORT: '17460', LIBERDADE_RELAY_DATA_DIR: join(root, 'unused') });
  assert.equal(configured.status, 0, configured.stderr);
  assert.ok(configured.stdout.includes(preferred));
  const toml = await readFile(join(chosenConfig, 'geode.toml'), 'utf8');
  assert.ok(toml.includes('port = 17459'));
  assert.ok(toml.includes(`${preferred}/events.db`));
  const alias = run({ LIBERDADE_RELAY_PORT: '17460', LIBERDADE_RELAY_DATA_DIR: join(root, 'alias-data'), LIBERDADE_RELAY_CONFIG_DIR: join(root, 'alias-config') });
  assert.equal(alias.status, 0, alias.stderr);
  assert.ok((await readFile(join(root, 'alias-config/geode.toml'), 'utf8')).includes('port = 17460'));
  assert.equal(run({ PROPERTY_RELAY_PORT: '65536' }).status, 2);
  assert.equal(run({ PROPERTY_RELAY_PORT: 'bad' }).status, 2);
  console.log('PASS: launcher preserves legacy data/config, new variables override aliases, invalid ports rejected (fixture runtime)');
} finally { await rm(root, { recursive: true, force: true }); }
