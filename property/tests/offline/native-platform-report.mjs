import assert from 'node:assert/strict';

const SPECS = {
  'G12-02': { host: 'win32/x64', browserNames: ['Edge', 'Chrome'], browserPlatform: 'windows', mobile: false,
    drivers: ['appium-chromium-driver'] },
  'G12-03': { host: 'darwin/arm64', browserNames: ['Safari', 'Chrome'], browserPlatform: 'mac', mobile: false,
    drivers: ['appium-chromium-driver', 'appium-safari-driver'] },
  'G12-04': { host: 'linux/x64', browserNames: ['Chrome Android'], browserPlatform: 'android', mobile: true,
    drivers: ['appium-uiautomator2-driver'] },
  'G12-05': { host: 'darwin/arm64', browserNames: ['Safari iOS Simulator'], browserPlatform: 'ios', mobile: true,
    drivers: ['appium-xcuitest-driver'] }
};
const DRIVER_VERSIONS = {
  'appium-chromium-driver': '3.2.0', 'appium-safari-driver': '5.0.11',
  'appium-uiautomator2-driver': '8.7.3', 'appium-xcuitest-driver': '12.22.8'
};
const BROWSER_NAMES = {
  'G12-02': { Edge: 'microsoftedge', Chrome: 'chrome' },
  'G12-03': { Safari: 'safari', Chrome: 'chrome' },
  'G12-04': { 'Chrome Android': 'chrome' },
  'G12-05': { 'Safari iOS Simulator': 'safari' }
};

