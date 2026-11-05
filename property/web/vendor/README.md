# Código de protocolo incluído no pacote

- `nostr-tools-2.25.2.bundle.js` — pacote `nostr-tools@2.25.2`, licença Unlicense. Fonte: npm, tarball `nostr-tools-2.25.2.tgz`.
- SHA-256: `a7c4846fde84a0d6ce7596f3fcfc88435d29fdcd616887205ab97f9a16bc6407`.
- Integridade npm registrada: `sha512-7JAx+brEPmqGz1yzaK9MOxvis/Nl1B38j9hVsBSRDMRmxk5XSc0+5LlPEYbzeiUyk41RURBDcfuMzmaT754HAg==`.
- Aviso de licença em `nostr-tools-LICENSE`.

- `qr-code-generator.js` — codificador QR local baseado no código de Project Nayuki usado pelo `qrcode.react` 4.2.0; somente o núcleo do gerador foi incluído, sem a dependência React.
- Aviso de licença em `QR-CODE-GENERATOR-LICENSE.txt`.
- SHA-256: `d4d14086837adae6b0603ab333443d80208205548ed5aa7ec9ec66e08fdabcf2`.

O aviso Unlicense foi mantido do pacote upstream e se aplica somente ao bundle `nostr-tools` acima; não define a licença do Property nem dos demais arquivos deste repositório.

O bundle é carregado apenas do próprio pacote Property. Não há importação em runtime de CDN ou repositório externo. A cadeia de build e as dependências transitivas ainda requerem auditoria antes de um lançamento estável.
