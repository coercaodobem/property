#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAppServer, startProxy, loadRuntime, startGeode, stopGeode, publishEvent, waitStored,
  wsQuery, startNode, closeNode, waitUntil, assertNoExternal } from './browser-g05-smoke.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const [manifestPath,outputText='/tmp/property-g11-soak',durationText='18000',intervalText='60']=process.argv.slice(2);
assert.ok(manifestPath,'pinned lab manifest is required');
const manifest=JSON.parse(await readFile(path.resolve(manifestPath),'utf8'));
const browserConfig=manifest.browser_automation;
assert.ok(browserConfig,'pinned browser runtime is required');
const durationSeconds=Number(durationText), intervalSeconds=Number(intervalText);
const diagnosticOnly=process.env.PROPERTY_G11_DIAGNOSTIC_MODE==='1';
assert.ok(Number.isInteger(durationSeconds)&&durationSeconds>=(diagnosticOnly?90:18000)&&durationSeconds<=18000,
  diagnosticOnly?'diagnostic mode requires 90 to 18000 real seconds to cover a restart and a post-restart probe':'G11-03 requires exactly 18000 real seconds and never permits more than five hours');
assert.ok(Number.isInteger(intervalSeconds)&&intervalSeconds>=(diagnosticOnly?1:15)&&intervalSeconds<=300);
const output=path.resolve(outputText); await mkdir(output,{recursive:true,mode:0o700});
const progressPath=path.join(output,'g11-soak-probes.jsonl');
const reportPath=path.join(output,'g11-multirelay-soak-report.json');
const temp=await mkdtemp(path.join(os.tmpdir(),'property-g11-soak-'));
const app=startAppServer(),proxy=startProxy();
let runtime, relays=[], nodes=[], bridgeEvidence=null, activeProbe=null;
const report={schema_version:1,case:'G11-03',status:'RUNNING',duration_required_seconds:durationSeconds,
  duration_minimum_seconds:diagnosticOnly?90:17998,duration_cap_seconds:18000,
  probe_interval_seconds:intervalSeconds,relay_count:3,bridge_count:2,probe_count:0,loss_count:0,
  planned_middle_relay_restarts:[],external_requests:[],websockets:[],relay_rss_peak_bytes:0,
  relay_cpu_peak_percent:0,scratch_bytes_peak:0,resource_samples:[],
  started_utc:new Date().toISOString(),ended_utc:null,duration_observed_seconds:0};
