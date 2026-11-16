# Resultado do gate G4 — comunicação direta, recuperação de relays e PWA

**Resultado: PASS — automatizado/offline em Ubuntu Linux x86_64.** Candidato de fonte congelado: [`4e1b231ccd190af569dd2890022dd4e8d053fcc8`](https://github.com/coercaodobem/property/commit/4e1b231ccd190af569dd2890022dd4e8d053fcc8).

Passaram todas as 35 famílias fixas de casos: cinco de entrega de mensagens, seis da matriz de relays isolados e 24 do navegador/PWA. Seis identidades sintéticas usaram cinco relays isolados em três grupos. A matriz entregou 1.500 mensagens privadas e 100 eventos públicos; exercitou 40 transições de partição, 20 atualizações conflitantes de perfil/oferta, duas reinicializações por relay, 20 tentativas de repetição e 10 fixtures por categoria de falha. Verificou resolução determinística de conflitos após reconexão, retenção/deduplicação, preservação de assinaturas, descriptografia autorizada e ausência de recibos fabricados.

A PWA em cache abriu 10 vezes após a remoção do host da aplicação com todos os relays offline e, em seguida, 10 vezes com apenas um relay loopback disponível. O navegador fez zero solicitações externas e todos os destinos WebSocket eram loopback. Todos os checksums de `SHA256SUMS` foram verificados. As capturas responsivas são viewports de navegador Linux, não testes em celulares ou outros sistemas operacionais.

Relatórios, digests das fontes e capturas estão em [`fixed-run-10/`](fixed-run-10/). Foram usadas apenas identidades sintéticas e relays locais; nenhum relay público ou fundo foi usado.
