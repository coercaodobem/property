import assert from 'node:assert/strict';
import { assertCompleteProvenance, assertKnownLicense } from '../release/metadata-policy.mjs';

assertKnownLicense('MIT', 'accepted fixture');
assertCompleteProvenance({ path: 'fixture.txt', component: 'fixture', license: 'MIT', source: 'fixture/source' });
assert.throws(() => assertKnownLicense('NOASSERTION', 'unknown-license fixture'), /Unknown license blocks release/);
assert.throws(() => assertCompleteProvenance({ component: 'fixture', license: 'MIT' }, 'missing-source fixture'), /Missing source provenance blocks release/);
assert.throws(() => assertCompleteProvenance({ source: 'fixture/source', license: 'MIT' }, 'missing-component fixture'), /Missing component provenance blocks release/);
process.stdout.write(JSON.stringify({ result: 'PASS', cases: 4, accepted_known_license: 1, rejected_unknown_license: 1,
  rejected_missing_source: 1, rejected_missing_component: 1 }) + '\n');