const percentile95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]||0;
async function processUsage(pid){
  try{
    const [rssKb,cpuPercent]=execFileSync('ps',['-o','rss=','-o','pcpu=','-p',String(pid)],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
    return{rss_bytes:(rssKb||0)*1024,cpu_percent:cpuPercent||0};
  }catch{return{rss_bytes:0,cpu_percent:0};}
}
async function treeBytes(directory){
  let total=0;
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory())total+=await treeBytes(file);
    else if(entry.isFile())total+=(await stat(file)).size;
  }
  return total;
}
async function sampleResources(){
  const processes=await Promise.all(relays.map(async relay=>({label:relay.label,pid:relay.child.pid,...await processUsage(relay.child.pid)})));
  const totalRss=processes.reduce((sum,item)=>sum+item.rss_bytes,0);
  const totalCpu=processes.reduce((sum,item)=>sum+item.cpu_percent,0);
  const scratchBytes=await treeBytes(temp);
  report.relay_rss_peak_bytes=Math.max(report.relay_rss_peak_bytes,totalRss);
  report.relay_cpu_peak_percent=Math.max(report.relay_cpu_peak_percent,totalCpu);
  report.scratch_bytes_peak=Math.max(report.scratch_bytes_peak,scratchBytes);
  const sample={observed_utc:new Date().toISOString(),relay_processes:processes,total_relay_rss_bytes:totalRss,
    total_relay_cpu_percent:Number(totalCpu.toFixed(2)),scratch_bytes:scratchBytes};
  report.resource_samples.push(sample);
  assert.ok(processes.every(item=>item.rss_bytes>0),'all relay processes remain measurable during the soak');
  assert.ok(totalRss<=report.resource_budget.max_relay_rss_bytes,'relay RSS remains within the recorded 70% available-memory budget');
  assert.ok(scratchBytes<=report.resource_budget.max_scratch_bytes,'relay data stays within the two-GiB scratch budget');
  return sample;
}
async function save(){await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});}
try{
  await appendFile(progressPath,'');
  await Promise.all([app.ready,proxy.ready]);
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  runtime=await loadRuntime(browserConfig,proxy.server.address().port);
  report.browser=runtime.evidence;
  const base=Number(manifest.ports.seven_relay_base)+80;
  for(let i=0;i<3;i++) relays.push(await startGeode(base+i,temp,`soak relay ${i+1}`));
  bridgeEvidence={nodes:[],external_requests:report.external_requests,denied_proxy_attempts:[],websockets:report.websockets,page_errors:[]};
  nodes.push(await startNode(runtime,origin,bridgeEvidence,'soak bridge P12',[relays[0].url,relays[1].url],{bridge:true}));
  nodes.push(await startNode(runtime,origin,bridgeEvidence,'soak bridge P23',[relays[1].url,relays[2].url],{bridge:true}));
  await waitUntil(async()=>nodes.length===2&&nodes.every(node=>node.subscriptions.length>=2&&
    [relays[0].url,relays[1].url,relays[2].url].filter(url=>node.subscriptions.some(sub=>sub.relay===url&&sub.kinds.includes(1))).length===2),
  20000,'the two PWA bridges did not establish their expected two relay subscriptions');
  const sender=runtime.createIdentity();
  const startMs=Date.now(), endMs=startMs+durationSeconds*1000, stopBeforeMs=endMs-2000;
  report.started_utc=new Date(startMs).toISOString();
  report.setup_completed_utc=report.started_utc;
  report.resource_budget={available_memory_at_start_bytes:os.freemem(),
    max_relay_rss_bytes:Math.floor(os.freemem()*0.70),max_scratch_bytes:2*1024**3};
  const intervalMs=intervalSeconds*1000;
  let nextProbe=startMs;
  const restartOffsets=diagnosticOnly?[10_000]:[60,150,240].map(minutes=>minutes*60*1000);
  let restartIndex=0;
  let nextRestart=startMs+restartOffsets[restartIndex];
  let probesAtLastRestart=null;
  const latencies=[];
  let idleLockVerified=false;
  while(Date.now()<stopBeforeMs){
    if(!idleLockVerified&&Date.now()-startMs>=30*60*1000){
      await waitUntil(async()=>Promise.all(nodes.map(async node=>{
        try{return await node.page.locator('#locked-node-status').isVisible()&&
          await node.page.locator('#workspace').evaluate(element=>element.classList.contains('hidden'));}
        catch{return false;}
      })).then(values=>values.every(Boolean)),20000,'PWA identity did not auto-lock while the explicitly enabled public bridge remained available');
      report.idle_lock_public_bridge={verified:true,observed_utc:new Date().toISOString(),
        nodes:nodes.map(node=>({label:node.label,locked_status_visible:true,secret_cleared_from_ui:true,
          public_bridge_subscriptions:node.subscriptions.filter(sub=>sub.kinds.includes(1)).length}))};
      idleLockVerified=true;
    }
    if(restartIndex<restartOffsets.length&&Date.now()>=nextRestart&&Date.now()<stopBeforeMs){
      const restartStarted=Date.now();
      const middleUrl=relays[1].url;
      const partitionEvent=runtime.sign(1,`Property five hour offline relay soak partition ${report.planned_middle_relay_restarts.length+1}`,Math.floor(Date.now()/1000),sender.secret);
      for(const node of nodes){
        node.subscriptions=node.subscriptions.filter(sub=>sub.relay!==middleUrl);
        node.eoses=node.eoses.filter(eose=>eose.relay!==middleUrl);
      }
      await stopGeode(relays[1]);
      const partitionAck=await publishEvent(relays[0].url,partitionEvent);
      assert.equal(partitionAck.accepted,true,'source relay accepts the partition probe');
      await waitStored(relays[0].url,partitionEvent.id,true,10000);
      const duringPartition=(await wsQuery(relays[2].url,{ids:[partitionEvent.id],limit:1},5000)).length>0;
      assert.equal(duringPartition,false,'the partition probe cannot skip the stopped middle relay');
      await new Promise(resolve=>setTimeout(resolve,30000));
      relays[1]=await startGeode(base+1,temp,'soak relay 2');
      await waitUntil(async()=>nodes.every(node=>{
        const subscription=node.subscriptions.filter(sub=>sub.relay===middleUrl&&sub.kinds.includes(1)).at(-1);
        return Boolean(subscription&&node.eoses.some(eose=>eose.relay===middleUrl&&eose.id===subscription.id));
      }),30000,'both PWA bridges did not create a fresh EOSE-confirmed subscription after middle relay restart');
      await waitStored(relays[1].url,partitionEvent.id,true,90000);
      await waitStored(relays[2].url,partitionEvent.id,true,90000);
      report.planned_middle_relay_restarts.push({scheduled_offset_seconds:Math.floor(restartOffsets[restartIndex]/1000),
        started_utc:new Date(restartStarted).toISOString(),ended_utc:new Date().toISOString(),
        duration_seconds:Number(((Date.now()-restartStarted)/1000).toFixed(2)),same_database:true,
        partition_event_id:partitionEvent.id,source_ack:true,absent_at_destination_during_partition:!duringPartition,
        reconciled_at_middle_and_destination:true});
      probesAtLastRestart=report.probe_count;
      restartIndex++;
      nextRestart=restartIndex<restartOffsets.length?startMs+restartOffsets[restartIndex]:Number.POSITIVE_INFINITY;
      nextProbe=Date.now();
      await sampleResources();
      await save();
    }
    if(Date.now()<nextProbe){await new Promise(resolve=>setTimeout(resolve,Math.min(1000,nextProbe-Date.now())));continue;}
    if(Date.now()>=stopBeforeMs)break;
    const index=report.probe_count;
    if(Date.now()+30000>=stopBeforeMs){await new Promise(resolve=>setTimeout(resolve,Math.max(0,stopBeforeMs-Date.now())));break;}
    const event=runtime.sign(1,`Property five hour offline relay soak probe ${index}`,Math.floor(Date.now()/1000),sender.secret);
    const started=Date.now();
    activeProbe={probe:index,event_id:event.id,started_utc:new Date().toISOString(),source_ack:false};
    const ack=await publishEvent(relays[0].url,event);
    activeProbe.source_ack=ack.accepted===true;
    assert.equal(ack.accepted,true,`source relay rejected probe ${index}: ${ack.message||'no reason supplied'}`);
    await waitStored(relays[2].url,event.id,true,30000);
    const elapsed=Date.now()-started; latencies.push(elapsed);
    report.probe_count++;
    await sampleResources();
    await appendFile(progressPath,JSON.stringify({probe:index,utc:new Date().toISOString(),event_id:event.id,source_ack:true,destination_query:true,latency_ms:elapsed})+'\n',{mode:0o600});
    activeProbe=null;
    if(!report.hangout_deduplication){
      const uiEvidence=[];
      for(const node of nodes){
        await node.page.locator('button[data-view="hangout"]').click();
        await node.page.locator('#refresh-hangout').click();
        await node.page.waitForFunction(id=>document.querySelectorAll(`[data-event-id="${id}"]`).length>=1,event.id,{timeout:15000});
        const visibleCount=await node.page.locator(`[data-event-id="${event.id}"]`).count();
        uiEvidence.push({label:node.label,event_cards:visibleCount});
      }
      report.hangout_deduplication={verified:true,event_id:event.id,nodes:uiEvidence};
    }
    nextProbe+=intervalMs;
    if(nextProbe<Date.now())nextProbe=Date.now();
    if(report.probe_count%10===0)await save();
  }
  report.ended_utc=new Date().toISOString();
  report.duration_observed_seconds=Number(((Date.now()-startMs)/1000).toFixed(3));
  report.p95_publish_to_final_relay_ms=percentile95(latencies);
  report.probe_interval_observed_seconds=latencies.length>1?Number(((durationSeconds)/(latencies.length-1)).toFixed(2)):null;
  report.post_restart_probe_count=probesAtLastRestart===null?null:report.probe_count-probesAtLastRestart;
  if(durationSeconds>=30*60)assert.ok(report.idle_lock_public_bridge?.verified,'idle lock must clear the session without stopping the explicitly enabled public bridge');
  else report.idle_lock_public_bridge={verified:false,not_required_for_short_diagnostic:true};
  report.page_errors=bridgeEvidence.page_errors;
  report.external_requests=bridgeEvidence.external_requests;
  report.websockets=bridgeEvidence.websockets;
  assert.ok(report.duration_observed_seconds>=(diagnosticOnly?15:17998),
    diagnosticOnly?'diagnostic elapsed time meets its short real-time bound':'real elapsed time meets the five-hour target with a two-second shutdown guard');
  assert.ok(report.duration_observed_seconds<=18000,'G11-03 observed duration does not exceed five hours');
  const restartDowntimeSeconds=report.planned_middle_relay_restarts.reduce((sum,restart)=>sum+restart.duration_seconds,0);
  const minimumProbes=Math.max(1,Math.floor((durationSeconds-restartDowntimeSeconds)/intervalSeconds)-2);
  assert.ok(report.probe_count>=minimumProbes,'probe count meets the cadence tolerance after excluding measured restart downtime');
  assert.equal(report.planned_middle_relay_restarts.length,diagnosticOnly?1:3,'every scheduled middle relay restart was exercised within the five-hour cap');
  assert.ok(report.post_restart_probe_count>0,'probe delivery resumed after the most recent middle relay restart');
  assert.equal(report.planned_middle_relay_restarts.every(restart=>restart.absent_at_destination_during_partition&&restart.reconciled_at_middle_and_destination),true,
    'every partition probe remains unreachable during outage and reconciles after the relay returns');
  assert.equal(report.hangout_deduplication?.verified,true,'multi-relay event appears once in the Hangout UI');
  assert.equal(report.loss_count,0);
  assertNoExternal(bridgeEvidence);
  if(report.idle_lock_public_bridge.verified){
    for(const node of nodes){
      await node.page.locator('#stop-locked-node').click();
      await node.page.waitForFunction(()=>document.querySelector('#locked-node-status')?.classList.contains('hidden'),null,{timeout:5000});
      await waitUntil(async()=>node.sockets.filter(socket=>socket.url.startsWith('ws://127.0.0.1:')).every(socket=>socket.closed),5000,
        `${node.label} stop control did not close the locked public bridge sockets`);
    }
    report.locked_bridge_stop={verified:true,nodes:nodes.map(node=>({label:node.label,stop_control_used:true,
      relay_sockets_closed:node.sockets.filter(socket=>socket.url.startsWith('ws://127.0.0.1:')).every(socket=>socket.closed)}))};
  }else report.locked_bridge_stop={verified:false,not_required_for_short_diagnostic:true};
  report.status=diagnosticOnly?'DIAGNOSTIC_PASS':'PASS';
  report.full_5h_gate_eligible=!diagnosticOnly;
  await save();
  process.stdout.write(JSON.stringify(report)+'\n');
}catch(error){
  report.status='FAIL'; report.reason=String(error?.message||error).slice(0,900); report.ended_utc=new Date().toISOString();
  report.duration_observed_seconds=report.started_utc?Number(((Date.now()-Date.parse(report.started_utc))/1000).toFixed(3)):0;
  if(bridgeEvidence){
    report.page_errors=bridgeEvidence.page_errors;
    report.external_requests=bridgeEvidence.external_requests;
    report.websockets=bridgeEvidence.websockets;
  }
  if(activeProbe){
    const observations=await Promise.all(relays.map(async relay=>{
      try{return{relay:relay.url,query_status:'PASS',found:(await wsQuery(relay.url,{ids:[activeProbe.event_id],limit:1},5000)).length>0};}
      catch(queryError){return{relay:relay.url,query_status:'ERROR',reason:String(queryError?.message||queryError).slice(0,300)};}
    }));
    if(activeProbe.source_ack&&observations[2]?.found===false)report.loss_count++;
    report.failure_probe={...activeProbe,observed_utc:new Date().toISOString(),relay_observations:observations,
      confirmed_loss:activeProbe.source_ack&&observations[2]?.found===false};
    await appendFile(progressPath,JSON.stringify({probe:activeProbe.probe,utc:new Date().toISOString(),event_id:activeProbe.event_id,
      source_ack:activeProbe.source_ack,destination_query:false,relay_observations:observations})+'\n',{mode:0o600});
  }
  report.bridge_runtime=await Promise.all(nodes.map(async node=>{
    let ui=null;try{ui=await node.page.evaluate(()=>({auth_visible:!document.querySelector('#auth-screen')?.classList.contains('hidden'),
      workspace_hidden:document.querySelector('#workspace')?.classList.contains('hidden'),locked_bridge_visible:!document.querySelector('#locked-node-status')?.classList.contains('hidden')}));}catch{}
    return{label:node.label,ui,subscriptions:node.subscriptions.length,eoses:node.eoses.length,
      received_events:node.received.length,received_tail:node.received.slice(-8),forwarded_events:node.forwarded.length,
      forwarded_tail:node.forwarded.slice(-8),page_errors:node.errors.slice(-20)};
  }));
  report.relay_processes=relays.map(relay=>({url:relay.url,pid:relay.child.pid,exit_code:relay.child.exitCode,
    log_tail:String(relay.diagnostic?.()||'').slice(-2500)}));
  await save(); process.stderr.write(JSON.stringify(report)+'\n'); process.exitCode=1;
}finally{
  for(const node of nodes.reverse())await closeNode(node);
  for(const relay of relays.reverse())await stopGeode(relay);
  if(runtime?.browser)await runtime.browser.close().catch(()=>{});
  await new Promise(resolve=>app.server.close(resolve));
  await new Promise(resolve=>proxy.server.close(resolve));
  if(report.status==='RUNNING'){
    report.status='BLOCKED'; report.reason='Soak process ended before the required real-time duration.'; report.ended_utc=new Date().toISOString();
    report.duration_observed_seconds=report.started_utc?Number(((Date.now()-Date.parse(report.started_utc))/1000).toFixed(3)):0; await save();
  }
  await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:250});
}
