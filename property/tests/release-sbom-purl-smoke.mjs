#!/usr/bin/env node
import assert from 'node:assert/strict';
import { packageUrlReference } from '../release/package-url.mjs';

const cases = [
  ['maven-coordinate', packageUrlReference('org.slf4j:slf4j-api:2.0.19', { name: 'slf4j-api', version: '2.0.19' }).referenceLocator,
    'pkg:maven/org.slf4j/slf4j-api@2.0.19'],
  ['scoped-npm-coordinate', packageUrlReference('noble-hashes', { purl: 'pkg:npm/%40noble/hashes@2.4.0' }).referenceLocator,
    'pkg:npm/%40noble/hashes@2.4.0'],
  ['unscoped-npm-coordinate', packageUrlReference('chess-js', { purl: 'pkg:npm/chess.js@1.4.0' }).referenceLocator,
    'pkg:npm/chess.js@1.4.0'],
  ['generic-versioned-component', packageUrlReference('property-first-party', { version: 'a1b2c3' }).referenceLocator,
    'pkg:generic/property/property-first-party@a1b2c3'],
  ['generic-unversioned-component', packageUrlReference('qr-code-generator', { version: 'see local notice' }).referenceLocator,
    'pkg:generic/property/qr-code-generator'],
  ['external-ref-shape', JSON.stringify(packageUrlReference('fixture', { version: '1.0.0' })),
    JSON.stringify({ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: 'pkg:generic/property/fixture@1.0.0' })]
];

for (const [id, actual, expected] of cases) assert.equal(actual, expected, id);
assert.throws(() => packageUrlReference('fixture', { purl: 'https://example.invalid/package' }), /Invalid package URL/);

process.stdout.write(`${JSON.stringify({ schema_version: 1, gate: 'G9', case: 'SPDX package URL ecosystem mapping', result: 'PASS', fixed_cases: cases.length, rejected_invalid_purls: 1 })}\n`);
