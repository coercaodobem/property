export const KNOWN_LICENSES = new Set([
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'Unlicense',
  'GPL-2.0-only', 'GPL-2.0-only WITH Classpath-exception-2.0'
]);

export function assertKnownLicense(license, label = 'release file') {
  if (!KNOWN_LICENSES.has(license)) throw new Error(`Unknown license blocks release: ${label}`);
}

export function assertCompleteProvenance(row, label = row?.path || 'release file') {
  if (!row?.component || typeof row.component !== 'string' || !row.component.trim()) {
    throw new Error(`Missing component provenance blocks release: ${label}`);
  }
  if (!row?.source || typeof row.source !== 'string' || !row.source.trim()) {
    throw new Error(`Missing source provenance blocks release: ${label}`);
  }
  assertKnownLicense(row.license, label);
}
