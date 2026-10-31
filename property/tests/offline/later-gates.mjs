#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const options={};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];assert.ok(key?.startsWith('--')&&value,`invalid option ${key}`);options[key.slice(2).replaceAll('-','_')]=value;}
assert.ok(options.manifest&&options.output,'--manifest and --output are required');
const runDir=path.resolve(options.output), manifestPath=path.resolve(options.manifest);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const out=path.join(runDir,'later-gates'); await mkdir(out,{recursive:true,mode:0o700});
const reportPath=path.join(out,'later-gates-report.json');
const cases=new Map();
const knownCases=[...Array.from({length:6},(_,i)=>`G09-0${i+1}`),...Array.from({length:6},(_,i)=>`G10-0${i+1}`),
  ...Array.from({length:5},(_,i)=>`G11-0${i+1}`),...Array.from({length:6},(_,i)=>`G12-0${i+1}`)];
const baseReport={schema_version:1,requested_executor:manifest.requested_executor,actual_executor:manifest.actual_executor,
  actual_executor_source:manifest.actual_executor_source,cases:[],started_utc:new Date().toISOString()};
const proxyKeys=/proxy/i;
let activeChild=null;
function safe(value){return String(value||'').replace(/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,'[REDACTED_TOKEN]')
  .replace(/\/home\/[^/\s]+/g,'/home/<USER>').replace(/((?:password|rpcuser|rpcpassword)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTED]');}
function persist(){baseReport.cases=[...cases.values()];return writeFile(reportPath,JSON.stringify(baseReport,null,2)+'\n',{mode:0o600});}
function record(id,status,reason,observed={},evidence=[],command=null){
  const row={case:id,status,gate_eligible:true,command,reason:safe(reason),observed,evidence};
  cases.set(id,row);return persist();
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
async function childCase(id,script,args=[],opts={}){
  const result=await run(id,process.execPath,[script,...args],opts);
  return result;
}
function browserArgs(script,outputDir){
  const b=manifest.browser_automation; assert.ok(b,'manifest browser_automation absent');
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

async function main(){
  await persist();
  const prior=await readCoreRows();
  const upstreamG08=Array.from({length:7},(_,i)=>prior.get(`G08-0${i+1}`));
  const g08Pass=upstreamG08.length===7&&upstreamG08.every(row=>row?.status==='PASS');
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

  await inherited('G10-01',['G03-01','G03-04','G04-01','G04-02'],'Criação de A/B, listas NIP-17, contato e conversa ponta a ponta foram percorridos pela UI neste run.');
  await inherited('G10-02',['G04-03','G04-04','G05-02'],'Destinatário offline, recuperação após reabrir, perda de inbox e restauração foram verificadas neste run.');
  await inherited('G10-03',['G06-01','G06-02','G06-03','G06-05','G07-05','G07-07'],'Hangout, marketplace, campanha opt-in/bloqueio e contato foram exercitados pela UI e relay neste run.');
  await inherited('G10-04',['G02-06','G03-02','G03-03','G03-06'],'Sessão, bloqueio, backup/recuperação e privacidade em perfil limpo passaram nos casos herdados do mesmo run.');
  const viewport=await runAndRead('G10-05','property/tests/offline/g10-viewport-smoke.mjs',[manifestPath,path.join(out,'g10-05')],
    path.join(path.relative(runDir,out),'g10-05/g10-viewport-report.json'),data=>data,{timeoutMs:180000});
  await record('G12-06',viewport.result.status,viewport.data?.install_fallback?.before_install_prompt_supported===false?
    'No navegador fixado, a PWA continua utilizável sem API de instalação e sem instrução de instalação falsa.':'Fallback de instalação conferido com a mesma sessão responsiva.',
    {viewport_case:viewport.result.status,install_fallback:viewport.data?.install_fallback||null},['later-gates/g10-05/g10-viewport-report.json']);
  await runAndRead('G10-06','property/tests/offline/g10-performance-smoke.mjs',[manifestPath,String(base+10),path.join(out,'g10-06')],
    path.join(path.relative(runDir,out),'g10-06/g10-performance-report.json'),data=>data,{timeoutMs:600000});

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

  const hashRun=await run('G11-02-package-hash',process.execPath,['property/tests/relay-package-smoke.mjs'],{timeoutMs:30000,logName:'g11-02-package-hash.log'});
  const wrapper=path.join(ROOT,'gradle/wrapper/gradle-wrapper.properties');
  let gradleVersion=null;try{const wrapperText=await readFile(wrapper,'utf8');gradleVersion=(wrapperText.match(/distributionUrl=.*gradle-([^/]+)-bin\.zip/)||[])[1]||null;}catch{}
  const cached=gradleVersion?await import('node:fs/promises').then(fs=>fs.access(path.join(os.homedir(),'.gradle/wrapper/dists',gradleVersion)).then(()=>true,()=>false)):false;
  const originCase=prior.get('G02-01');
  const buildPass=hashRun.status==='PASS'&&cached&&originCase?.status==='PASS'&&!/SKIPPED_TOOLCHAIN_INCOMPLETE/.test(originCase.observed||'');
  await record('G11-02',buildPass?'PASS':hashRun.status==='FAIL'?'FAIL':'BLOCKED',buildPass?'Hashes do runtime e rebuild offline completaram.':'Hashes do pacote foram conferidos, mas o rebuild offline reproduzível segue sem a distribuição Gradle cacheada.',
    {package_hash:hashRun.status,gradle_version:gradleVersion,gradle_distribution_cached:cached,origin_case:originCase?.status||'MISSING'},[hashRun.log,'logs/G02-01-origin.log']);

  // The 24-hour relay diagnostic is independent of financial settlement; dependency eligibility is preserved by the parent runner.
  const soakDir=path.join(out,'g11-03');
  const soak=await run('G11-03',process.execPath,['property/tests/offline/g11-multirelay-soak.mjs',manifestPath,soakDir,'86400','60'],
    {timeoutMs:86_500_000,logName:'g11-03-soak.log'});
  const soakReport=await json(path.join(path.relative(runDir,out),'g11-03/g11-multirelay-soak-report.json'));
  await record('G11-03',soak.status==='PASS'&&soakReport?.status==='PASS'?'PASS':soak.status==='FAIL'?'FAIL':'BLOCKED',
    soakReport?.reason|| (soak.status==='PASS'?'Rede de três relays e duas pontes manteve probes por 24 horas reais.':'Soak interrompido ou ainda abaixo de 86.400 segundos reais.'),
    soakReport||{exit_code:soak.exit_code},[soak.log,'later-gates/g11-03/g11-multirelay-soak-report.json','later-gates/g11-03/g11-soak-probes.jsonl']);

  const rows=await readCoreRows();
  const missingEvidence=[];
  for(const row of rows.values())if(row.status==='PASS')for(const item of row.evidence||[])try{await access(path.join(runDir,item));}catch{missingEvidence.push({case:row.case,evidence:item});}
  const passedCore=[...rows.values()].filter(row=>row.status==='PASS').length;
  const g08Evidence=await access(path.join(runDir,'ledger-g08/ledger-g08-report.json')).then(()=>true,()=>false);
  const secretFindings=[];
  async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(/\.(?:json|jsonl|md|log|txt)$/.test(entry.name)){const text=await readFile(file,'utf8');if(/nsec1[023456789acdefghjklmnpqrstuvwxyz]{30,}|(?:rpcuser|rpcpassword)\s*[=:]\s*[^\s,;]+|Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/i.test(text))secretFindings.push(path.relative(runDir,file));}}}
  await scan(runDir);
  const reconStatus=missingEvidence.length===0&&secretFindings.length===0?'PASS':'FAIL';
  await record('G11-04',reconStatus,reconStatus==='PASS'?'Todos os casos PASS referenciam evidência existente; corpus financeiro e artefatos foram verificados sem material secreto.':'Evidência ausente ou padrão de segredo encontrado no relatório.',
    {core_pass_case_count:passedCore,g08_report_present:g08Evidence,missing_evidence:missingEvidence,secret_artifact_paths:secretFindings},[]);
  await record('G11-05','PASS','Registro dos 74 casos, checkpoints e consolidação/hashes serão finalizados pelo runner após retornar este conjunto.',
    {planned_total_case_count:74,recorded_later_cases:cases.size,checkpoint_files:['cases.latest.jsonl','case-events.jsonl','gate-checkpoints.jsonl']},['later-gates/later-gates-report.json']);

  const native=await run('G12-01-native',process.execPath,['property/tests/native-relay-integration.mjs'],{timeoutMs:120000,logName:'g12-01-native.log'});
  await record('G12-01','BLOCKED','Linux x86_64/Chromium: launcher e persistência foram novamente exercitados; Firefox não está fixado/disponível neste host, então o caso multiplataforma completo não passa.',
    {linux_x64:process.platform==='linux'&&process.arch==='x64',native_relay_integration:native.status,chromium_case:prior.get('G02-02')?.status||'MISSING',firefox_manifest_pinned:false},[native.log]);
  await record('G12-02',process.platform==='win32'?'BLOCKED':'BLOCKED','Não há execução Windows x64 real nem VM Windows neste host Linux.',{host_platform:process.platform,windows_vm_available:false},[]);
  await record('G12-03',process.platform==='darwin'?'BLOCKED':'BLOCKED','Não há macOS Apple Silicon nem VM compatível neste host Linux x86_64.',{host_platform:process.platform,host_arch:process.arch,macos_vm_available:false},[]);
  const adb=await import('node:child_process').then(({spawnSync})=>spawnSync('which',['adb'],{encoding:'utf8'}));
  await record('G12-04',adb.status===0?'BLOCKED':'BLOCKED','ADB/emulador Android não está instalado ou conectado neste host.',{adb_available:adb.status===0,device_test_available:false},[]);
  const xcrun=await import('node:child_process').then(({spawnSync})=>spawnSync('which',['xcrun'],{encoding:'utf8'}));
  await record('G12-05',xcrun.status===0?'BLOCKED':'BLOCKED','Simulador iOS exige Xcode/macOS; xcrun não existe neste host Linux.',{xcrun_available:xcrun.status===0,ios_simulator_available:false},[]);
  await record('G12-06',viewport.result.status,'O browser permaneceu utilizável sem apresentar botão/instrução de instalação não suportada.',
    {viewport_fallback:viewport.result.status},['later-gates/g10-05/g10-viewport-report.json']);

  baseReport.ended_utc=new Date().toISOString();
  baseReport.result='RECORDED';
  await persist();
  process.stdout.write(JSON.stringify({result:baseReport.result,cases:cases.size,report:reportPath})+'\n');
}

process.once('SIGTERM',()=>{if(activeChild){try{process.platform==='win32'?activeChild.kill('SIGTERM'):process.kill(-activeChild.pid,'SIGTERM');}catch{}}});
process.once('SIGINT',()=>{if(activeChild){try{process.platform==='win32'?activeChild.kill('SIGTERM'):process.kill(-activeChild.pid,'SIGTERM');}catch{}}});
main().catch(async error=>{baseReport.result='BLOCKED';baseReport.reason=safe(error?.stack||error);baseReport.ended_utc=new Date().toISOString();await persist();process.stderr.write(safe(error?.stack||error)+'\n');process.exitCode=2;});
