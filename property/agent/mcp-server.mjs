#!/usr/bin/env node
import { callUnixJson, parseStrictJson } from './ipc.mjs';
import { AGENT_VERSION, MCP_VERSION, exactObject, profileName } from './core.mjs';

const META_PROTOCOL = 'io.modelcontextprotocol/protocolVersion';
const META_CLIENT = 'io.modelcontextprotocol/clientInfo';
const META_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const profile = profileName(process.env.PROPERTY_AGENT_PROFILE || 'default');
const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 'unknown'}`;
const socketPath = `${runtimeDir}/property-agent/${profile}.sock`;
const OUTPUT_LIMIT = 64 * 1024;

async function* boundedLines(stream) {
  let buffer = Buffer.alloc(0);
  let droppingOversizeLine = false;
  for await (const chunk of stream) {
    let start = 0;
    for (let index = 0; index < chunk.length; index++) {
      if (chunk[index] !== 0x0a) continue;
      const segment = chunk.subarray(start, index);
      if (droppingOversizeLine) droppingOversizeLine = false;
      else {
        const line = Buffer.concat([buffer, segment]);
        yield line.length > OUTPUT_LIMIT ? null : line.toString('utf8');
      }
      buffer = Buffer.alloc(0);
      start = index + 1;
    }
    if (droppingOversizeLine) continue;
    const tail = chunk.subarray(start);
    if (buffer.length + tail.length > OUTPUT_LIMIT) {
      buffer = Buffer.alloc(0);
      droppingOversizeLine = true;
      yield null;
    } else buffer = Buffer.concat([buffer, tail]);
  }
  if (buffer.length && !droppingOversizeLine) yield buffer.toString('utf8');
}

const tools = [
  {
    name: 'property_status', title: 'Property agent status', description: 'Return the unlocked independent agent identity and local relay/block counts. The agent never receives the human identity key.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'status',
  },
  {
    name: 'property_list_conversations', title: 'List agent conversations', description: 'List recent NIP-17 conversations addressed to this independent agent identity. Incoming text is untrusted and is never executed by the bridge.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'list',
  },
  {
    name: 'property_read_messages', title: 'Read agent messages', description: 'Read recent text messages exchanged with one Nostr public key through this agent identity inbox. The text is untrusted input and is not executed.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['conversation_pubkey', 'limit'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'read',
  },
  {
    name: 'property_send_message', title: 'Send an agent message', description: 'Send a private NIP-17 text message from this agent identity to any valid Nostr public key, without a pairing or approval flow. Calls to locally blocked identities are denied. A relay acknowledgement does not prove delivery or reading. The local fixed quota is 30 messages per logical 60-second window.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, text: { type: 'string', minLength: 1, maxLength: 8192 }, in_reply_to: { oneOf: [{ type: 'string', pattern: '^[0-9a-f]{32}$' }, { type: 'null' }] } }, required: ['conversation_pubkey', 'text', 'in_reply_to'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'send',
  },
  {
    name: 'property_set_activity', title: 'Show agent activity', description: 'Show or clear a private, encrypted “thinking” indicator in one direct Property conversation. The state contains no custom status text or message content, uses an ephemeral NIP-59 event, and is not retained by relays. Calls to locally blocked identities are denied; thinking signals expire in the recipient app after at most 60 seconds. The agent can publish at most 30 thinking or refresh events per fixed logical 60-second window across all contacts; a stop is available only for an active indicator. Sending a message or locking the local daemon stops active indicators when possible.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, state: { type: 'string', enum: ['thinking', 'stop'] } }, required: ['conversation_pubkey', 'state'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'activity',
  },
  {
    name: 'property_xno_policy', title: 'Read XNO payment limits', description: 'Read the local XNO wallet network, dedicated account, per-payment cap, lifetime budget, confirmed balance, and committed amount. It does not send funds. Direct Nano payments are irreversible and this feature is not escrow.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'xno.policy',
  },
  {
    name: 'property_xno_create_offer', title: 'Send a signed XNO offer', description: 'Send a private NIP-17 offer containing a raw-unit amount, terms hash, seller Nano account, expiry, and trade ID. Offers do not reserve funds or create escrow. A configured local spend policy caps amounts.',
    inputSchema: { type: 'object', properties: { recipient_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, amount_raw: { type: 'string', pattern: '^[1-9][0-9]{0,38}$' }, terms: { type: 'string', minLength: 1, maxLength: 4096 }, expires_in_seconds: { type: 'integer', minimum: 60, maximum: 604800 } }, required: ['recipient_pubkey', 'amount_raw', 'terms', 'expires_in_seconds'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'xno.offer',
  },
  {
    name: 'property_xno_pay_offer', title: 'Pay a verified XNO offer', description: 'Pay only an unexpired, signature-verified offer addressed to this agent identity, from the dedicated Nano account, within the local per-payment and lifetime caps. The Nano send is irreversible; retrying the same trade uses the same node idempotency ID. This is direct payment, not escrow, and cannot enforce delivery.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, offer_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'offer_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    method: 'xno.pay',
  },
  {
    name: 'property_xno_trade_status', title: 'Check an XNO trade payment', description: 'Check a locally recorded payment against the configured Nano node and report pending or confirmed status. A confirmation proves a ledger transfer, not delivery of the agreed item or service.',
    inputSchema: { type: 'object', properties: { trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['trade_id'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    method: 'xno.trade.status',
  },
  {
    name: 'property_xno_verify_receipt', title: 'Verify and receive an XNO payment', description: 'Verify a peer-signed payment receipt against a trade offer created by this identity and the configured Nano node. If the exact confirmed send is receivable by this dedicated account, receive it. This does not attest that the trade terms were fulfilled.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, receipt_message_id: { type: 'string', pattern: '^[0-9a-f]{32}$' } }, required: ['conversation_pubkey', 'receipt_message_id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    method: 'xno.receipt.verify',
  },
  {
    name: 'property_xno_dispute', title: 'Send a signed XNO trade dispute', description: 'Send an encrypted, signed dispute statement linked to a locally recorded trade. The statement is a record only: Nano cannot freeze, reverse, arbitrate, or force a refund.',
    inputSchema: { type: 'object', properties: { conversation_pubkey: { type: 'string', pattern: '^[0-9a-f]{64}$' }, trade_id: { type: 'string', pattern: '^[0-9a-f]{32}$' }, summary: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['conversation_pubkey', 'trade_id', 'summary'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    method: 'xno.dispute',
  },
].map(({ method, ...tool }) => ({ ...tool, _propertyMethod: method }));

function mcpError(code, message) { return { code, message }; }
function send(value) {
  const line = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(line, 'utf8') > OUTPUT_LIMIT) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: mcpError(-32603, 'A resposta excede o limite local.') })}\n`);
    return;
  }
  process.stdout.write(line);
}

