# Segurança do Property

**Português (Brasil)** · [English](SECURITY.md)

O Property lida com chaves Nostr locais, eventos assinados, mensagens privadas e um relay de PC. A branch em desenvolvimento é `modelo-mvp`; ainda não há uma versão estável auditada nem garantia de resposta em um prazo fixo.

## Relatar uma vulnerabilidade em privado

Use **[Report a vulnerability no Property](https://github.com/coercaodobem/property/security/advisories/new)**. O relato é privado e chega aos mantenedores deste repositório. Esse canal não é o repositório Amethyst.

Não publique detalhes exploráveis em issues ou pull requests. Se o canal privado estiver temporariamente indisponível, abra apenas uma issue pedindo um canal de contato seguro, sem provas de exploração, segredos ou dados de usuários.

## O que informar

- Commit, versão, navegador/sistema operacional e componente afetado.
- Impacto provável: exposição de chaves, confidencialidade, integridade ou disponibilidade.
- Passos de reprodução com dados sintéticos e, se possível, um teste mínimo.
- Condições necessárias para a exploração e possíveis medidas de correção.

Nunca inclua senha, chave privada Nostr/Nano, token, backup pessoal ou conversa real. Identidades descartáveis e dados de teste são suficientes para reproduzir o problema.

## Escopo e estado de validação

Estão no escopo a PWA, seu cofre local, assinatura e roteamento de eventos, ponte entre relays, dependências empacotadas e o launcher/pacote do relay distribuído neste repositório. Problemas encontrados nos módulos herdados presentes aqui também podem ser relatados; a relação com upstream será avaliada sem divulgar detalhes prematuramente.

Correções serão preparadas na branch de desenvolvimento. Não prometemos suporte a versões antigas, backports ou SLAs de triagem. O [plano de testes](property/docs/plano-de-testes-central.pt-BR.md) registra os gates ainda pendentes, incluindo revisão independente de segurança. Pagamentos automáticos XNO e seus fluxos de aceite/reembolso não estão implementados.

Pesquise somente em contas, relays e dados próprios ou com autorização explícita. Coordene a divulgação com os mantenedores e evite acessar dados de terceiros. Vulnerabilidades em outros projetos ou relays devem ser comunicadas aos responsáveis correspondentes.
