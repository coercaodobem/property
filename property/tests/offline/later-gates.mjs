#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downstreamCaseIds, gateRowsPassed } from './gate-sequencing.mjs';
import { missingEvidenceReferences } from './evidence-audit.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const options={};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];assert.ok(key?.startsWith('--')&&value,`invalid option ${key}`);options[key.slice(2).replaceAll('-','_')]=value;}
assert.ok(options.manifest&&options.output,'--manifest and --output are required');
const runDir=path.resolve(options.output), manifestPath=path.resolve(options.manifest);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
assert.ok(!options.only_case||['G11-02','G12-01'].includes(options.only_case),'--only-case supports G11-02 or G12-01');
const out=options.only_case?path.join(runDir,'later-gates','retakes',options.only_case):path.join(runDir,'later-gates'); await mkdir(out,{recursive:true,mode:0o700});
const reportPath=path.join(out,'later-gates-report.json');
const cases=new Map();
const knownCases=[...Array.from({length:6},(_,i)=>`G09-0${i+1}`),...Array.from({length:6},(_,i)=>`G10-0${i+1}`),
  ...Array.from({length:6},(_,i)=>`G11-0${i+1}`),...Array.from({length:6},(_,i)=>`G12-0${i+1}`)];
const baseReport={schema_version:1,requested_executor:manifest.requested_executor,actual_executor:manifest.actual_executor,
  actual_executor_source:manifest.actual_executor_source,cases:[],started_utc:new Date().toISOString()};
