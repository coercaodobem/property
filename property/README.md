# Property

<p align="center">
  <img src="web/assets/property-brand.png" alt="Identidade visual do Property" width="320">
</p>

Cliente Nostr com interface PWA, identidade criada e protegida localmente, mensagens privadas NIP-17 e conexão direta com relays. Esta pasta reúne o app web, os comandos de relay para Linux, Windows e macOS Apple Silicon e a documentação de adaptação do Amethyst.

## Estado da branch `modelo-mvp`

O código upstream usado como base está registrado no commit `948135f7dbbae81d79a0b985282ce673397a7618` do Amethyst. O módulo `geode` é reaproveitado como relay standalone. A interface web usa o pacote local e versionado `nostr-tools` 2.25.2 (Unlicense), porque o Quartz KMP upstream não publica um target JavaScript/WASM. Não há carregamento de scripts executáveis de CDN em runtime.

## Abrir a PWA

Sirva `property/web` por HTTP(S), por exemplo com `python3 -m http.server 8080 --directory property/web`, e acesse `http://localhost:8080`. Para instalar como PWA, o host deve usar HTTPS (localhost é exceção). O shell funciona offline depois da primeira carga; comunicação depende de relays Nostr alcançáveis.

A opção **Ponte entre relays** encaminha eventos públicos assinados entre os relays que a pessoa selecionou. Gift wraps NIP-17 só são encaminhados para os inbox relays da própria identidade; o cliente não decifra o conteúdo para retransmiti-lo. Há limites locais de 60 eventos por minuto e 2 MB de tráfego de saída por minuto, contando o envio a cada relay. A ponte não funciona quando o navegador é suspenso e pode consumir dados móveis.

## Publicar no GitHub Pages

O app está publicado em [coercaodobem.github.io/property](https://coercaodobem.github.io/property/), a partir do repositório público `coercaodobem/property`. O workflow `.github/workflows/property-pages.yml` publica somente `property/web` quando esses arquivos ou o próprio workflow mudam na branch `modelo-mvp`; também aceita execução manual. Pages usa a origem **GitHub Actions**, e o ambiente `github-pages` permite a branch `modelo-mvp`. O workflow usa actions fixadas por commit SHA e não altera a configuração do repositório.

A publicação sob o nome anterior em 2026-10-30 foi validada pelo workflow [41130981007](https://github.com/coercaodobem/property/actions/runs/41130981007), pela abertura da tela inicial no navegador e pela comparação SHA-256 dos 16 arquivos públicos com o commit `e525f3028391cea6133fe7982b4e342ee576f449`. Consulte o [registro de validação](docs/evidence/pages-2026-10-30.json). Isso não encerra os demais gates do plano de testes.

## Iniciar um relay no Ubuntu

Na raiz do checkout, execute:

```bash
./property/relay/start.sh
```

O script usa armazenamento persistente em `~/.local/share/property-relay` e por padrão escuta somente em `127.0.0.1:7447`. O pacote portátil incluído na branch contém o relay e seu runtime Java em segmentos; na primeira execução, o script remonta o tarball, valida o hash e extrai os arquivos para o diretório do usuário. Isso é adequado para teste local; para acesso público, configure conscientemente endereço, TLS, firewall e armazenamento.

Com Node.js 22 instalado, `bash property/tests/run-smoke.sh` executa os testes locais sem abrir portas. `bash property/tests/run-bridge-integration.sh [porta-origem] [porta-destino]` inicia dois relays isolados em `127.0.0.1`, testa replicação/NIP-17/NIP-15 e remove os diretórios temporários ao terminar. O perfil offline completo usa manifesto, isolamento e as contagens fixas de G11-03 definidas no [plano de testes](docs/plano-de-testes-central.md); o ensaio por duração não é critério de aprovação.

## Limites conhecidos

- Uma PWA não permanece ativa em segundo plano no celular: iOS e Android podem suspender ou encerrar o navegador.
- O host estático entrega o código da interface; as conexões de dados são abertas pelo cliente aos relays escolhidos.
- A opção de manter a sessão neste aparelho prioriza conveniência e reduz a proteção contra alguém que obtenha acesso ao navegador desbloqueado.
- Hangout e marketplace estão em estágio inicial; pagamentos, custódia, escrow e monetização automática de nodes não são ativados nesta versão.
- A exibição opcional de campanhas valida a assinatura e os campos do evento, usa link HTTPS e mantém imagem inline. O pagamento BTC/XMR/XNO declarado pelo node não é verificado pelo cliente; a engine de aceite, recebimento e reembolso não existe nesta versão.

Consulte `docs/plano-central.md`, `docs/identidade-do-projeto.md`, `docs/plano-de-testes-central.md`, o [plano de comunicação entre agentes](docs/plano-agentes-human-first.md) e as [decisões do G0 sobre agentes](docs/agent-messaging-g0.md) para as decisões e critérios completos.

Para instalar um agente local por MCP no Ubuntu/Linux, consulte o [guia do Property Agent](agent/README.md). Agentes enviam mensagens diretamente a chaves públicas válidas, sem convite, pareamento ou aprovação do Property; a pessoa pode bloquear uma identidade localmente. O bridge ainda não foi validado com hosts comerciais e não anuncia compatibilidade A2A.

## Continuidade de dados e pagamentos

Consulte [migração para Property](docs/migracao-property.md) para dados e instalações existentes, e [pagamentos BTC/XMR/XNO](docs/pagamentos.md) para esquema de valores e limitações.

## Validação Property de 2026-10-31

O commit `31956a60c485d77629cc6e549026822d05a7ae56` passou no [CI com 12 suítes e três sistemas nativos](https://github.com/coercaodobem/property/actions/runs/41186913676) e no [Pages](https://github.com/coercaodobem/property/actions/runs/41186913639). A URL principal mostrou Property e as opções BTC/XMR/XNO; nenhum erro/aviso no console. Os 17 arquivos públicos e o HTML da raiz corresponderam aos hashes da fonte. Registros: [publicação](docs/evidence/pages-property-2026-10-31.json) e [plataformas](docs/evidence/native-platforms-2026-10-31.json). Isso não comprova checkout, liquidação financeira, o G11-03 atual por contagens fixas ou dispositivos móveis reais.
