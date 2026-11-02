# Pacotes Property para Windows e macOS

## Origem

Os 49 JARs vêm do pacote Geode 1.20.0 já incluído e fixado pelo SHA-256 `9722c226dc59c45d50f9f8c1e22ad815fd6fb971413c7da3aa7fc36253e6d1a7`. Não houve recompilação ou troca desses JARs. Cada manifesto registra o hash individual das bibliotecas; os dois pacotes devem apresentar o mesmo inventário.

Os runtimes são Eclipse Temurin 21.0.13+9, da [release oficial Adoptium](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.13%2B9):

| Alvo | Arquivo original | SHA-256 original |
|---|---|---|
| Windows x64 | OpenJDK21U-jre_x64_windows_hotspot_21.0.13_9.zip | `2332c0b4cff6bed722da3567c91d5e47568bcba863fa4945d0a8d6fc76158628` |
| macOS arm64 | OpenJDK21U-jre_aarch64_mac_hotspot_21.0.13_9.tar.gz | `225bab0a09491ef06835488cd942f5d2befa9a0410a2484f0c8bbcf7506ec09a` |

Os hashes foram comparados com o digest publicado nos assets GitHub da origem oficial e com os bytes baixados. Isso comprova correspondência à origem escolhida, não uma auditoria de segurança do Java/Geode. Arquivos de licença e diretórios `legal` do runtime são distribuídos nos pacotes; Temurin usa GPLv2 com Classpath Exception. As bibliotecas Geode mantêm suas licenças e metadados.

## Construção e execução

`tools/package-property-relay.py` recebe um JSON de fontes já baixadas e verificadas (campos `platform`, `url`, `sha256`, `local_path`), lê os segmentos Linux originais, verifica seu hash, monta ZIPs determinísticos e segmenta em blocos de 1 MiB. Não faz downloads. Cada ZIP fixa timestamp, ordem e permissões. Comparações byte a byte exigem também fixar a versão de Python/zlib usada no empacotamento.

O Windows preserva os arquivos do JRE ZIP; o macOS usa os arquivos de `Contents/Home`, incluindo licenças e permissões executáveis. Os launchers têm o SHA-256 do ZIP fixado no código e verificam a reconstrução antes de extrair/executar. Não há resolução de versões ou download de código durante o uso.

## Validação e limites

`portable-packages-smoke.mjs` verifica cada segmento, tamanho total, hash do pacote, pin do launcher e identidade dos JARs entre plataformas. A matriz de CI executa o relay nativo em Windows x64, macOS arm64 e Linux x86_64, com SQLite, NIP-17, ofertas BTC/XMR/XNO e reinício persistente. Somente uma execução concluída comprova o resultado do respectivo sistema; consultar os links no plano de testes.

Mac Intel não está incluído: o driver SQLite do snapshot não contém a biblioteca JNI necessária. Android/iOS usam a PWA; os pacotes desktop não significam relay móvel contínuo. Instalação em dispositivos reais, distribuição assinada/notarizada e o ensaio G11-03 de 24 horas reais são gates adicionais.
