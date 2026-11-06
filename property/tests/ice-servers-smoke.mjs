import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const context = { crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, URL, console };
context.window = context;
vm.createContext(context);
for (const file of ['../web/vendor/nostr-tools-2.25.2.bundle.js', '../web/ice-servers.js']) {
  vm.runInContext(await readFile(new URL(file, import.meta.url), 'utf8'), context, { timeout: 5000 });
}

const result = vm.runInContext(`(() => {
  const api = PropertyIceServers;
  const nostr = NostrTools;
  const secret = nostr.generateSecretKey();
  const pubkey = nostr.getPublicKey(secret);
  const config = { urls: 'stun:stun.home.example:3478\\nturns:turn.home.example:5349?transport=tcp',
    username: 'turn-user', credential: 'private-turn-credential', relayOnly: true };
  const normalized = api.normalize(config);
  const peer = api.peerConfiguration(normalized);
  const saved = api.seal(nostr, secret, pubkey, normalized);
  const opened = api.open(nostr, secret, pubkey, saved);
  const defaultConfig = api.peerConfiguration({});
  const customStun = api.peerConfiguration({ urls: 'stun:stun.private.example:3478' });
  const directTurn = api.peerConfiguration({ urls: 'turn:turn.home.example:3478', username: 'u', credential: 'c' });
  return {
    normalized, peer, saved, opened, defaultConfig, customStun, directTurn,
    classified: api.classify(normalized),
    urlCountLimit: (() => { try { api.normalize({ urls: Array(9).fill('stun:one.example').join('\\n') }); return false; } catch { return true; } })(),
    rejectsNoCredentials: (() => { try { api.normalize({ urls: 'turn:turn.example:3478' }); return false; } catch { return true; } })(),
    rejectsBadScheme: (() => { try { api.normalize({ urls: 'https://turn.example' }); return false; } catch { return true; } })(),
    rejectsRelayOnlyWithoutTurn: (() => { try { api.normalize({ urls: 'stun:stun.example', relayOnly: true }); return false; } catch { return true; } })(),
    rejectsWrongIdentity: (() => { try { api.open(nostr, nostr.generateSecretKey(), pubkey, saved); return false; } catch { return true; } })(),
    missingRecordUsesDefaults: JSON.stringify(api.open(nostr, secret, pubkey, null)) === JSON.stringify({ urls: '', username: '', credential: '', relayOnly: false })
  };
})()`, context, { timeout: 5000 });

assert.equal(result.normalized.relayOnly, true);
assert.equal(result.peer.iceTransportPolicy, 'relay');
assert.deepEqual(JSON.parse(JSON.stringify(result.peer.iceServers)), [{
  urls: ['turns:turn.home.example:5349?transport=tcp'], username: 'turn-user', credential: 'private-turn-credential'
}], 'relay-only excludes STUN and direct candidates');
assert.deepEqual(JSON.parse(JSON.stringify(result.opened)), JSON.parse(JSON.stringify(result.normalized)));
assert.equal(JSON.stringify(result.saved).includes('private-turn-credential'), false, 'credentials are encrypted at rest');
assert.equal(JSON.stringify(result.saved).includes('turn-user'), false, 'TURN username is encrypted at rest');
assert.equal(JSON.parse(JSON.stringify(result.defaultConfig.iceServers)).length, 2, 'empty settings retain the bundled public STUN fallback');
assert.deepEqual(JSON.parse(JSON.stringify(result.customStun.iceServers)), [{ urls: ['stun:stun.private.example:3478'] }], 'custom ICE replaces bundled STUN');
assert.equal(JSON.parse(JSON.stringify(result.directTurn)).iceServers[0].credential, 'c');
assert.deepEqual(JSON.parse(JSON.stringify(result.classified)), { usesDefaultStun: false, hasStun: true, hasTurn: true, relayOnly: true });
assert.equal(result.urlCountLimit, true);
assert.equal(result.rejectsNoCredentials, true);
assert.equal(result.rejectsBadScheme, true);
assert.equal(result.rejectsRelayOnlyWithoutTurn, true);
assert.equal(result.rejectsWrongIdentity, true);
assert.equal(result.missingRecordUsesDefaults, true);

console.log('PASS: bounded ICE URLs, TURN credentials, encrypted local identity-bound settings, and fail-closed relay-only routing');
