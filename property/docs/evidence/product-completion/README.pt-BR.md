# Evidências de conclusão do produto

O candidato anterior `a2ac830e2c06715bb0f50e377b8dd12b4f889ca4` passou em G0 e G1. Depois, o trust anchor de assinatura da release, ainda não publicada, foi rotacionado porque a chave privada correspondente não estava disponível localmente. **G0–G10 estão sendo executados novamente em ordem no novo candidato; nenhuma aprovação antiga será reaproveitada.**

A chave Ed25519 privada local fica fora do repositório, com permissões exclusivas do usuário. Somente a chave pública é versionada. A impressão digital e o preflight estão no [registro de preflight G0](G0/fixed-run-03/signing-key-rotation-preflight.json).

| Gate | Estado no candidato atual |
|---|---|
| G0 | Em execução |
| G1–G10 | Ainda não executados no novo candidato |

Os testes continuam offline e isolados em Ubuntu Linux x86_64. Outros sistemas operacionais, relays públicos, revisão humana e fundos de mainnet continuam fora do escopo. O plano só termina quando todos os gates passarem no mesmo candidato e as verificações de publicação de G10 passarem. [English](README.md)
