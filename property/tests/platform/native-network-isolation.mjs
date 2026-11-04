import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import net from 'node:net';

const REJECT_ROUTE_TYPES = new Set(['blackhole', 'prohibit', 'throw', 'unreachable']);
const PROXY_VARIABLE = /^(?:HTTP|HTTPS|ALL|FTP|SOCKS|WS|WSS)_PROXY$/i;

function isIpv4LoopbackDestination(destination) {
  const [address, prefixText] = String(destination || '').toLowerCase().split('/');
  if (address === '127') return prefixText === undefined || Number(prefixText) >= 8;
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255) || Number(octets[0]) !== 127) return false;
  return prefixText === undefined || (/^\d+$/.test(prefixText) && Number(prefixText) >= 8 && Number(prefixText) <= 32);
}

function isLoopbackOnlyRoute(platform, family, route) {
  if (platform === 'linux') {
    const device = String(route?.dev || '');
    const destination = String(route?.dst || '').toLowerCase();
    const loopbackDevice = device === 'lo';
    const loopbackDestination = family === '4'
      ? isIpv4LoopbackDestination(destination)
      : new Set(['::1/128', '::1']).has(destination);
    return loopbackDevice && loopbackDestination;
  }
  if (platform === 'win32') {
    const device = String(route?.InterfaceAlias || '');
    const destination = String(route?.DestinationPrefix || '').toLowerCase();
    const loopbackDevice = /^loopback(?:\s|$)/i.test(device);
    const loopbackDestination = family === '4'
      ? isIpv4LoopbackDestination(destination)
      : new Set(['::1/128']).has(destination);
    return loopbackDevice && loopbackDestination;
  }
  if (platform === 'darwin') {
    const fields = String(route || '').trim().split(/\s+/);
    const destination = (fields[0] || '').toLowerCase();
    const interfaceName = fields[3] || '';
    const loopbackDestination = family === '4'
      ? destination === 'localhost' || isIpv4LoopbackDestination(destination)
      : new Set(['::1', '::1/128', 'localhost']).has(destination);
    return interfaceName === 'lo0' && loopbackDestination;
  }
  return false;
}

export function summarizeRoutes(platform, output, family) {
  if (platform === 'linux') {
    const rows = JSON.parse(String(output || '[]'));
    if (!Array.isArray(rows)) throw new Error('Linux route output must be a JSON array.');
    const offMachine = rows.filter(row => !isLoopbackOnlyRoute(platform, family, row));
    return {
      usable: offMachine.filter(row => !REJECT_ROUTE_TYPES.has(String(row.type || 'unicast').toLowerCase())).length,
      rejected: offMachine.filter(row => REJECT_ROUTE_TYPES.has(String(row.type || '').toLowerCase())).length
    };
  }
  if (platform === 'win32') {
    const text = String(output || '').replace(/^\uFEFF/, '').trim();
    const parsed = text ? JSON.parse(text) : [];
    const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : [];
    const offMachine = rows.filter(row => !isLoopbackOnlyRoute(platform, family, row));
    return { usable: offMachine.length, rejected: 0 };
  }
  if (platform === 'darwin') {
    const rows = String(output || '').split(/\r?\n/).filter(line => {
      const first = line.trim().split(/\s+/)[0]?.toLowerCase();
      return first && first !== 'destination' && /^\s*\S+\s+\S+\s+\S+\s+\S+/.test(line);
    });
    const offMachine = rows.filter(line => !isLoopbackOnlyRoute(platform, family, line));
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
    if (ipv4.usable) reasons.push('one or more usable IPv4 non-loopback routes are present');
    if (ipv6.usable) reasons.push('one or more usable IPv6 non-loopback routes are present');
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
    policy: 'loopback-routes-only-no-external-proxies',
    ipv4: { usable_non_loopback_route_count: ipv4.usable, rejected_non_loopback_route_count: ipv4.rejected,
      route_table_sha256: createHash('sha256').update(ipv4Output).digest('hex') },
    ipv6: { usable_non_loopback_route_count: ipv6.usable, rejected_non_loopback_route_count: ipv6.rejected,
      route_table_sha256: createHash('sha256').update(ipv6Output).digest('hex') },
    proxy_variable_names: proxyVariableNames,
    loopback_probe: loopbackProbe ? 'PASS' : 'FAIL',
    reasons
  };
}
