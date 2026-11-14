import { ed25519 } from './vendor/node_modules/@noble/curves/ed25519.js';
import { createFROST } from './vendor/node_modules/@noble/curves/abstract/frost.js';
import { blake2b } from './vendor/node_modules/@noble/hashes/blake2.js';
import { concatBytes } from './vendor/node_modules/@noble/hashes/utils.js';
import { sha512 } from './vendor/node_modules/@noble/hashes/sha2.js';
import { bytesToNumberBE, bytesToNumberLE } from './vendor/node_modules/@noble/curves/utils.js';

const ACCOUNT_ALPHABET = '13456789abcdefghijkmnopqrstuwxyz';
const ACCOUNT_PREFIX = 'nano_';
const ACCOUNT_LENGTH = 65;

function bytes(value, name, length) {
  if (!(value instanceof Uint8Array) || value.length !== length) throw new TypeError(`${name}-invalid`);
  return new Uint8Array(value);
}

function base32Encode(value, bits) {
  let encoded = '';
  for (let shift = bits - 5; shift >= 0; shift -= 5) encoded += ACCOUNT_ALPHABET[Number((value >> BigInt(shift)) & 31n)];
  return encoded;
}

function base32Decode(value) {
  let decoded = 0n;
  for (const character of value) {
    const digit = ACCOUNT_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('xno-account-invalid');
    decoded = (decoded << 5n) | BigInt(digit);
  }
  return decoded;
}

function integerToBytesBE(value, size) {
  const out = new Uint8Array(size);
  for (let index = size - 1; index >= 0; index--) {
    out[index] = Number(value & 255n);
    value >>= 8n;
  }
  if (value !== 0n) throw new Error('xno-account-invalid');
  return out;
}

function toHex(value) {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value) {
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index++) output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return output;
}

function assertNanoPublicKey(publicKey) {
  const point = Point.fromBytes(publicKey);
  point.assertValidity();
  if (!point.isTorsionFree() || point.is0()) throw new Error('xno-public-key-invalid');
  return publicKey;
}

export function nanoAccountFromPublicKey(publicKeyValue) {
  const publicKey = assertNanoPublicKey(bytes(publicKeyValue, 'xno-public-key', 32));
  const keyInteger = bytesToNumberLE(new Uint8Array([...publicKey].reverse()));
  const addressKey = base32Encode(keyInteger, 260);
  const checksum = blake2b(publicKey, { dkLen: 5 }).reverse();
  const checksumInteger = bytesToNumberBE(checksum);
  return `${ACCOUNT_PREFIX}${addressKey}${base32Encode(checksumInteger, 40)}`;
}

export function nanoPublicKeyFromAccount(account) {
  if (typeof account !== 'string' || account.length !== ACCOUNT_LENGTH || !account.startsWith(ACCOUNT_PREFIX)) throw new Error('xno-account-invalid');
  const encodedKey = account.slice(ACCOUNT_PREFIX.length, ACCOUNT_PREFIX.length + 52);
  const encodedChecksum = account.slice(-8);
  const keyInteger = base32Decode(encodedKey);
  if (keyInteger >> 256n) throw new Error('xno-account-invalid');
  const publicKey = assertNanoPublicKey(integerToBytesBE(keyInteger, 32));
  const checksumInteger = base32Decode(encodedChecksum);
  const receivedChecksum = integerToBytesBE(checksumInteger, 5);
  const expectedChecksum = blake2b(publicKey, { dkLen: 5 }).reverse();
  if (receivedChecksum.some((value, index) => value !== expectedChecksum[index])) throw new Error('xno-account-checksum-invalid');
  return publicKey;
}

const Point = ed25519.Point;
const Fn = Point.Fn;

/**
 * Property's experimental FROST suite for Nano-compatible Ed25519+BLAKE2b signatures.
 * FROST's transcript and nonce hashes stay domain-separated SHA-512; only EdDSA's
 * final challenge uses Nano's BLAKE2b-512(R || A || message) rule.
 */