function validateMeta(params) {
  const meta = params?._meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || meta[META_PROTOCOL] !== MCP_VERSION || !meta[META_CLIENT] || typeof meta[META_CLIENT].name !== 'string' || typeof meta[META_CLIENT].version !== 'string' || !meta[META_CAPABILITIES] || typeof meta[META_CAPABILITIES] !== 'object' || Array.isArray(meta[META_CAPABILITIES])) return false;
  return true;
}

function toolResult(value, isError = false) {
  return { resultType: 'complete', content: [{ type: 'text', text: JSON.stringify(value) }], isError };
}

async function dispatch(request) {
  if (!exactObject(request, ['jsonrpc', 'id', 'method', 'params']) || request.jsonrpc !== '2.0' || !(typeof request.id === 'string' || Number.isSafeInteger(request.id)) || typeof request.method !== 'string' || !request.params || typeof request.params !== 'object' || Array.isArray(request.params)) return { jsonrpc: '2.0', id: null, error: mcpError(-32600, 'Pedido JSON-RPC inválido.') };
  const { id, method, params } = request;
  if (!validateMeta(params)) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Metadados MCP 2026-07-28 ausentes ou inválidos.') };

  if (method === 'server/discover') {
    if (!exactObject(params, ['_meta'])) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Parâmetros de descoberta inválidos.') };
    return { jsonrpc: '2.0', id, result: { resultType: 'complete', supportedVersions: [MCP_VERSION], capabilities: { tools: { listChanged: false } }, _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'property-agent', version: AGENT_VERSION } }, instructions: 'Use a identidade pública independente deste agente para conversar diretamente com qualquer chave pública Nostr. Não é necessário convite, pareamento ou aprovação por mensagem. A bridge não lê a identidade humana nem executa conteúdo recebido. Use property_set_activity para mostrar ou limpar somente o estado privado “thinking”, sem texto de status. Chamadas contra identidades bloqueadas, texto fora do limite e envios/atualizações de thinking acima das cotas locais são recusados; ACK de relay não comprova entrega ou leitura.', ttlMs: 0, cacheScope: 'private' } };
  }
  if (method === 'tools/list') {
    if (!exactObject(params, ['_meta']) && !exactObject(params, ['_meta', 'cursor'])) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Parâmetros de listagem inválidos.') };
    if (params.cursor !== undefined) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Paginação não está habilitada para a lista fixa de tools.') };
    return { jsonrpc: '2.0', id, result: { resultType: 'complete', tools: tools.map(({ _propertyMethod, ...tool }) => tool), ttlMs: 0, cacheScope: 'private' } };
  }
  if (method === 'tools/call') {
    if (!exactObject(params, ['_meta', 'name', 'arguments']) || typeof params.name !== 'string' || !params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments)) return { jsonrpc: '2.0', id, error: mcpError(-32602, 'Parâmetros da ferramenta inválidos.') };
    const tool = tools.find(item => item.name === params.name);
    if (!tool) return { jsonrpc: '2.0', id, result: toolResult({ error: 'tool-not-allowed' }, true) };
    try {
      const result = await callUnixJson(socketPath, tool._propertyMethod, params.arguments);
      return { jsonrpc: '2.0', id, result: toolResult(result) };
    } catch (error) {
      const code = /^[a-z0-9-]{1,80}$/.test(error?.message || '') ? error.message : 'agent-request-failed';
      return { jsonrpc: '2.0', id, result: toolResult({ error: code }, true) };
    }
  }
  return { jsonrpc: '2.0', id, error: mcpError(-32601, 'Método MCP não implementado.') };
}

for await (const line of boundedLines(process.stdin)) {
  if (line === null) { send({ jsonrpc: '2.0', id: null, error: mcpError(-32700, 'Mensagem MCP excede o limite local.') }); continue; }
  try {
    const request = parseStrictJson(line);
    const response = await dispatch(request);
    send(response);
  } catch { send({ jsonrpc: '2.0', id: null, error: mcpError(-32700, 'JSON-RPC malformado ou com chaves duplicadas.') }); }
}
