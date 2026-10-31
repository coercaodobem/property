#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAppServer, startProxy, loadRuntime, startGeode, stopGeode, publishEvent, waitStored, wsQuery } from './browser-g05-smoke.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [manifestPath, portText = '28540', outputText = '/tmp/property-g10-performance'] = process.argv.slice(2);
assert.ok(manifestPath);
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
const config = manifest.browser_automation;
assert.ok(config);
const portBase = Number(portText), output = path.resolve(outputText);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(path.join(os.tmpdir(), 'property-g10-performance-'));
const app = startAppServer(), proxy = startProxy();
const relays = [];
let runtime, browserContext;
const report = { schema_version: 1, case: 'G10-06', result: 'FAIL', shell_load_ms: null, initial_bundle_bytes: null,
  dm_count: 0, dm_p95_ms: null, public_note_count: 0, public_note_p95_ms: null, relay_count: 4, bridge_count: 3,
  child_cpu_ms: null, child_rss_bytes: null, relay_rss_bytes: null, relay_disk_bytes: null,
  quota_pause_ms: null, end_to_end_events: [] };
const percentile95 = values => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*0.95)-1];
async function folderBytes(root) {
  let total=0;
  async function walk(dir) { for (const entry of await readdir(dir,{withFileTypes:true})) { const target=path.join(dir,entry.name); if(entry.isDirectory()) await walk(target); else if(entry.isFile()) total+=(await stat(target)).size; } }
  await walk(root); return total;
}
async function rssFor(pid) {
  const result = await import('node:child_process').then(({execFileSync}) => execFileSync('ps',['-o','rss=','-p',String(pid)],{encoding:'utf8'}).trim());
  return Number(result)*1024||0;
}
try {
  await Promise.all([app.ready,proxy.ready]);
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  runtime=await loadRuntime(config,proxy.server.address().port);
  browserContext=await runtime.browser.newContext({serviceWorkers:'allow'});
  await browserContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  const page=await browserContext.newPage();
  const start=Date.now();
  await page.goto(`${origin}/property/`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.locator('#auth-choice').waitFor({state:'visible',timeout:10000});
  report.shell_load_ms=Date.now()-start;
  report.initial_bundle_bytes=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).origin===location.origin).reduce((sum,entry)=>sum+(entry.transferSize||entry.encodedBodySize||0),0));
  assert.ok(report.shell_load_ms<=3000,`local shell loaded within 3 s (${report.shell_load_ms} ms)`);

  for(let i=0;i<4;i++) relays.push(await startGeode(portBase+i,temp,`G10 performance R${i+1}`));
  const sender=runtime.createIdentity(),recipient=runtime.createIdentity();
  const dmLatencies=[];
  for(let index=0;index<50;index++) {
    const text=`Property offline performance DM ${index}`;
    const wraps=runtime.wrapMany(sender.secret,recipient.pubkey,text);
    const wrap=wraps.find(event=>event.tags.some(tag=>tag[0]==='p'&&tag[1]===recipient.pubkey));
    assert.ok(wrap,'NIP-17 produced a recipient gift wrap');
    const t0=performance.now();
    assert.equal((await publishEvent(relays[3].url,wrap)).accepted,true);
    await waitStored(relays[3].url,wrap.id,true,10000);
    const found=await wsQuery(relays[3].url,{ids:[wrap.id],limit:1});
    assert.equal(found.length,1);
    assert.equal(runtime.unwrapEvent(found[0],recipient.secret).content,text);
    dmLatencies.push(performance.now()-t0);
  }
  report.dm_count=dmLatencies.length; report.dm_p95_ms=Number(percentile95(dmLatencies).toFixed(2));
  assert.ok(report.dm_p95_ms<=5000,`NIP-17 direct message p95 <=5 s (${report.dm_p95_ms} ms)`);

  const bridges=[runtime.bridge.createBridge(runtime.verifyEvent),runtime.bridge.createBridge(runtime.verifyEvent),runtime.bridge.createBridge(runtime.verifyEvent)];
  const noteLatencies=[];
  let firstBridgeAt=null;
  for(let index=0;index<100;index++) {
    if(index===60) {
      const pause=Date.now();
      const remaining=60_100-(Date.now()-firstBridgeAt);
      if(remaining>0) await new Promise(resolve=>setTimeout(resolve,remaining));
      report.quota_pause_ms=Date.now()-pause;
    }
    const event=runtime.sign(1,`Property offline relay performance note ${index}`,Math.floor(Date.now()/1000),sender.secret);
    const started=performance.now();
    assert.equal((await publishEvent(relays[0].url,event)).accepted,true);
    let source=relays[0].url;
    for(let hop=0;hop<bridges.length;hop++) {
      if(firstBridgeAt===null) firstBridgeAt=Date.now();
      const target=relays[hop+1].url;
      assert.deepEqual(Array.from(bridges[hop].targets(event,source,[target])),[target],`bridge ${hop+1} forwards event ${index}`);
      assert.equal((await publishEvent(target,event)).accepted,true,`relay ${hop+2} accepts event ${index}`);
      source=target;
    }
    await waitStored(relays[3].url,event.id,true,10000);
    noteLatencies.push(performance.now()-started);
    report.end_to_end_events.push(event.id);
  }
  report.public_note_count=noteLatencies.length; report.public_note_p95_ms=Number(percentile95(noteLatencies).toFixed(2));
  assert.ok(report.public_note_p95_ms<=10000,`three-bridge public note p95 <=10 s (${report.public_note_p95_ms} ms)`);
  report.child_cpu_ms=Number((process.resourceUsage().userCPUTime+process.resourceUsage().systemCPUTime)/1000);
  report.child_rss_bytes=process.memoryUsage().rss;
  report.relay_rss_bytes=await Promise.all(relays.map(relay=>rssFor(relay.child.pid)));
  report.relay_disk_bytes=await Promise.all(relays.map(relay=>folderBytes(relay.data)));
  report.bridge_event_bytes=report.end_to_end_events.length;
  report.result='PASS';
  await writeFile(path.join(output,'g10-performance-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify(report)+'\n');
} catch(error) {
  report.reason=String(error?.message||error).slice(0,800);
  await writeFile(path.join(output,'g10-performance-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stderr.write(JSON.stringify(report)+'\n'); process.exitCode=1;
} finally {
  if(browserContext) await browserContext.close().catch(()=>{});
  if(runtime?.browser) await runtime.browser.close().catch(()=>{});
  for(const relay of relays.reverse()) await stopGeode(relay);
  await new Promise(resolve=>app.server.close(resolve));
  await new Promise(resolve=>proxy.server.close(resolve));
  await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
