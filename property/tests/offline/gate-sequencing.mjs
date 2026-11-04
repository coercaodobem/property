export function gateRowsPassed(rows, expectedCaseIds) {
  if (!Array.isArray(rows) || !Array.isArray(expectedCaseIds) || expectedCaseIds.length === 0) return false;
  const expected = new Set(expectedCaseIds);
  if (expected.size !== expectedCaseIds.length || rows.length !== expected.size) return false;
  const byCase = new Map();
  for (const row of rows) {
    if (!row || typeof row.case !== 'string' || byCase.has(row.case)) return false;
    byCase.set(row.case, row);
  }
  return expectedCaseIds.every(caseId => {
    const row = byCase.get(caseId);
    return row?.status === 'PASS' && row.gate_eligible === true;
  });
}

export function downstreamCaseIds(caseIds, completedGate) {
  const gateMatch = String(completedGate || '').match(/^G(\d{2})$/);
  if (!gateMatch || !Array.isArray(caseIds)) throw new Error('A gate id and case id array are required.');
  const gateNumber = Number(gateMatch[1]);
  return [...new Set(caseIds)].filter(caseId => {
    const caseMatch = String(caseId).match(/^G(\d{2})-\d{2}$/);
    return caseMatch && Number(caseMatch[1]) > gateNumber;
  }).sort((left, right) => left.localeCompare(right));
}