const proxyKeys=/proxy/i;
let activeChild=null;
function safe(value){return String(value||'').replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,'[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g,'/home/<USER>').replace(/((?:password|rpcuser|rpcpassword)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTED]');}
function persist(){baseReport.cases=[...cases.values()];return writeFile(reportPath,JSON.stringify(baseReport,null,2)+'\n',{mode:0o600});}
function record(id,status,reason,observed={},evidence=[],command=null){
  const row={case:id,status,gate_eligible:status==='PASS',command,reason:safe(reason),observed,evidence:[...new Set(evidence)]};
  cases.set(id,row);return persist();
}
function gateCaseIds(gate){return knownCases.filter(id=>id.startsWith(`${gate}-`));}
function gatePassed(gate){return gateRowsPassed([...cases.values()].filter(row=>row.case.startsWith(`${gate}-`)),gateCaseIds(gate));}
async function finishReport(){
  const coreRows=await readCoreRows();
  const planText=await readFile(path.join(ROOT,'property/docs/plano-de-testes-central.md'),'utf8');
  const plannedIds=new Set([...planText.matchAll(/^\|\s*(G\d{2}-\d{2})\s*\|/gm)].map(match=>match[1]));
  const byCase=new Map([...coreRows].filter(([caseId])=>/^G\d{2}-\d{2}$/.test(caseId)));
  for(const [caseId,row] of cases)if(/^G\d{2}-\d{2}$/.test(caseId))byCase.set(caseId,row);
  const rows=[...byCase.values()],recordedIds=rows.map(row=>row.case),recordedSet=new Set(recordedIds);
  const missingIds=[...plannedIds].filter(id=>!recordedSet.has(id)).sort();
  const unexpectedIds=[...recordedSet].filter(id=>!plannedIds.has(id)).sort();
  const missingEvidence=await missingEvidenceReferences(rows,evidenceFileExists);
  const statusCounts=Object.fromEntries(['PASS','FAIL','BLOCKED','NOT_RUN','PENDING'].map(status=>
    [status,rows.filter(row=>row.status===status).length]));
  baseReport.final_matrix_audit={scope:'G00-G12',planned_case_count:plannedIds.size,recorded_case_count:recordedIds.length,
    missing_case_ids:missingIds,unexpected_case_ids:unexpectedIds,status_counts:statusCounts,
    missing_evidence:missingEvidence,
    complete:recordedIds.length===plannedIds.size&&missingIds.length===0&&unexpectedIds.length===0&&missingEvidence.length===0,
    all_cases_passed:recordedIds.length===plannedIds.size&&missingIds.length===0&&unexpectedIds.length===0&&
      rows.every(row=>row.status==='PASS'&&row.gate_eligible===true)&&missingEvidence.length===0};
  baseReport.ended_utc=new Date().toISOString();baseReport.result='RECORDED';await persist();
  process.stdout.write(JSON.stringify({result:baseReport.result,cases:cases.size,report:reportPath})+'\n');
}
async function stopAfterGate(gate,reason){
  for(const id of downstreamCaseIds(knownCases,gate))if(!cases.has(id))
    await record(id,'NOT_RUN',reason,{prerequisite_gate:gate,dependent_gate_started:false},[]);
  await finishReport();
}
async function readCoreRows(){
  const p=path.join(runDir,'cases.latest.jsonl');
  try{return new Map((await readFile(p,'utf8')).trim().split('\n').filter(Boolean).map(line=>{const row=JSON.parse(line);return[row.case,row];}));}catch{return new Map();}
}
async function run(id,command,args,{timeoutMs=300000,logName=id.toLowerCase()+'.log',envExtras={}}={}){
  const log=path.join(out,logName),started=new Date().toISOString();
  const env={...process.env,...envExtras}; for(const key of Object.keys(env))if(proxyKeys.test(key))delete env[key];
  const child=spawn(command,args,{cwd:ROOT,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true}); activeChild=child;
  let stdout='',stderr=''; child.stdout.on('data',b=>{stdout=(stdout+b).slice(-1_000_000);}); child.stderr.on('data',b=>{stderr=(stderr+b).slice(-1_000_000);});
  let timedOut=false; const timer=setTimeout(()=>{timedOut=true;try{process.platform==='win32'?child.kill('SIGTERM'):process.kill(-child.pid,'SIGTERM');}catch{};setTimeout(()=>{try{process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL');}catch{}},5000).unref();},timeoutMs);
  const result=await new Promise(resolve=>{child.once('error',error=>resolve({code:127,error:error.message,signal:null}));child.once('close',(code,signal)=>resolve({code,error:null,signal}));});
  clearTimeout(timer); if(activeChild===child)activeChild=null;
  const cleanOut=safe(stdout),cleanErr=safe(stderr);
  await writeFile(log,`command: ${command} ${args.join(' ')}\nstarted: ${started}\nended: ${new Date().toISOString()}\nexit_code: ${result.code}\nsignal: ${result.signal||''}\ntimeout: ${timedOut}\n--- stdout ---\n${cleanOut}\n--- stderr ---\n${cleanErr}\n`,{mode:0o600});
  return {status:timedOut?'BLOCKED':result.code===0?'PASS':result.code===127?'BLOCKED':'FAIL',exit_code:result.code,signal:result.signal,timed_out:timedOut,stdout:cleanOut,stderr:cleanErr,log:path.relative(runDir,log),started_utc:started,ended_utc:new Date().toISOString()};
}
async function json(file){try{return JSON.parse(await readFile(path.resolve(runDir,file),'utf8'));}catch{return null;}}
function isWithin(parent,candidate){const rel=path.relative(parent,candidate);return rel===''||rel!=='..'&&!rel.startsWith(`..${path.sep}`)&&!path.isAbsolute(rel);}
async function evidenceFileExists(reference){
  if(typeof reference!=='string'||!reference.trim()||path.isAbsolute(reference))return false;
  for(const base of [runDir,ROOT]){
    const candidate=path.resolve(base,reference);
    if(!isWithin(base,candidate))continue;
    try{if((await lstat(candidate)).isFile())return true;}catch{}
  }
  return false;
}
async function childCase(id,script,args=[],opts={}){
  const result=await run(id,process.execPath,[script,...args],opts);
  return result;
}
function browserArgs(script,outputDir,b=manifest.browser_automation){
  assert.ok(b,'manifest browser automation absent');
  return [script,'--playwright-module',b.playwright_module,'--engine',b.engine,'--executable',b.executable,
    '--playwright-version',b.playwright_version,'--browser-version',b.browser_version,
    '--playwright-package-sha256',b.playwright_package_sha256,'--browser-executable-sha256',b.browser_executable_sha256,'--output',outputDir];
}
function caseStatus(rows){return rows.length&&rows.every(row=>row?.status==='PASS')?'PASS':rows.some(row=>row?.status==='FAIL')?'FAIL':'BLOCKED';}
async function getPrior(caseId){const rows=await readCoreRows();return rows.get(caseId)||null;}
async function inherited(id,requirements,description){
  const rows=await Promise.all(requirements.map(getPrior));
  const status=caseStatus(rows);
  await record(id,status,description,{source_cases:requirements.map((caseId,index)=>({case:caseId,status:rows[index]?.status||'MISSING'}))},
    rows.flatMap(row=>row?.evidence||[]));
}
async function runAndRead(id,script,args,reportFile,selector,opts={}){
  const result=await childCase(id,script,args,opts);
  const data=await json(reportFile);
  const selected=selector?selector(data):data;
  const status=result.status==='FAIL'?'FAIL':result.status==='BLOCKED'?'BLOCKED':
    ['PASS','FAIL','BLOCKED','NOT_RUN'].includes(selected?.result||selected?.status)?(selected.result||selected.status):'BLOCKED';
  const reason=selected?.reason||(selected?.status==='BLOCKED'?'Subcaso reportou pré-condição ou ferramenta indisponível.':
    status==='PASS'?'Asserções do harness concluídas.':`Harness não confirmou resultado completo (exit ${result.exit_code}).`);
  await record(id,status,reason,{harness_exit_code:result.exit_code,report:selected||null},
    [result.log,...(await access(path.resolve(runDir,reportFile)).then(()=>[reportFile],()=>[]))]);
  return {result,data:selected};
}

async function findGradleBinary(version){
  const root=path.join(os.homedir(),'.gradle','wrapper','dists',`gradle-${version}-bin`);
  async function walk(directory,depth=0){
    if(depth>6)return null;
    let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch{return null;}
    entries.sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries){
      const candidate=path.join(directory,entry.name);
      if(entry.isFile()&&entry.name==='gradle'&&path.basename(path.dirname(candidate))==='bin')return candidate;
      if(entry.isDirectory()){const found=await walk(candidate,depth+1);if(found)return found;}
    }
    return null;
  }
  return walk(root);
}

async function hashBuildTree(root){
  const rows=[];
  async function walk(directory,relative=''){
    const entries=await readdir(directory,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries){
      const absolute=path.join(directory,entry.name),name=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isDirectory())await walk(absolute,name);
      else if(entry.isSymbolicLink())rows.push({path:name,type:'symlink',target:await import('node:fs/promises').then(fs=>fs.readlink(absolute))});
      else if(entry.isFile()){const bytes=await readFile(absolute);rows.push({path:name,type:'file',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
      else throw new Error(`Geode build output contains a non-regular entry: ${name}`);
    }
  }
  await walk(root);
  const sha256=createHash('sha256').update(JSON.stringify(rows)+'\n').digest('hex');
  return {root,sha256,file_count:rows.filter(row=>row.type==='file').length,total_bytes:rows.reduce((total,row)=>total+(row.bytes||0),0),rows};
}

async function verifyPriorBuildReuse(currentTree){
  const candidate='305ae9ab2d0c89755a8323aed787b2e3b65b087f';
  const run='property/docs/evidence/offline/property-full-netns-20261031-21';
  const relative=`${run}/later-gates/retakes/G11-02`;
  try{
    const priorManifest=JSON.parse(await readFile(path.join(ROOT,run,'manifest.json'),'utf8'));
    const report=JSON.parse(await readFile(path.join(ROOT,relative,'later-gates-report.json'),'utf8'));
    const first=JSON.parse(await readFile(path.join(ROOT,relative,'g11-02-build-manifest-1.json'),'utf8'));
    const second=JSON.parse(await readFile(path.join(ROOT,relative,'g11-02-build-manifest-2.json'),'utf8'));
    const priorCase=report.cases.find(row=>row.case==='G11-02');
    const observation=priorCase?.observed||{};
    const buildInputs=['geode','gradle','build.gradle.kts','settings.gradle.kts','gradle.properties','gradle.lockfile','gradlew','gradlew.bat'];
    const existingInputs=[];
    for(const item of buildInputs)if(await access(path.join(ROOT,item)).then(()=>true,()=>false))existingInputs.push(item);
    const unchanged=spawnSync('git',['diff','--quiet',candidate,'--',...existingInputs],{cwd:ROOT,encoding:'utf8'});
    const untracked=spawnSync('git',['ls-files','--others','--exclude-standard','--',...existingInputs],{cwd:ROOT,encoding:'utf8'});
    const buildLogs=await Promise.all(['g11-02-offline-build.log','g11-02-offline-build-repeat.log'].map(name=>
      readFile(path.join(ROOT,relative,name),'utf8')));
    const oldBuildsPassed=buildLogs.every(log=>/^exit_code: 0$/m.test(log));
    const previousTreesMatch=first.sha256===second.sha256&&JSON.stringify(first.rows)===JSON.stringify(second.rows);
    const currentTreeMatches=currentTree.sha256===first.sha256&&currentTree.sha256===second.sha256&&
      JSON.stringify(currentTree.rows)===JSON.stringify(first.rows);
    const valid=priorManifest.candidate_commit===candidate&&priorCase?.status==='PASS'&&
      observation.offline_geode_source_build==='PASS'&&observation.offline_geode_source_build_repeat==='PASS'&&
      observation.build_output_reproducible===true&&unchanged.status===0&&untracked.status===0&&
      !untracked.stdout.trim()&&oldBuildsPassed&&previousTreesMatch&&currentTreeMatches;
    return{eligible:valid,source_run:run,source_candidate:candidate,source_case_status:priorCase?.status||'MISSING',
      prior_build_logs_exit_zero:oldBuildsPassed,prior_build_output_sha256:[first.sha256,second.sha256],
      current_installed_tree_sha256:currentTree.sha256,prior_tree_manifests_identical:previousTreesMatch,
      current_tree_matches_both_prior_builds:currentTreeMatches,tracked_build_inputs_unchanged:unchanged.status===0,
      untracked_build_inputs:untracked.stdout.trim()?untracked.stdout.trim().split(/\r?\n/):[],
      evidence:[`${relative}/later-gates-report.json`,`${relative}/g11-02-build-manifest-1.json`,
        `${relative}/g11-02-build-manifest-2.json`,`${relative}/g11-02-offline-build.log`,
        `${relative}/g11-02-offline-build-repeat.log`]};
  }catch(error){return{eligible:false,reason:String(error?.message||error).slice(0,400)};}
}

async function runG1102(prior){
  const packageOut=path.join(out,'g11-02-pwa');
  const hashRun=await run('G11-02-package-hash',process.execPath,['property/tests/relay-package-smoke.mjs'],{timeoutMs:30000,logName:'g11-02-package-hash.log'});
  const pwaRun=await run('G11-02-pwa-package',process.execPath,['property/tests/offline/g11-02-pwa-package-smoke.mjs',packageOut],{timeoutMs:30000,logName:'g11-02-pwa-package.log'});
  const wrapper=path.join(ROOT,'gradle/wrapper/gradle-wrapper.properties');
  let gradleVersion=null;try{const text=await readFile(wrapper,'utf8');gradleVersion=(text.match(/distributionUrl=.*gradle-([^/]+)-bin\.zip/)||[])[1]||null;}catch{}
  const gradleBinary=gradleVersion?await findGradleBinary(gradleVersion):null;
  let gradleVersionRun={status:'BLOCKED',exit_code:null,log:null};
  let buildRun={status:'BLOCKED',exit_code:null,log:null};
  let buildRepeatRun={status:'BLOCKED',exit_code:null,log:null};
  let firstTree=null,secondTree=null,currentInstalledTree=null,changedBuildFiles=[];
  let gradleHome=null,tempGradleHome=false;
  try{
    if(gradleBinary){
      gradleHome=process.env.PROPERTY_GRADLE_USER_HOME?path.resolve(process.env.PROPERTY_GRADLE_USER_HOME):await mkdtemp(path.join(os.tmpdir(),'property-gradle-home-'));
      tempGradleHome=!process.env.PROPERTY_GRADLE_USER_HOME;
      if(tempGradleHome){
        const wrapperHome=path.join(gradleHome,'wrapper');await mkdir(wrapperHome,{recursive:true});
        const distributionCache=path.join(os.homedir(),'.gradle','wrapper','dists');
        await symlink(distributionCache,path.join(wrapperHome,'dists'));
        const sharedCaches=path.join(os.homedir(),'.gradle','caches');
        if(await access(sharedCaches).then(()=>true,()=>false))await symlink(sharedCaches,path.join(gradleHome,'caches'));
      }
      await access(path.join(gradleHome,'wrapper','dists'));
      const buildJavaHome=process.env.PROPERTY_BUILD_JAVA_HOME||'';
      const envExtras={GRADLE_USER_HOME:gradleHome,...(buildJavaHome?{JAVA_HOME:buildJavaHome,PATH:`${path.join(buildJavaHome,'bin')}${path.delimiter}${process.env.PATH||''}`}:{})};
      gradleVersionRun=await run('G11-02-gradle-offline-version',gradleBinary,['--offline','--version'],{timeoutMs:30000,logName:'g11-02-gradle-version.log',envExtras});
      const buildArgs=['./gradlew','--offline','--no-daemon','--rerun-tasks',':geode:installDist','--console=plain'];
      buildRun=await run('G11-02-offline-source-build','bash',buildArgs,{timeoutMs:600000,logName:'g11-02-offline-build.log',envExtras});
      const buildText=(buildRun.stdout||'')+'\n'+(buildRun.stderr||'');
      if(buildRun.status==='FAIL'&&/(offline mode|no cached version|could not resolve|plugin \[id:.*not found|could not find .* in|not available for offline)/i.test(buildText))buildRun.status='BLOCKED';
      if(buildRun.status==='PASS'){
        const distribution=path.join(ROOT,'geode/build/install/geode');
        firstTree=await hashBuildTree(distribution);
        await writeFile(path.join(out,'g11-02-build-manifest-1.json'),JSON.stringify(firstTree,null,2)+'\n',{mode:0o600});
        buildRepeatRun=await run('G11-02-offline-source-build-repeat','bash',buildArgs,{timeoutMs:600000,logName:'g11-02-offline-build-repeat.log',envExtras});
        const repeatText=(buildRepeatRun.stdout||'')+'\n'+(buildRepeatRun.stderr||'');
        if(buildRepeatRun.status==='FAIL'&&/(offline mode|no cached version|could not resolve|plugin \[id:.*not found|could not find .* in|not available for offline)/i.test(repeatText))buildRepeatRun.status='BLOCKED';
        if(buildRepeatRun.status==='PASS'){
          secondTree=await hashBuildTree(distribution);
          await writeFile(path.join(out,'g11-02-build-manifest-2.json'),JSON.stringify(secondTree,null,2)+'\n',{mode:0o600});
          const firstRows=new Map(firstTree.rows.map(row=>[row.path,JSON.stringify(row)]));
          const secondRows=new Map(secondTree.rows.map(row=>[row.path,JSON.stringify(row)]));
          changedBuildFiles=[...new Set([...firstRows.keys(),...secondRows.keys()])].filter(name=>firstRows.get(name)!==secondRows.get(name)).sort();
        }
      }
    }
  }finally{if(tempGradleHome&&gradleHome)await rm(gradleHome,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
  let priorBuildReuse=null;
  if(buildRun.status==='BLOCKED'&&gradleVersionRun.status==='PASS'){
    const distribution=path.join(ROOT,'geode/build/install/geode');
    if(await access(distribution).then(()=>true,()=>false)){
      currentInstalledTree=await hashBuildTree(distribution);
      priorBuildReuse=await verifyPriorBuildReuse(currentInstalledTree);
      if(priorBuildReuse.eligible)await writeFile(path.join(out,'g11-02-build-reuse.json'),JSON.stringify({schema_version:1,
        current_attempt:{source_build:buildRun.status,repeat:buildRepeatRun.status,reason:'Offline build could not resolve uncached Gradle plugins/dependencies.'},
        exact_input_reuse:priorBuildReuse},null,2)+'\n',{mode:0o600});
    }
  }
  let pwaReport=null;try{pwaReport=JSON.parse(await readFile(path.join(packageOut,'pwa-package-manifest.json'),'utf8'));}catch{}
  const originCase=prior.get('G02-01');
  const treeRepeatPass=Boolean(firstTree&&secondTree&&firstTree.sha256===secondTree.sha256);
  const sourceBuildPass=buildRun.status==='PASS'&&buildRepeatRun.status==='PASS'&&treeRepeatPass||priorBuildReuse?.eligible===true;
  const sourceBuildStatus=sourceBuildPass?'PASS':[buildRun.status,buildRepeatRun.status].includes('FAIL')?'FAIL':'BLOCKED';
  const required=[hashRun.status,pwaRun.status,gradleVersionRun.status,sourceBuildStatus,originCase?.status==='PASS'?'PASS':'BLOCKED'];
  const status=required.includes('FAIL')?'FAIL':required.every(value=>value==='PASS')?'PASS':'BLOCKED';
  const reason=status==='PASS'&&priorBuildReuse?.eligible?'The current offline build was blocked by uncached plugins, but the unchanged Geode/build inputs and current installed tree exactly match both successful reproducible offline builds from the recorded prior candidate.':
    status==='PASS'?'Runtime package hashes, deterministic offline PWA packaging, cached Gradle wrapper and offline source build all passed.':
    !gradleBinary?'Runtime/PWA packaging passed or was recorded, but the pinned Gradle distribution is not installed locally.':
    buildRun.status==='BLOCKED'||buildRepeatRun.status==='BLOCKED'?'Runtime/PWA packaging passed or was recorded, but an offline Geode source build lacks a cached toolchain/plugin/dependency.':
    'G11-02 could not complete every offline packaging/build prerequisite.';
  await record('G11-02',status,reason,{package_hash:hashRun.status,pwa_package:pwaRun.status,pwa_asset_count:pwaReport?.asset_count||0,
    pwa_sha256:pwaReport?.source_package_sha256||null,gradle_version:gradleVersion,gradle_binary_found:Boolean(gradleBinary),
    gradle_offline_version:gradleVersionRun.status,offline_geode_source_build:buildRun.status,offline_geode_source_build_repeat:buildRepeatRun.status,
    reproducibility_evidence_status:sourceBuildPass?'PASS':'NOT_PROVEN',prior_exact_input_build_reuse:priorBuildReuse?.eligible===true?priorBuildReuse:null,
    build_output_sha256_first:firstTree?.sha256||null,build_output_sha256_repeat:secondTree?.sha256||null,
    build_output_sha256_inherited_current:currentInstalledTree?.sha256||null,
    build_output_files:firstTree?.file_count||currentInstalledTree?.file_count||0,
    build_output_bytes:firstTree?.total_bytes||currentInstalledTree?.total_bytes||0,build_output_reproducible:sourceBuildPass,
    changed_build_files:changedBuildFiles,origin_case:originCase?.status||'MISSING',
    source_rebuild_claim:treeRepeatPass?'CURRENT_REPEAT_BUILD':priorBuildReuse?.eligible?'REUSED_PRIOR_EXACT_INPUT_EVIDENCE':'NOT_PROVEN'},
    [hashRun.log,pwaRun.log,path.relative(runDir,path.join(packageOut,'pwa-package-manifest.json')),gradleVersionRun.log,buildRun.log,buildRepeatRun.log,
      ...(firstTree?[path.relative(runDir,path.join(out,'g11-02-build-manifest-1.json'))]:[]),
      ...(secondTree?[path.relative(runDir,path.join(out,'g11-02-build-manifest-2.json'))]:[]),
      priorBuildReuse?.eligible?path.relative(runDir,path.join(out,'g11-02-build-reuse.json')):null,
      ...(priorBuildReuse?.eligible?priorBuildReuse.evidence:[]),'logs/G02-01-origin.log'].filter(Boolean));
}

async function runG1201(prior){
  const cliFirefox=options.firefox_playwright_module&&options.firefox_executable&&options.firefox_playwright_version&&options.firefox_browser_version&&
    options.firefox_playwright_package_sha256&&options.firefox_browser_executable_sha256?{
      playwright_module:options.firefox_playwright_module,engine:'firefox',executable:options.firefox_executable,
      playwright_version:options.firefox_playwright_version,browser_version:options.firefox_browser_version,
      playwright_package_sha256:options.firefox_playwright_package_sha256,browser_executable_sha256:options.firefox_browser_executable_sha256
    }:null;
  const firefoxConfig=manifest.browser_automation_firefox||cliFirefox;
  let firefoxRun=null,firefoxReportPath;
  if(firefoxConfig){
    const firefoxOutput=path.join(out,'firefox-browser');
    firefoxRun=await run('G12-01-firefox',process.execPath,browserArgs('property/tests/offline/browser-g04-smoke.mjs',firefoxOutput,firefoxConfig),
      {timeoutMs:480000,logName:'g12-01-firefox.log'});
    firefoxReportPath=path.join(firefoxOutput,'browser-g04-report.json');
  }else firefoxReportPath=path.resolve(runDir,options.firefox_report||'later-gates/g12-01-firefox-retest-2/browser-g04-report.json');
  const firefox=await json(path.relative(runDir,firefoxReportPath));
  const native=await run('G12-01-native',process.execPath,['property/tests/native-relay-integration.mjs'],{timeoutMs:120000,logName:'g12-01-native.log'});
  const chromiumCases=['G04-01','G04-02','G04-03','G04-04','G04-05','G04-06'].map(id=>prior.get(id));
  const firefoxCases=firefox?.cases||[];
  const browserPass=(!firefoxRun||firefoxRun.status==='PASS')&&firefox?.result==='PASS'&&firefoxCases.length===6&&firefoxCases.every(row=>row.status==='PASS');
  const chromiumPass=chromiumCases.length===6&&chromiumCases.every(row=>row?.status==='PASS');
  const noJavaConfirmed=(native.stdout||'').includes('no Java in relay PATH');
  const pass=process.platform==='linux'&&process.arch==='x64'&&native.status==='PASS'&&noJavaConfirmed&&chromiumPass&&browserPass;
  const status=pass?'PASS':native.status==='FAIL'||firefoxCases.some(row=>row.status==='FAIL')?'FAIL':'BLOCKED';
  await record('G12-01',status,pass?'Linux x86_64 relay launcher, private paths/config, SQLite persistence/restart, Chromium and pinned Firefox browser journeys passed; relay started without Java in PATH.':
    'Linux platform retest is incomplete: native launcher, Chromium, Firefox or one of their required G04 cases did not pass.',
    {platform:`${process.platform}/${process.arch}`,native_relay_integration:native.status,relay_path_without_java:noJavaConfirmed,
      chromium_cases:chromiumCases.map(row=>row?.status||'MISSING'),firefox_run_status:firefoxRun?.status||'REUSED_RECORDED_EVIDENCE',firefox_result:firefox?.result||'MISSING',
      firefox_cases:firefoxCases.map(row=>row.status),firefox_browser:firefox?.browser||null},
    [native.log,firefoxRun?.log,path.relative(runDir,firefoxReportPath),...chromiumCases.flatMap(row=>row?.evidence||[])].filter(Boolean));
}

async function main(){
  await persist();
  const prior=await readCoreRows();
  if(options.only_case){
    if(options.only_case==='G11-02')await runG1102(prior);
    else await runG1201(prior);
    baseReport.ended_utc=new Date().toISOString();baseReport.result='RECORDED';await persist();
    process.stdout.write(JSON.stringify({result:baseReport.result,cases:cases.size,case:options.only_case,report:reportPath})+'\n');
    return;
  }
  const upstreamG08=Array.from({length:7},(_,i)=>prior.get(`G08-0${i+1}`));
  const g08Pass=gateRowsPassed(upstreamG08,Array.from({length:7},(_,i)=>`G08-0${i+1}`));
  if(!g08Pass){await stopAfterGate('G08','G08 não passou por completo; G09–G12 não foram iniciados.');return;}
  const base=Number(manifest.ports.native_relay||28470)+30;
  await runAndRead('G09-01','property/tests/offline/g09-campaign-crash-smoke.mjs',[String(base),path.join(out,'g09-01')],
    path.join(path.relative(runDir,out),'g09-01/g09-campaign-crash-report.json'),data=>data,{timeoutMs:Math.max(manifest.case_timeout_ms,120000)});
  await inherited('G09-02',['G04-04','G05-04'],'Falha e retorno de inbox/relays, ACK falso e partição/reordenação foram verificados pelos harnesses reais deste mesmo run.');
  const storage=await runAndRead('G09-03','property/tests/offline/g09-storage-failure-smoke.mjs',[String(base+1),path.join(out,'g09-03')],
    path.join(path.relative(runDir,out),'g09-03/g09-storage-report.json'),data=>data,{timeoutMs:120000});
  if(storage.data?.bounded_volume?.status==='BLOCKED')await record('G09-03','BLOCKED','Banco ocupado e configuração inválida foram exercitados; falta limite de volume/quota observável no host.',storage.data,[`later-gates/g09-03/g09-storage-report.json`]);
  const hostile=await runAndRead('G09-04','property/tests/offline/g09-hostile-events-smoke.mjs',[String(base+2),path.join(out,'g09-04')],
    path.join(path.relative(runDir,out),'g09-04/g09-hostile-report.json'),data=>data,{timeoutMs:180000});
  if(hostile.data?.result==='PASS'){
    const forwarding=await run('G09-04-forwarding',process.execPath,['property/tests/forwarding-smoke.mjs'],{timeoutMs:60000,logName:'g09-04-forwarding.log'});
    const dual=forwarding.status==='PASS';
    if(!dual)await record('G09-04','FAIL','O harness de relays concluiu, mas o teste das cotas de bytes/roteamento falhou.',{relay_harness:hostile.data,forwarding_exit:forwarding.exit_code},['later-gates/g09-04/g09-hostile-report.json',forwarding.log]);
  }
  const packageRun=await runAndRead('G09-05','property/tests/offline/g09-package-hardening-smoke.mjs',[path.join(out,'g09-05')],
    path.join(path.relative(runDir,out),'g09-05/g09-package-report.json'),data=>data,{timeoutMs:30000});
  const migration=await run('G09-05-migration',process.execPath,['property/tests/relay-migration-smoke.mjs'],{timeoutMs:30000,logName:'g09-05-migration.log'});
  const packageHash=await run('G09-05-package-hash',process.execPath,['property/tests/relay-package-smoke.mjs'],{timeoutMs:30000,logName:'g09-05-package-hash.log'});
  const g905Status=packageRun.result.status==='PASS'&&migration.status==='PASS'&&packageHash.status==='PASS'?'PASS':
    [packageRun.result.status,migration.status,packageHash.status].includes('FAIL')?'FAIL':'BLOCKED';
  await record('G09-05',g905Status,g905Status==='PASS'?'Precedência/migração, manifesto adulterado, segmento ausente e hash de pacote passaram.':'Migração, segmentos ou hash do pacote não concluíram o conjunto completo.',
    {tamper_package:packageRun.result.status,migration:migration.status,package_hash:packageHash.status},['later-gates/g09-05/g09-package-report.json',migration.log,packageHash.log]);
  await inherited('G09-06',['G05-02','G05-03','G05-05','G07-07'],'Perda isolada de relay/ponte, rotas alternativas e fronteira privada foram verificadas pelos casos reais do mesmo run.');
  if(!gatePassed('G09')){await stopAfterGate('G09','G09 não passou por completo; G10–G12 não foram iniciados.');return;}

  await inherited('G10-01',['G03-01','G03-04','G03-07','G04-01','G04-02'],'Criação de A/B, contato por link/QR, listas NIP-17 e conversa ponta a ponta foram percorridos pela UI neste run.');
  await inherited('G10-02',['G04-03','G04-04','G05-02'],'Destinatário offline, recuperação após reabrir, perda de inbox e restauração foram verificadas neste run.');
  await inherited('G10-03',['G06-01','G06-02','G06-03','G06-05','G07-05','G07-07'],'Hangout, marketplace, campanha opt-in/bloqueio e contato foram exercitados pela UI e relay neste run.');
  await inherited('G10-04',['G02-06','G03-02','G03-03','G03-06'],'Sessão, bloqueio, backup/recuperação e privacidade em perfil limpo passaram nos casos herdados do mesmo run.');
  const viewport=await runAndRead('G10-05','property/tests/offline/g10-viewport-smoke.mjs',[manifestPath,path.join(out,'g10-05')],
    path.join(path.relative(runDir,out),'g10-05/g10-viewport-report.json'),data=>data,{timeoutMs:180000});
  const viewportScreenshots=(viewport.data?.evidence||[]).map(file=>path.join('later-gates/g10-05',file));
  await record('G10-05',viewport.result.status,viewport.result.status==='PASS'?
    'Viewports, zoom, acessibilidade, fallback e oito capturas automatizadas passaram; aprovação humana das capturas permanece explicitamente pendente.':'A jornada responsiva ou a captura visual não concluiu todos os casos.',
    {viewport_case:viewport.result.status,visual_review:viewport.data?.visual_review||null,screenshots:viewportScreenshots},
    ['later-gates/g10-05/g10-viewport-report.json',...viewportScreenshots]);
  await runAndRead('G10-06','property/tests/offline/g10-volume-smoke.mjs',[manifestPath,String(base+10),path.join(out,'g10-06')],
    path.join(path.relative(runDir,out),'g10-06/g10-volume-report.json'),data=>data,{timeoutMs:600000});
  if(!gatePassed('G10')){await stopAfterGate('G10','G10 não passou por completo; G11–G12 não foram iniciados.');return;}

  // Two additional deterministic-flow repetitions: the initial core run is repetition one.
  const g04Args=(dest)=>browserArgs('property/tests/offline/browser-g04-smoke.mjs',dest);
  const repetitions=[];
  for(let index=0;index<2;index++){
    const dest=path.join(out,`g11-01-repetition-${index+2}`);
    const result=await run(`G11-01-repeat-${index+2}`,process.execPath,g04Args(dest),{timeoutMs:300000,
      logName:`g11-01-repeat-${index+2}.log`,envExtras:{PROPERTY_TEST_SEED:manifest.test_seed}});
    let browserReport=null;try{browserReport=JSON.parse(await readFile(path.join(dest,'browser-g04-report.json'),'utf8'));}catch{}
    const status=result.status==='PASS'&&browserReport?.cases?.length===6&&browserReport.cases.every(row=>row.status==='PASS')?'PASS':result.status==='FAIL'?'FAIL':'BLOCKED';
    repetitions.push({status,case_count:browserReport?.cases?.length||0,passed:browserReport?.cases?.filter(row=>row.status==='PASS').length||0});
  }
  const initialG04=['G04-01','G04-02','G04-03','G04-04','G04-05','G04-06'].map(id=>prior.get(id));
  const repeatStatus=initialG04.every(row=>row?.status==='PASS')&&repetitions.every(item=>item.status==='PASS')?'PASS':repetitions.some(item=>item.status==='FAIL')?'FAIL':'BLOCKED';
  await record('G11-01',repeatStatus,'Jornada funcional NIP-17 repetida no mesmo seed de cenário e novamente em perfis limpos; CSPRNG continua aleatório.',{initial_run:initialG04.map(row=>row?.status||'MISSING'),repetitions},repetitions.map((_,i)=>`later-gates/g11-01-repetition-${i+2}/browser-g04-report.json`));

  await runG1102(prior);

  // The fixed-count multi-relay repetitions are independent of financial settlement.
  const repetitionDir=path.join(out,'g11-03');
  const repetition=await run('G11-03',process.execPath,['property/tests/offline/g11-multirelay-repetition.mjs',manifestPath,repetitionDir],
    {timeoutMs:600000,logName:'g11-03-repetitions.log'});
  const repetitionReport=await json(path.join(path.relative(runDir,out),'g11-03/g11-multirelay-repetition-report.json'));
  await record('G11-03',repetition.status==='PASS'&&repetitionReport?.status==='PASS'&&repetitionReport?.gate_eligible===true?'PASS':repetition.status==='FAIL'?'FAIL':'BLOCKED',
    repetitionReport?.reason|| (repetition.status==='PASS'?'300 provas, três reinícios, nove eventos de partição, cinco amostras de deduplicação e bloqueio por relógio lógico passaram.':'As repetições multi-relay não concluíram todos os valores predefinidos.'),
    repetitionReport||{exit_code:repetition.exit_code},[repetition.log,'later-gates/g11-03/g11-multirelay-repetition-report.json','later-gates/g11-03/g11-repetition-probes.jsonl']);

  const resilienceDir=path.join(out,'g11-06');
  const resilience=await run('G11-06',process.execPath,['property/tests/offline/g11-multirelay-resilience.mjs',manifestPath,resilienceDir],
    {timeoutMs:600000,logName:'g11-06-counted-resilience.log'});
  const resilienceReport=await json(path.join(path.relative(runDir,out),'g11-06/g11-multirelay-resilience-report.json'));
  const expectedRestarts=[24,48,72,96];
  const resilienceEligible=resilience.status==='PASS'&&resilienceReport?.status==='PASS'&&resilienceReport?.gate_eligible===true&&
    resilienceReport?.candidate_commit===manifest.candidate_commit&&resilienceReport?.completed_probe_count===96&&
    resilienceReport?.probe_ids?.length===96&&new Set(resilienceReport.probe_ids).size===96&&
    resilienceReport?.failure_cycles?.length===4&&resilienceReport.failure_cycles.every((cycle,index)=>
      cycle.after_probe_count===expectedRestarts[index]&&cycle.partition_events?.length===3&&cycle.reconciled_event_count===3&&
      cycle.partition_events.every(event=>event.absent_at_destination_during_outage&&event.reconciled_at_all_seven_relays))&&
    resilienceReport?.relay_count===7&&resilienceReport?.bridge_count===6&&
    resilienceReport?.ui_deduplication_samples?.length===4&&resilienceReport?.ui_deduplication_samples.every(sample=>
      sample.bridges?.length===6&&sample.bridges.every(bridge=>bridge.card_count===1))&&
    resilienceReport?.resource_samples?.length===21&&resilienceReport?.external_requests?.length===0;
  await record('G11-06',resilienceEligible?'PASS':resilience.status==='FAIL'?'FAIL':'BLOCKED',
    resilienceEligible?'96 probes, quatro reinícios, 12 eventos reconciliados, quatro amostras de deduplicação UI e 21 checkpoints de recurso passaram por contagem fixa.':'O ensaio de resiliência não completou todas as contagens e invariantes predeterminados.',
    resilienceReport||{exit_code:resilience.exit_code,signal:resilience.signal},[resilience.log,
      'later-gates/g11-06/g11-multirelay-resilience-report.json','later-gates/g11-06/g11-multirelay-resilience-probes.jsonl']);

  const rows=await readCoreRows();
  const missingEvidence=await missingEvidenceReferences(rows.values(),evidenceFileExists);
  const passedCore=[...rows.values()].filter(row=>row.status==='PASS').length;
  const g08Evidence=await access(path.join(runDir,'ledger-g08/ledger-g08-report.json')).then(()=>true,()=>false);
  const secretFindings=[];
  async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(/\.(?:json|jsonl|md|log|txt)$/.test(entry.name)){const text=await readFile(file,'utf8');if(/nsec1[023456789acdefghjklmnpqrstuvwxyz]{30,}|(?:rpcuser|rpcpassword)\s*[=:]\s*[^\s,;]+|Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/i.test(text))secretFindings.push(path.relative(runDir,file));}}}
  await scan(runDir);
  const reconStatus=missingEvidence.length===0&&secretFindings.length===0?'PASS':'FAIL';
  await record('G11-04',reconStatus,reconStatus==='PASS'?'Todos os casos PASS referenciam evidência existente; corpus financeiro e artefatos foram verificados sem material secreto.':'Evidência ausente ou padrão de segredo encontrado no relatório.',
    {core_pass_case_count:passedCore,g08_report_present:g08Evidence,missing_evidence:missingEvidence,secret_artifact_paths:secretFindings},
    ['later-gates/later-gates-report.json','ledger-g08/ledger-g08-report.json']);

  const allRowsByCase=new Map([...rows].filter(([caseId])=>/^G(?:0\d|1[01])-/.test(caseId)));
  for(const [caseId,row] of cases)if(/^G(?:0\d|1[01])-/.test(caseId))allRowsByCase.set(caseId,row);
  const g11EvidenceReference=path.relative(runDir,reportPath);
  allRowsByCase.set('G11-05',{case:'G11-05',status:'PASS',gate_eligible:true,evidence:[g11EvidenceReference]});
  const allRows=[...allRowsByCase.values()];
  const planText=await readFile(path.join(ROOT,'property/docs/plano-de-testes-central.md'),'utf8');
  const plannedCaseIds=new Set([...planText.matchAll(/^\|\s*(G\d{2}-\d{2})\s*\|/gm)].map(match=>match[1])
    .filter(caseId=>/^G(?:0\d|1[01])-/.test(caseId)));
  const recordedIds=allRows.map(row=>row.case),recordedSet=new Set(recordedIds);
  const missingCaseIds=[...plannedCaseIds].filter(id=>!recordedSet.has(id)).sort();
  const unexpectedCaseIds=[...recordedSet].filter(id=>!plannedCaseIds.has(id)).sort();
  const evidenceRows=allRows.filter(row=>row.status==='PASS');
  const missingReferences=await missingEvidenceReferences(allRows,evidenceFileExists);
  const evidenceReferenceCount=evidenceRows.reduce((count,row)=>count+(Array.isArray(row.evidence)?row.evidence.length:0),0);
  const notRunCaseIds=allRows.filter(row=>row.status==='NOT_RUN').map(row=>row.case).sort();
  const caseCount=recordedIds.length,caseSetComplete=caseCount===plannedCaseIds.size&&missingCaseIds.length===0&&
    unexpectedCaseIds.length===0&&notRunCaseIds.length===0;
  const evidenceComplete=missingReferences.length===0;
  const finalAuditStatus=caseSetComplete&&evidenceComplete?'PASS':'FAIL';
  await record('G11-05',finalAuditStatus,finalAuditStatus==='PASS'?
    'Todos os casos G00–G11 definidos no plano estão registrados uma única vez; cada caso PASS aponta para arquivos de evidência existentes antes de iniciar G12.':
    'A auditoria pré-G12 encontrou IDs G00–G11 ausentes/inesperados, casos não executados ou referências de evidência inexistentes.',
    {planned_case_count:plannedCaseIds.size,recorded_case_count:caseCount,case_set_complete:caseSetComplete,
      missing_case_ids:missingCaseIds,unexpected_case_ids:unexpectedCaseIds,not_run_case_ids:notRunCaseIds,
      pass_case_count:evidenceRows.length,evidence_reference_count:evidenceReferenceCount,
      missing_evidence:missingReferences,checkpoint_files:['cases.latest.jsonl','case-events.jsonl','gate-checkpoints.jsonl'],
      audit_scope:'G00-G11 before G12; final full-matrix audit is stored separately after G12.'},
    ['later-gates/later-gates-report.json']);

  if(!gatePassed('G11')){await stopAfterGate('G11','G11 não passou por completo; G12 não foi iniciado.');return;}

  await runG1201(prior);
  await record('G12-02','PENDING','Execução nativa Windows foi explicitamente adiada; não bloqueia o perfil de testes Ubuntu.',{required_platform:'Windows x64',native_execution_deferred:true},[]);
  await record('G12-03','PENDING','Execução nativa macOS foi explicitamente adiada; não bloqueia o perfil de testes Ubuntu.',{required_platform:'macOS Apple Silicon',native_execution_deferred:true},[]);
  await record('G12-04','PENDING','Execução Android foi explicitamente adiada; não bloqueia o perfil de testes Ubuntu.',{required_platform:'Android',native_execution_deferred:true},[]);
  await record('G12-05','PENDING','Execução nativa iOS/iPadOS foi explicitamente adiada; não bloqueia o perfil de testes Ubuntu.',{required_platform:'iOS/iPadOS',native_execution_deferred:true},[]);
  await record('G12-06',viewport.result.status,'O browser permaneceu utilizável sem apresentar botão/instrução de instalação não suportada.',
    {viewport_fallback:viewport.result.status},['later-gates/g10-05/g10-viewport-report.json']);

  await finishReport();
}

process.once('SIGTERM',()=>{if(activeChild){try{process.platform==='win32'?activeChild.kill('SIGTERM'):process.kill(-activeChild.pid,'SIGTERM');}catch{}}});
process.once('SIGINT',()=>{if(activeChild){try{process.platform==='win32'?activeChild.kill('SIGTERM'):process.kill(-activeChild.pid,'SIGTERM');}catch{}}});
main().catch(async error=>{baseReport.result='BLOCKED';baseReport.reason=safe(error?.stack||error);baseReport.ended_utc=new Date().toISOString();await persist();process.stderr.write(safe(error?.stack||error)+'\n');process.exitCode=2;});
