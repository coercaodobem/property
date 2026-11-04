import { createHash } from 'node:crypto';
import net from 'node:net';
import { spawnSync } from 'node:child_process';

const REJECT_ROUTE_TYPES = new Set(['blackhole', 'prohibit', 'throw', 'unreachable']);
const PROXY_VARIABLE = /^(?:HTTP|HTTPS|ALL|FTP|SOCKS|WS|WSS)_PROXY$/i;

function parseIpv4Route(destination) {
  let [address = '', prefixText] = String(destination || '').toLowerCase().split('/');
  if (address === 'default' || address === '0.0.0.0') return null;
  if (address === 'localhost') address = '127.0.0.0';
  if (address === '127') address = '127.0.0.0';
  const parts = address.split('.');
  if (parts.length < 1 || parts.length > 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  const originalPartCount = parts.length;
  while (parts.length < 4) parts.push('0');
  const fullAddress = parts.join('.');
  if (net.isIP(fullAddress) !== 4) return null;
  const prefix = prefixText === undefined ? originalPartCount * 8 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const value = parts.reduce((result, part) => (result << 8n) | BigInt(Number(part)), 0n);
  return { value, prefix };
}

function parseIpv6Route(destination) {
  let [address = '', prefixText] = String(destination || '').toLowerCase().split('/');
  if (!address || address === 'default' || net.isIP(address.replace(/%[^%]+$/, '')) !== 6) return null;
  address = address.replace(/%[^%]+$/, '');
  const [leftText, rightText = ''] = address.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (address.includes('::') === false && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const prefix = prefixText === undefined ? 128 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return null;
  return { value: groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n), prefix };
}

function isAllowedLocalRoute(destination, family) {
  if (family === '4') {
    const route = parseIpv4Route(destination);
    if (!route) return false;
    const ranges = [
      { network: 0x0a000000n, prefix: 8 },       // RFC 1918
      { network: 0xac100000n, prefix: 12 },      // RFC 1918
      { network: 0xc0a80000n, prefix: 16 },      // RFC 1918
      { network: 0x7f000000n, prefix: 8 },       // loopback
      { network: 0xa9fe0000n, prefix: 16 },      // link local
      { network: 0x64400000n, prefix: 10 },      // shared address space
      { network: 0xe0000000n, prefix: 4 },       // multicast
      { network: 0xf0000000n, prefix: 4 }        // reserved/broadcast
    ];
    return ranges.some(range => {
      if (route.prefix < range.prefix) return false;
      const mask = ((1n << BigInt(range.prefix)) - 1n) << BigInt(32 - range.prefix);
      return (route.value & mask) === range.network;
    });
  }
  if (family === '6') {
    const route = parseIpv6Route(destination);
    if (!route) return false;
    const ranges = [
      { network: 1n, prefix: 128 },
      { network: 0xfe800000000000000000000000000000n, prefix: 10 },
      { network: 0xfc000000000000000000000000000000n, prefix: 7 },
      { network: 0xff000000000000000000000000000000n, prefix: 8 }
    ];
    return ranges.some(range => {
      if (route.prefix < range.prefix) return false;
      const mask = ((1n << BigInt(range.prefix)) - 1n) << BigInt(128 - range.prefix);
      return (route.value & mask) === range.network;
    });
  }
  return false;
}

function routeDestination(platform, family, route) {
  if (platform === 'linux') return String(route?.dst || 'default').toLowerCase();
  if (platform === 'win32') return String(route?.DestinationPrefix || 'default').toLowerCase();
  if (platform === 'darwin') {
    const destination = String(route || '').trim().split(/\s+/)[0]?.toLowerCase() || 'default';
    if (destination.startsWith('link#')) return '127.0.0.0/8';
    return destination === 'localhost' && family === '4' ? '127.0.0.0/8' : destination;
  }
  return 'default';
}

function isLocalOnlyRoute(platform, family, route) {
  return isAllowedLocalRoute(routeDestination(platform, family, route), family);
}

export function summarizeRoutes(platform, output, family) {
  if (platform === 'linux') {
    const rows = JSON.parse(String(output || '[]'));
    if (!Array.isArray(rows)) throw new Error('Linux route output must be a JSON array.');
    const offMachine = rows.filter(row => !isLocalOnlyRoute(platform, family, row));
    return {
      usable: offMachine.filter(row => !REJECT_ROUTE_TYPES.has(String(row.type || 'unicast').toLowerCase())).length,
      rejected: offMachine.filter(row => REJECT_ROUTE_TYPES.has(String(row.type || '').toLowerCase())).length
    };
  }
  if (platform === 'win32') {
    const text = String(output || '').replace(/^\uFEFF/, '').trim();
    const parsed = text ? JSON.parse(text) : [];
    const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : [];
    const offMachine = rows.filter(row => !isLocalOnlyRoute(platform, family, row));
    return { usable: offMachine.length, rejected: 0 };
  }
  if (platform === 'darwin') {
    const rows = String(output || '').split(/\r?\n/).filter(line => {
      const first = line.trim().split(/\s+/)[0]?.toLowerCase();
      return first && first !== 'destination' && /^\s*\S+\s+\S+\s+\S+\s+\S+/.test(line);
    });
    const offMachine = rows.filter(line => !isLocalOnlyRoute(platform, family, line));
    const rejected = offMachine.filter(line => {
      const flags = line.trim().split(/\s+/)[2] || '';
      return /\b(?:reject|blackhole)\b/i.test(line) || /[RB]/.test(flags);
    });
    return { usable: offMachine.length - rejected.length, rejected: rejected.length };
  }
  throw new Error(`Unsupported native route-table platform: ${platform}`);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} route inspection failed with status ${result.status ?? 'unavailable'}.`);
  }
  return result.stdout || '';
}

function routeTableOutput(platform, family) {
  if (platform === 'linux') return commandOutput('ip', ['-j', `-${family}`, 'route', 'show', 'table', 'all']);
  if (platform === 'darwin') return commandOutput('netstat', ['-rn', '-f', family === '4' ? 'inet' : 'inet6']);
  if (platform === 'win32') {
    const script = `$ErrorActionPreference='Stop'; $routes=@(Get-NetRoute -PolicyStore ActiveStore -AddressFamily IPv${family} -ErrorAction Stop | Select-Object DestinationPrefix,NextHop,InterfaceAlias); ConvertTo-Json -InputObject $routes -Compress`;
    return commandOutput('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  }
  throw new Error(`Unsupported native route-table platform: ${platform}`);
}

async function probeLoopback() {
  const server = net.createServer(socket => socket.end('property-loopback-ok'));
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address()?.port;
    if (!Number.isInteger(port)) return false;
    return await new Promise(resolve => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(3000);
      socket.once('connect', () => { socket.end(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
  } catch {
    return false;
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}

export async function inspectNativeNetworkIsolation({ platform = process.platform, arch = process.arch, env = process.env } = {}) {
  const reasons = [];
  const proxyVariableNames = Object.keys(env).filter(name => PROXY_VARIABLE.test(name)).sort();
  if (proxyVariableNames.length) reasons.push('external proxy environment variables are present');

  let ipv4Output = '';
  let ipv6Output = '';
  let ipv4 = { usable: 0, rejected: 0 };
  let ipv6 = { usable: 0, rejected: 0 };
  try {
    ipv4Output = routeTableOutput(platform, '4');
    ipv6Output = routeTableOutput(platform, '6');
    ipv4 = summarizeRoutes(platform, ipv4Output, '4');
    ipv6 = summarizeRoutes(platform, ipv6Output, '6');
    if (ipv4.usable) reasons.push('one or more usable public or default IPv4 routes are present');
    if (ipv6.usable) reasons.push('one or more usable public or default IPv6 routes are present');
  } catch (error) {
    reasons.push(error?.message || 'route-table inspection failed');
  }

  const loopbackProbe = await probeLoopback();
  if (!loopbackProbe) reasons.push('the local loopback TCP probe failed');
  return {
    schema_version: 1,
    kind: 'native-egress-isolation',
    result: reasons.length ? 'BLOCKED' : 'PASS',
    platform: `${platform}/${arch}`,
    policy: 'no-public-default-routes-local-lab-allowed-no-external-proxies',
    ipv4: { usable_non_loopback_route_count: ipv4.usable, rejected_non_loopback_route_count: ipv4.rejected,
      route_table_sha256: createHash('sha256').update(ipv4Output).digest('hex') },
    ipv6: { usable_non_loopback_route_count: ipv6.usable, rejected_non_loopback_route_count: ipv6.rejected,
      route_table_sha256: createHash('sha256').update(ipv6Output).digest('hex') },
    proxy_variable_names: proxyVariableNames,
    loopback_probe: loopbackProbe ? 'PASS' : 'FAIL',
    reasons
  };
}
