import { createInterface } from 'node:readline';

const MAX_LINE_BYTES = 64 * 1024;

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }

function exactParams(value, required, optional = []) {
  if (!object(value)) throw new Error('invalid-params');
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error('invalid-params');
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error('invalid-params');
  return value;
}

export function createCampaignOperator(engine) {
  const methods = {
    'campaign/inspect': async params => engine.inspect(exactParams(params, ['offer_event']).offer_event),
    'campaign/accept': async params => {
      const value = exactParams(params, ['offer_event'], ['publication_scope']);
      return engine.accept(value.offer_event, { publicationScope: value.publication_scope });
    },
    'campaign/reject': async params => engine.reject(exactParams(params, ['offer_event']).offer_event),
    'campaign/list': async params => { exactParams(params, []); return engine.list(); },
    'campaign/reconcile': async params => engine.reconcile(exactParams(params, ['campaign_id']).campaign_id),
    'campaign/refund': async params => engine.refund(exactParams(params, ['refund_event']).refund_event),
    'campaign/set-publication-scope': async params => {
      const value = exactParams(params, ['campaign_id', 'scope']);
      return engine.setPublicationScope(value.campaign_id, value.scope);
    },
    'campaign/export-accounting': async params => { exactParams(params, []); return engine.exportAccounting(); },
    'campaign/prune-terminal': async params => {
      const value = exactParams(params, ['before_epoch_seconds']);
      return engine.pruneTerminal({ beforeEpochSeconds: value.before_epoch_seconds });
    },
  };

  return Object.freeze({
    dispatch: async request => {
      const id = request?.id ?? null;
      if (!object(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' ||
          (request.id !== undefined && !['string', 'number'].includes(typeof request.id))) {
        return { jsonrpc: '2.0', id, error: { code: -32600, message: 'invalid-request' } };
      }
      const method = methods[request.method];
      if (!method) return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method-not-found' } };
      if (request.id === undefined) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'notifications-not-supported' } };
      try {
        return { jsonrpc: '2.0', id, result: await method(request.params ?? {}) };
      } catch (error) {
        const invalid = error?.message === 'invalid-params';
        return { jsonrpc: '2.0', id, error: { code: invalid ? -32602 : -32000,
          message: invalid ? 'invalid-params' : 'campaign-operation-failed' } };
      }
    },
    toolNames: Object.freeze(Object.keys(methods)),
  });
}

export async function runCampaignOperatorStdio(operator, { input = process.stdin, output = process.stdout,
  maxLineBytes = MAX_LINE_BYTES } = {}) {
  if (!operator || typeof operator.dispatch !== 'function' || !Number.isSafeInteger(maxLineBytes) || maxLineBytes < 256) {
    throw new TypeError('Campaign operator stdio requires a local operator and a valid frame limit.');
  }
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (Buffer.byteLength(line, 'utf8') > maxLineBytes) {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'message-too-large' } })}\n`);
      continue;
    }
    let request;
    try { request = JSON.parse(line); }
    catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse-error' } })}\n`);
      continue;
    }
    const response = await operator.dispatch(request);
    output.write(`${JSON.stringify(response)}\n`);
  }
}
