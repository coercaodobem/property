export async function missingEvidenceReferences(rows, evidenceExists) {
  const missing = [];
  for (const row of rows) {
    if (row.status !== 'PASS') continue;
    const references = row.evidence;
    if (!Array.isArray(references) || references.length === 0) {
      missing.push({ case: row.case, evidence: null, reason: 'PASS case has no evidence references' });
      continue;
    }
    for (const reference of references) {
      if (typeof reference !== 'string' || !reference.trim() || !await evidenceExists(reference)) {
        missing.push({ case: row.case, evidence: reference ?? null, reason: 'Evidence reference is missing or invalid' });
      }
    }
  }
  return missing;
}
