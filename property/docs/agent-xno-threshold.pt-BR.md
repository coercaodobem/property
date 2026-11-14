# Núcleo experimental de assinatura de limiar para Nano

[English](agent-xno-threshold.md) · **Português (Brasil)**

O Property agora inclui um núcleo FROST experimental e local, capaz de gerar uma chave distribuída 2-de-3 e produzir uma assinatura Ed25519+BLAKE2b de 64 bytes no formato usado pelo Nano. As APIs de DKG e assinatura ficam em `property/agent/xno-threshold.mjs`; o código criptográfico vendorizado tem versão fixada e está incluído no repositório, sem baixar código durante instalação.

## O que o primitivo faz

- Três participantes podem executar uma geração distribuída de chave. Nenhum custodiante confiável cria ou vê a chave privada completa do grupo.
- Cada participante mantém uma parte de assinatura. Duas partes válidas podem ser combinadas na assinatura de 64 bytes usada por blocos de estado Nano.
- A chave pública do grupo pode ser codificada como uma conta `nano_` comum. Os nós Nano continuam vendo uma conta e assinatura normais; não é preciso alterar protocolo ou consenso.
- O desafio EdDSA final calcula BLAKE2b-512 de `R || A || mensagem`. As hashes de transcript separadas do FROST usam SHA-512 com separação de domínio.
- Os IDs dos participantes podem derivar das chaves públicas Nostr. As mensagens da rodada 2 do DKG contêm partes privadas e devem ser entregues por mensagens autenticadas e cifradas ponta a ponta.
- O wrapper do Property expõe somente operações DKG e assinatura limiar fixas 2-de-3. Ele omite geração por custodiante confiável e utilitários para reconstruir a chave privada. Nonces e partes de chave usam o gerador criptográfico aleatório do runtime.
- Cada compromisso de assinatura é representado por um ticket em memória de uso único. O nonce secreto fica oculto, é consumido na primeira tentativa de assinatura e seus buffers de bytes são zerados depois. Uma queda ou reinicialização abandona aquela tentativa; persistência e recuperação cifradas ainda não existem.

Isso é uma **assinatura de limiar**, não uma conta multisig por script. Se dois dos três participantes se aliarem, podem gastar; o limiar 2-de-3 não impede seu próprio quórum. Perder ou deixar indisponíveis participantes suficientes pode tornar os fundos impossíveis de movimentar. O árbitro é um dos titulares de chave, então as partes devem escolher esse arranjo de confiança conscientemente.

## Escopo e limites de segurança

O núcleo criptográfico ainda não está ligado à liquidação do escrow atual do Property Agent. Esse fluxo continua custodial: a carteira Nano configurada assina e envia os pagamentos. Ainda faltam a orquestração autenticada de mensagens DKG/assinatura via Nostr, armazenamento cifrado e recuperação das partes, construção da transação, exibição/aprovação dos campos exatos da liquidação, assinatura limiar do bloco e publicação do bloco assinado em um nó Nano.

O smoke test offline verifica um cenário fixo de DKG/assinatura 2-de-3 com participantes sintéticos, rejeição de mensagem adulterada e codificação de conta Nano. Ele não prova que um nó Nano aceite a assinatura nem que um escrow comercial seja sem custódia. A nova suíte Nano do ciphersuite ainda não passou por auditoria criptográfica independente. Não use fundos reais nem descreva o escrow atual como multisig até passar pelas etapas de integração e revisão.

Execute a verificação local focada na raiz do repositório:

```bash
node property/tests/agent-xno-threshold-smoke.mjs
```

Referências: [formato de assinatura Ed25519+BLAKE2b do Nano](https://docs.nano.org/integration-guides/the-basics/), [assinatura e hash no Nano](https://docs.nano.org/protocol-design/signing-hashing-and-key-derivation/) e [FROST RFC 9591](https://www.rfc-editor.org/rfc/rfc9591.html).
