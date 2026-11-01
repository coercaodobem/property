#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const runDir=path.resolve(process.argv[2]||'');
assert.ok(process.argv[2],'usage: node consolidate-retakes.mjs RUN_DIR');
const load=async relative=>JSON.parse(await readFile(path.join(runDir,relative),'utf8'));
const base=await load('summary.json');
const manifest=await load('manifest.json');
assert.equal(base.candidate_commit,manifest.candidate_commit,'summary and manifest candidate commits differ');
const caseRows=(await readFile(path.join(runDir,'cases.latest.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const byCase=new Map(caseRows.map(row=>[row.case,row]));
const overrideSpecs=[
  {case:'G10-05',report:'later-gates/retakes/G12-06-harness-retest/later-gates-report.json'},
  {case:'G11-02',report:'later-gates/retakes/G11-02/later-gates-report.json'},
  {case:'G12-01',report:'later-gates/retakes/G12-01/later-gates-report.json'},
  {case:'G12-06',report:'later-gates/retakes/G12-06-harness-retest/later-gates-report.json'}
];
const overrides=[];
for(const spec of overrideSpecs){
  const report=await load(spec.report);
  const result=report.cases.find(row=>row.case===spec.case);
  assert.ok(result,`${spec.case} is missing from its retake report`);
  const original=byCase.get(spec.case);
  assert.ok(original,`${spec.case} is missing from the base run`);
  assert.equal(result.status,'PASS',`${spec.case} retake did not pass`);
  assert.equal(result.gate_eligible,true,`${spec.case} retake is not gate eligible`);
  for(const evidence of result.evidence||[])await readFile(path.join(runDir,evidence));
  Object.assign(original,{status:result.status,gate_eligible:true,reason:result.reason,
    observed:JSON.stringify(result.observed),evidence:[...new Set([...(original.evidence||[]),...(result.evidence||[]),spec.report])]});
  overrides.push({case:spec.case,retake_report:spec.report,status:result.status});
}
const installFallback=byCase.get('G12-06');
let installObservation={};try{installObservation=JSON.parse(installFallback?.observed||'{}');}catch{}
if(installFallback?.status==='PASS'&&installObservation.viewport_fallback==='PASS'){
  installFallback.gate_eligible=true;
  installFallback.reason='Independent PWA installation fallback case passed; it does not depend on native platform availability.';
}

const platformInventoryPath='later-gates/retakes/G12-environment-inventory.json';
let platformInventory=null;
try{platformInventory=await load(platformInventoryPath);}catch(error){if(error.code!=='ENOENT')throw error;}
if(platformInventory){
  for(const [id,diagnosis] of Object.entries(platformInventory.case_status||{})){
    const row=byCase.get(id);
    if(row?.status!=='BLOCKED'||diagnosis.status!=='BLOCKED')continue;
    row.reason=diagnosis.reason;
    row.evidence=[...new Set([...(row.evidence||[]),platformInventoryPath])];
  }
}

const soak=await load('later-gates/g11-03/g11-multirelay-soak-report.json');
const soakRow=byCase.get('G11-03');
assert.equal(soak.status,'PASS','the existing five-hour soak is not PASS');
assert.equal(soakRow?.status,'PASS','the base case does not preserve the approved soak result');
assert.ok(soak.duration_observed_seconds>=17998&&soak.duration_observed_seconds<=18000,'soak duration is outside the approved five-hour window');
assert.equal(soak.loss_count,0,'the approved soak observed lost accepted events');
assert.equal(soak.planned_middle_relay_restarts?.length,3,'the approved soak lacks its three restart records');

const gateStatus={};
for(let i=0;i<=12;i++){
  const gate=`G${String(i).padStart(2,'0')}`;
  const rows=caseRows.filter(row=>row.case.startsWith(gate+'-'));
  gateStatus[gate]=!rows.length?'NOT_RUN':rows.some(row=>row.status==='FAIL')?'FAIL':rows.some(row=>row.status==='BLOCKED')?'BLOCKED':rows.some(row=>row.status==='NOT_RUN')?'NOT_RUN':rows.every(row=>row.status==='PASS'&&row.gate_eligible===true)?'PASS':'BLOCKED';
}
const caseTotals=caseRows.reduce((result,row)=>{result[row.status]=(result[row.status]||0)+1;return result;},{});
const executorMatches=manifest.actual_executor.trim().toLowerCase()===manifest.requested_executor.trim().toLowerCase();
const hasFailure=caseRows.some(row=>row.status==='FAIL');
const allPass=caseRows.length>0&&caseRows.every(row=>row.status==='PASS'&&row.gate_eligible===true)&&Object.values(gateStatus).every(status=>status==='PASS')&&executorMatches;
const scopeResult=allPass?'PROPERTY_SCOPE_OFFLINE_PASS':hasFailure?'FAIL':'BLOCKED';
const unresolved=caseRows.filter(row=>row.status!=='PASS'||row.gate_eligible!==true).map(row=>({case:row.case,status:row.status,reason:row.reason}));
if(!executorMatches)unresolved.push({case:'EXECUTOR_IDENTITY',status:'BLOCKED',reason:`Requested ${manifest.requested_executor}; actual ${manifest.actual_executor}.`});
const consolidated={schema_version:1,run_id:base.run_id,candidate_commit:base.candidate_commit,original_scope_result:base.scope_result,
  scope_result:scopeResult,exit_code:scopeResult==='PROPERTY_SCOPE_OFFLINE_PASS'?0:hasFailure?1:2,
  evidence_root:path.relative(ROOT,runDir),
  requested_executor:manifest.requested_executor,actual_executor:manifest.actual_executor,executor_matches_request:executorMatches,
  case_totals:caseTotals,gate_status:gateStatus,
  case_statuses:Object.fromEntries(caseRows.map(row=>[row.case,{status:row.status,gate_eligible:row.gate_eligible,reason:row.reason,evidence:row.evidence||[],observed:row.observed}])),
  retake_overrides:overrides,
  preserved_soak:{case:'G11-03',status:soak.status,duration_seconds:soak.duration_observed_seconds,loss_count:soak.loss_count,
    probe_count:soak.probe_count,relay_count:soak.relay_count,bridge_count:soak.bridge_count,restart_count:soak.planned_middle_relay_restarts.length,
    evidence:'later-gates/g11-03/g11-multirelay-soak-report.json'},
  unresolved,generated_utc:new Date().toISOString()};
const outputDir=path.join(runDir,'later-gates','retakes');
await mkdir(outputDir,{recursive:true,mode:0o700});
await writeFile(path.join(outputDir,'consolidated-summary.json'),JSON.stringify(consolidated,null,2)+'\n',{mode:0o600});
await writeFile(path.join(outputDir,'consolidated-cases.jsonl'),caseRows.sort((a,b)=>a.case.localeCompare(b.case)).map(row=>JSON.stringify(row)).join('\n')+'\n',{mode:0o600});
const lines=[
  '# Consolidated Property retest status','',
  `- Candidate: \`${consolidated.candidate_commit}\``,`- Result: **${scopeResult}**`,`- Cases: ${Object.entries(caseTotals).map(([status,count])=>`${status}=${count}`).join(', ')}`,
  `- Requested executor: ${manifest.requested_executor}; actual executor: ${manifest.actual_executor}; identity match: ${executorMatches}`,'',
  '## Gate status','',...Object.entries(gateStatus).map(([gate,status])=>`- ${gate}: ${status}`),'',
  '## Retests and preserved soak','',
  ...overrides.map(item=>`- ${item.case}: ${item.status} — [retake report](${item.retake_report})`),
  `- G11-03: PASS, ${soak.duration_observed_seconds} real seconds, ${soak.probe_count} probes, ${soak.loss_count} losses, ${soak.planned_middle_relay_restarts.length} reconciled restarts. The approved five-hour evidence is reused; no soak was rerun.`,
  '', '## Remaining blockers','',
  ...(unresolved.length?unresolved.map(row=>`- ${row.case}: ${row.status} — ${row.reason}`):['- None.']),''
];
await writeFile(path.join(outputDir,'consolidated-report.md'),lines.join('\n').trimEnd()+'\n',{mode:0o600});
const checksums=[];
async function checksumTree(directory,relative=''){
  const entries=await readdir(directory,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name));
  for(const entry of entries){
    if(!relative&&entry.name==='SHA256SUMS')continue;
    const absolute=path.join(directory,entry.name),name=relative?`${relative}/${entry.name}`:entry.name;
    if(entry.isDirectory())await checksumTree(absolute,name);
    else if(entry.isFile()){const bytes=await readFile(absolute);checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);}
    else throw new Error(`Retake evidence contains a non-regular entry: ${name}`);
  }
}
await checksumTree(outputDir);
await writeFile(path.join(outputDir,'SHA256SUMS'),checksums.sort().join('\n')+'\n',{mode:0o600});
process.stdout.write(JSON.stringify({scope_result:scopeResult,case_totals:caseTotals,gate_status:gateStatus,report:path.join(outputDir,'consolidated-report.md')})+'\n');
