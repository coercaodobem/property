# Snapshots de protocolos para comunicação entre agentes

**Capturados em:** 2026-11-03  
**Uso:** referência de desenvolvimento e revisão; nenhum destes arquivos é carregado pela PWA ou pelo relay em runtime.

Cada cópia abaixo foi obtida do arquivo indicado no commit fixo e conferida localmente pelo SHA-1 de blob do GitHub e pelo SHA-256. Para repetir a conferência, execute `node property/tests/agent-messaging-g0-smoke.mjs`.

## Nostr Implementation Possibilities

Repositório: [nostr-protocol/nips](https://github.com/nostr-protocol/nips)  
Commit revisto: [400d157c53264b8e58c7b3cdbd21ef546fb7a157](https://github.com/nostr-protocol/nips/commit/400d157c53264b8e58c7b3cdbd21ef546fb7a157).  
O README dessa revisão declara que todas as NIPs são de domínio público.

| Cópia local | Fonte | Blob GitHub | SHA-256 | Decisão |
|---|---|---|---|---|
| [17.md](nostr/17.md) | [17.md](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/17.md) | `23fde73a4cf28f120523cd278037f0b8e4d4f84a` | `7aa9c3a9c0458a9552c4be2f3bf17f7ec60a4afe88bce7977f03500a7873a64c` | Adotar como transporte privado do MVP; draft, sujeito a revisão de conformidade. |
| [44.md](nostr/44.md) | [44.md](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/44.md) | `47b89906fc1a9d1685028104cebf81b4cc7044e9` | `b5f89374e4e1dbdee7881e8573b4313b6a89430a9c8d518471599ae0660cf0e2` | Reusar NIP-44 versão 2 por meio da implementação existente; não criar criptografia própria. |
| [59.md](nostr/59.md) | [59.md](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/59.md) | `c831e10ee47286b9af42d11c733b42b66a30461f` | `b46b078ff5b219fd4ab33a53b479b49d4cbd604b88be46d6b978d53d8f8b43a0` | Reusar gift wrapping NIP-59 por meio da implementação existente. |
| [89.md](nostr/89.md) | [89.md](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/89.md) | `3feafc5fac929fb8ff86c84304641bfc8a2118cc` | `700b1b3706e423f590eb381d21fc2be61b29304ddcbfe398dcd7525056913396` | Não usar para pareamento: descreve recomendação de aplicações que tratam kinds, não prova identidade de agente. |
| [90.md](nostr/90.md) | [90.md](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/90.md) | `a6ea3bcdfb912aa010f2c70815dec4a86fe435ca` | `a82714bac7563cecf7cdb17e83dc60ebea25d06159e826b3bde9c361c28414bb` | Rejeitar para chat 1:1; o texto desta revisão marca NIP-90 como `draft` e `unrecommended`. |

## Model Context Protocol

Repositório: [modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol)  
Commit revisto: [3c4d91b7e832d9b74338d56eed03403ccc662123](https://github.com/modelcontextprotocol/modelcontextprotocol/commit/3c4d91b7e832d9b74338d56eed03403ccc662123).  
A licença desse commit registra as especificações como Apache-2.0 e a documentação fora das especificações como CC-BY-4.0. [LICENSE reproduzida](mcp/LICENSE.md).

| Cópia local | Fonte fixada | Blob GitHub | SHA-256 | Licença/origem |
|---|---|---|---|---|
| [stdio.mdx](mcp/stdio.mdx) | [stdio](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/3c4d91b7e832d9b74338d56eed03403ccc662123/docs/specification/2026-07-28/basic/transports/stdio.mdx) | `b03ac10081d7a7a92516b5b074e4c843bc75d473` | `6fd49766c40dc093d1f5993ab584bad0a06cbb496c2d3019c50f8fe3c8171e57` | Apache-2.0; especificação. |
| [tools.mdx](mcp/tools.mdx) | [tools](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/3c4d91b7e832d9b74338d56eed03403ccc662123/docs/specification/2026-07-28/server/tools.mdx) | `7813b8c37b83198289fd816063b1e6d3bc727315` | `65ae4ba35373803023b5dedbe3b7b5726f84acc8391ad6ef64386b4fbec46abf` | Apache-2.0; especificação. |
| [discover.mdx](mcp/discover.mdx) | [server/discover](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/3c4d91b7e832d9b74338d56eed03403ccc662123/docs/specification/2026-07-28/server/discover.mdx) | `f6fc1acf974819d99338d2be25ad953fcb9e57a6` | `3fe1f5b5f1528014216b1e49cc3363b3c689c36bcb80a6957ddca6a04cea409c` | Apache-2.0; especificação. |
| [security_best_practices.mdx](mcp/security_best_practices.mdx) | [security best practices](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/3c4d91b7e832d9b74338d56eed03403ccc662123/docs/docs/2026-07-28/tutorials/security/security_best_practices.mdx) | `fd302d767c2eaefa49559d60af77282cbb22b5e5` | `af9bff2dab1b05f2f6df00156fe0a1154e5db874c08153f77cec569d07c0542e` | CC-BY-4.0; documentação, com atribuição ao projeto MCP. |
| [LICENSE.md](mcp/LICENSE.md) | [LICENSE](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/3c4d91b7e832d9b74338d56eed03403ccc662123/LICENSE) | `4a93985763241755401a10678395303de4e720ba` | `0382b0057770ca05e9c350a50aa3b1c1fea84da0bc81d723bf00b9aa841be58a` | Cópia da licença e transição de licenciamento upstream. |

## Revisões avaliadas e não incorporadas

- **NIP-89:** revisada no mesmo commit acima; não serve como prova de identidade nem pareamento, por isso não é adotada.
- **NIP-90:** revisada no mesmo commit; não é transporte de conversa e está marcada como não recomendada no snapshot.
- **A2A:** versão publicada consultada: **0.3.0**, em <https://a2a-protocol.org/v0.3.0/specification/>. Não há interoperabilidade A2A no primeiro MVP. O protocolo oferece semântica de agentes/tarefas e bindings próprios; não é um perfil de NIP-17 nem uma interface de ferramenta local. Reavaliar somente com prova entre implementações independentes.

O conteúdo copiado nesta pasta é documentação de referência. A aplicação e os executáveis não consultam essas páginas nem baixam código ou especificações durante o uso.