export function validateNativePlatformReport(report, { caseId, candidateCommit }) {
  const spec = SPECS[caseId];
  assert.ok(spec, `unsupported native platform case: ${caseId}`);
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return { status: 'FAIL', reason: 'Platform report is missing or is not a JSON object.' };
  }
  if (report.candidate_commit !== candidateCommit) {
    return { status: 'BLOCKED', reason: `Platform evidence candidate ${report.candidate_commit || 'missing'} does not match ${candidateCommit}.` };
  }
  if (report.case !== caseId) return { status: 'FAIL', reason: `Platform report case is ${report.case || 'missing'}, expected ${caseId}.` };
  if (report.result === 'FAIL') return { status: 'FAIL', reason: report.failure || 'Native platform runner reported FAIL.' };
  if (report.result !== 'PASS') return { status: 'BLOCKED', reason: `Native platform runner reported ${report.result || 'no result'}.` };

  const failures = [];
  if (report.schema_version !== 1) failures.push('unsupported report schema');
  if (`${report.platform?.os}/${report.platform?.arch}` !== spec.host) failures.push(`host must be ${spec.host}`);
  const toolchainDrivers = Array.isArray(report.toolchain?.drivers) ? report.toolchain.drivers : [];
  if (report.toolchain?.appium !== '3.9.0' || !/^22\./.test(String(report.toolchain?.node || '')) ||
      !/^[a-f0-9]{64}$/i.test(String(report.toolchain?.package_lock_sha256 || '')) ||
      JSON.stringify(toolchainDrivers.map(driver => driver.package).sort()) !== JSON.stringify([...spec.drivers].sort()) ||
      toolchainDrivers.some(driver => driver.registered !== true || DRIVER_VERSIONS[driver.package] !== driver.version)) {
    failures.push('pinned Appium and native automation drivers were not prepared and registered');
  }
  if (report.native_relay?.status !== 'PASS' || `${report.native_relay?.platform}` !== spec.host) {
    failures.push(`native packaged relay did not pass on ${spec.host}`);
  }
  const isolation = report.network_isolation;
  if (isolation?.verdict !== 'PASS' || isolation?.blocked_external_probe !== true || isolation?.local_loopback_preserved !== true) {
    failures.push('browser egress isolation or local loopback proof is incomplete');
  }
  if (!/deny-all/i.test(String(isolation?.policy || ''))) failures.push('the native browser session did not declare a deny-all external proxy');
  const hostEgress = isolation?.host_egress;
  const validHostCheck = check => check?.result === 'PASS' && check?.platform === spec.host &&
    check?.policy === 'no-public-default-routes-local-lab-allowed-no-external-proxies' &&
    check?.ipv4?.usable_non_loopback_route_count === 0 && check?.ipv6?.usable_non_loopback_route_count === 0 &&
    /^[a-f0-9]{64}$/i.test(String(check?.ipv4?.route_table_sha256 || '')) &&
    /^[a-f0-9]{64}$/i.test(String(check?.ipv6?.route_table_sha256 || '')) &&
    Array.isArray(check?.proxy_variable_names) && check.proxy_variable_names.length === 0 && check?.loopback_probe === 'PASS';
  if (isolation?.host_egress_blocked !== true || hostEgress?.kind !== 'native-egress-isolation-checkpoints' ||
      hostEgress?.result !== 'PASS' || hostEgress?.policy !== 'no-public-default-routes-local-lab-allowed-no-external-proxies' ||
      hostEgress?.platform !== spec.host || !validHostCheck(hostEgress.start) || !validHostCheck(hostEgress.end) ||
      isolation?.runner_processes_remain_online_for_ci !== false) {
    failures.push('native host egress isolation was not proven independently of the browser proxy');
  }
  if (!Array.isArray(isolation?.deny_proxy_requests) ||
      !isolation.deny_proxy_requests.some(request => /example\.com/i.test(String(request.host || '')))) {
    failures.push('the denied external probe is absent from proxy evidence');
  }
  if (!Array.isArray(report.browsers)) failures.push('browser results are missing');
  const browsers = Array.isArray(report.browsers) ? report.browsers : [];
  const observedNames = browsers.map(row => row.browser).sort();
  if (JSON.stringify(observedNames) !== JSON.stringify([...spec.browserNames].sort())) {
    failures.push(`expected browsers ${spec.browserNames.join(', ')}`);
  }
  const requiredEvidence = ['g12-platform-toolchain-preparation.json', 'g12-platform-network-isolation.json', 'g12-platform-preflight.json',
    'g12-platform-relay.log', 'appium-server.log', 'g12-platform-evidence.json'];
  if (!Array.isArray(report.evidence) || requiredEvidence.some(name => !report.evidence.includes(name)) ||
      new Set(report.evidence).size !== report.evidence.length) failures.push('the platform report does not declare its evidence files');
  for (const browser of browsers) {
    if (browser.status !== 'PASS' || browser.identity !== 'PASS' || browser.messaging !== 'PASS') {
      failures.push(`${browser.browser || 'browser'} identity or message exchange did not pass`);
    }
    if (String(browser.capabilities?.platformName || '').toLowerCase() !== spec.browserPlatform) {
      failures.push(`${browser.browser || 'browser'} ran on an unexpected platform`);
    }
    if (String(browser.capabilities?.browserName || '').toLowerCase() !== BROWSER_NAMES[caseId][browser.browser]) {
      failures.push(`${browser.browser || 'browser'} did not report the required native browser`);
    }
    if (browser.offline_probe?.blocked !== true) failures.push(`${browser.browser || 'browser'} did not prove external egress was blocked`);
    if (browser.pwa?.secureContext !== true || browser.pwa?.serviceWorkerSupported !== true || !browser.pwa?.manifest) {
      failures.push(`${browser.browser || 'browser'} did not load the secure PWA shell`);
    }
    if (spec.mobile) {
      const cycles = browser.cycles;
      if (browser.recovery !== 'PASS' || browser.reconnect !== 'PASS' || !Array.isArray(cycles) || cycles.length !== 3 ||
          cycles.some((cycle, index) => cycle.cycle !== index + 1 || cycle.backgrounded !== true || cycle.resumed !== true ||
            cycle.identity_recovered !== true || cycle.relay_reconnected !== true || cycle.message_delivered_once !== true)) {
        failures.push(`${browser.browser || 'mobile browser'} did not pass all three suspend/resume, recovery, reconnection, and delivery cycles`);
      }
    }
  }
  if (!Number.isSafeInteger(report.local_asset_requests) || report.local_asset_requests < 1) failures.push('local app assets were not observed');
  if (report.physical_installation_proven !== false) failures.push('physical installation proof must be explicitly scoped');
  if (!Array.isArray(report.installability) || report.installability.length !== browsers.length ||
      report.installability.some(row => row.physical_add_to_home_screen_proven !== false)) {
    failures.push('physical PWA installation capability was not explicitly marked unproven');
  }
  if (caseId === 'G12-04' && (report.android_guest_isolation?.verdict !== 'PASS' ||
      report.android_guest_isolation?.wifi_disabled !== true || report.android_guest_isolation?.mobile_data_disabled !== true ||
      !Array.isArray(report.android_guest_isolation?.default_routes_after) || report.android_guest_isolation.default_routes_after.length !== 0)) {
    failures.push('Android guest still has network radios enabled or an external default route');
  }
  if (failures.length) return { status: 'FAIL', reason: failures.join('; ') };
  return { status: 'PASS', reason: `Same-candidate ${caseId} native platform evidence passed on ${spec.host}.` };
}