const nanoFrostInternal = createFROST({
  name: 'PROPERTY-FROST-ED25519-BLAKE2B-EXPERIMENTAL-v1',
  Point,
  validatePoint(point) {
    point.assertValidity();
    if (!point.isTorsionFree()) throw new Error('xno-threshold-point-not-prime-order');
  },
  hash: sha512,
  challenge(R, publicKey, message) {
    const digest = blake2b(concatBytes(R.toBytes(), publicKey.toBytes(), bytes(message, 'xno-message', message.length)), { dkLen: 64 });
    return Fn.create(bytesToNumberLE(digest));
  },
});

const nanoFrostDkg = Object.freeze({
  round1(nostrPublicKey, signers) {
    if (!signers || signers.min !== 2 || signers.max !== 3 || Object.keys(signers).some(key => !['min', 'max'].includes(key))) {
      throw new Error('xno-threshold-configuration-unsupported');
    }
    return nanoFrostInternal.DKG.round1(nanoThresholdIdentifier(nostrPublicKey), { min: 2, max: 3 });
  },
  round2: nanoFrostInternal.DKG.round2,
  round3: nanoFrostInternal.DKG.round3,
  clean: nanoFrostInternal.DKG.clean,
});

const activeNoncePackages = new WeakMap();
function copyCommitments(commitments) {
  return Object.freeze({
    identifier: commitments.identifier,
    hiding: new Uint8Array(commitments.hiding),
    binding: new Uint8Array(commitments.binding),
  });
}

// Deliberately omit trustedDealer, combineSecret, raw-key signing, and generic
// scalar/polynomial helpers so the public API cannot reconstruct a group key.
// Secret nonces stay behind a one-shot in-memory ticket and are wiped after use.
export const nanoThresholdFrost = Object.freeze({
  DKG: nanoFrostDkg,
  validateSecret: nanoFrostInternal.validateSecret,
  commit(secret) {
    const generated = nanoFrostInternal.commit(secret);
    const ticket = Object.freeze({ commitments: copyCommitments(generated.commitments) });
    activeNoncePackages.set(ticket, generated.nonces);
    return ticket;
  },
  signShare(secret, publicPackage, ticket, commitmentList, message) {
    const nonces = activeNoncePackages.get(ticket);
    if (!nonces) throw new Error('xno-threshold-nonce-missing-or-used');
    activeNoncePackages.delete(ticket);
    try {
      return nanoFrostInternal.signShare(secret, publicPackage, nonces, commitmentList, message);
    } finally {
      nonces.hiding.fill(0);
      nonces.binding.fill(0);
    }
  },
  verifyShare: nanoFrostInternal.verifyShare,
  aggregate: nanoFrostInternal.aggregate,
  verify: nanoFrostInternal.verify,
});

export function nanoThresholdIdentifier(nostrPublicKey) {
  if (typeof nostrPublicKey !== 'string' || !/^[0-9a-f]{64}$/i.test(nostrPublicKey)) throw new Error('xno-threshold-participant-invalid');
  return nanoFrostInternal.Identifier.derive(`property-xno-threshold:${nostrPublicKey.toLowerCase()}`);
}

export function verifyNanoThresholdSignature(signatureValue, messageValue, publicKeyValue) {
  const signature = bytes(signatureValue, 'xno-threshold-signature', 64);
  const message = messageValue instanceof Uint8Array ? new Uint8Array(messageValue) : null;
  if (!message) throw new TypeError('xno-message-invalid');
  const publicKey = bytes(publicKeyValue, 'xno-public-key', 32);
  try {
    return nanoThresholdFrost.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function encodeThresholdBytes(value) {
  if (value instanceof Uint8Array) return { $bytes: toHex(value) };
  if (Array.isArray(value)) return value.map(encodeThresholdBytes);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeThresholdBytes(child)]));
  }
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  return value;
}

export function decodeThresholdBytes(value) {
  if (Array.isArray(value)) return value.map(decodeThresholdBytes);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$bytes === 'string' && /^(?:[0-9a-f]{2})*$/i.test(value.$bytes)) return fromHex(value.$bytes);
    if (Object.keys(value).length === 1 && typeof value.$bigint === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value.$bigint)) return BigInt(value.$bigint);
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decodeThresholdBytes(child)]));
  }
  return value;
}
