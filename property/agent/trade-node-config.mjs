import { exactObject } from './core.mjs';
import { isIP } from 'node:net';

const KEYS = Object.freeze({
  BTC: ['rpc_url', 'username', 'password', 'wallet_name', 'network', 'min_confirmations'],
  XMR: ['wallet_rpc_url', 'daemon_rpc_url', 'username', 'password', 'daemon_username', 'daemon_password', 'network', 'min_confirmations'],
  XNO: ['rpc_url', 'username', 'password', 'wallet', 'network', 'min_confirmations'],
});

function localRpcUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('trade-rpc-url-invalid'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = (isIP(host) === 6 && host === '::1') ||
    (isIP(host) === 4 && host.split('.')[0] === '127');
  if (url.protocol !== 'http:' || !loopback || url.username || url.password || url.search || url.hash) throw new Error('trade-rpc-loopback-required');
  return url.toString();
}

function nonempty(value, max = 256) { return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= max; }

export function emptyTradeNodeConfig(signingSeed) {
  return validateTradeNodeConfig({ schema: 'property-agent-trade-nodes/v1', version: 1, signing_seed: signingSeed, adapters: {} });
}

export function validateTradeNodeConfig(value) {
  if (!exactObject(value, ['schema', 'version', 'signing_seed', 'adapters']) || value.schema !== 'property-agent-trade-nodes/v1' || value.version !== 1 ||
      !/^[0-9a-f]{64}$/.test(value.signing_seed || '') || !value.adapters || typeof value.adapters !== 'object' || Array.isArray(value.adapters) ||
      Object.keys(value.adapters).some(currency => !Object.hasOwn(KEYS, currency)) || Object.keys(value.adapters).length > 3) throw new Error('trade-node-config-invalid');
  const adapters = {};
  for (const [currency, adapter] of Object.entries(value.adapters)) {
    if (!exactObject(adapter, KEYS[currency]) || !Number.isSafeInteger(adapter.min_confirmations) || adapter.min_confirmations < (currency === 'XMR' ? 10 : 1) || adapter.min_confirmations > 10_000) {
      throw new Error('trade-node-config-invalid');
    }
    if (currency === 'BTC') {
      if (adapter.network !== 'regtest' || !nonempty(adapter.username) || !nonempty(adapter.password) || !nonempty(adapter.wallet_name, 64) || !/^[A-Za-z0-9._-]{1,64}$/.test(adapter.wallet_name)) throw new Error('trade-node-config-invalid');
      adapters.BTC = { ...adapter, rpc_url: localRpcUrl(adapter.rpc_url) };
    } else if (currency === 'XMR') {
      if (adapter.network !== 'fakechain' || !nonempty(adapter.username) || !nonempty(adapter.password) ||
          !nonempty(adapter.daemon_username) || !nonempty(adapter.daemon_password)) throw new Error('trade-node-config-invalid');
      adapters.XMR = { ...adapter, wallet_rpc_url: localRpcUrl(adapter.wallet_rpc_url), daemon_rpc_url: localRpcUrl(adapter.daemon_rpc_url) };
    } else {
      if (adapter.network !== 'dev' || !nonempty(adapter.username) || !nonempty(adapter.password) || !/^[0-9a-f]{64}$/i.test(adapter.wallet || '')) throw new Error('trade-node-config-invalid');
      adapters.XNO = { ...adapter, rpc_url: localRpcUrl(adapter.rpc_url) };
    }
  }
  return { schema: 'property-agent-trade-nodes/v1', version: 1, signing_seed: value.signing_seed, adapters };
}
