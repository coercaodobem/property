# Resultado do gate G3 — identidade humana na PWA e recuperação local

**Resultado: PASS — automatizado/offline em Ubuntu Linux x86_64.** Candidato de fonte congelado: [`4e1b231ccd190af569dd2890022dd4e8d053fcc8`](https://github.com/coercaodobem/property/commit/4e1b231ccd190af569dd2890022dd4e8d053fcc8).

O gate passou por 30 ciclos determinísticos de criação/desbloqueio/bloqueio, com rejeição de senha errada e cofre adulterado nos 30 casos; 20 ciclos de backup/restauração criptografados; 20 fixtures de colisão de nome assinado; e 25 jornadas no Chromium cobrindo instalação nova, sessão retornada, bloqueio/desbloqueio, restauração, cofre corrompido, envio offline sem relay e armazenamento negado. Todas as 25 jornadas passaram asserções de estado visível, controles acessíveis e ausência de falsa confirmação de entrega. Os rótulos em inglês/português coincidiram em 24 controles; navegação por teclado passou. O proxy registrou 444 tentativas de relay bloqueadas e zero solicitações externas concluídas; o armazenamento do navegador não continha senha nem chave privada.

O resultado é evidência automatizada em navegador Linux, não teste em dispositivo móvel físico ou outro sistema operacional. Não foram usados relay público nem serviço externo de identidade. Relatórios e hashes SHA-256 estão em [`fixed-run-02/`](fixed-run-02/).
