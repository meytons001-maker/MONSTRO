# DIVULGADO — enriquecimento automático gratuito

## Implementação

- O identificador técnico legado `cotare` permanece no banco e nas APIs; toda apresentação foi corrigida para **Kotari**.
- Pesquisa individual pelo dossiê e lote de até 20 CNPJs, concorrência 2 na interface e máximo 3 no servidor.
- Cache de sete dias, atualização forçada, cancelamento e progresso concluído/selecionado.
- Descoberta inicial gratuita pelo domínio empresarial do e-mail cadastral. Domínios gratuitos ou ausentes retornam `unavailable`.
- SSRF, redes privadas, credenciais em URL, redirecionamentos, timeout e resposta máxima de 1 MB continuam bloqueados/limitados.
- Instagram só é `official_instagram` quando o link vem de um site confirmado pelo CNPJ. Links sem confirmação são candidatos; múltiplos perfis da mesma plataforma são conflitantes.
- O resumo separa descrição cadastral, tempo desde abertura do CNPJ e histórico institucional publicado. Abertura cadastral nunca é chamada de fundação.

## Casos reais verificados em 3 de novembro de 2026

| CNPJ | Resultado | Evidências |
| --- | --- | --- |
| 00.068.709/0001-29 — BOND TINTAS | sucesso, CNPJ confirmado | site `bondtintas.com.br`, Instagram `instagram.com/bondtintas`, Facebook, e-mail e quatro telefones comerciais publicados |
| 00.066.716/0001-91 — Login Informática | sucesso, CNPJ confirmado | site `login.com.br`, Instagram `instagram.com/canallogin`, TikTok, dois links Facebook classificados como conflitantes e descrição institucional |
| 00.000.000/0910-57 | indisponível | cadastro real sem domínio empresarial verificável |
| 00.000.000/3194-14 | indisponível | cadastro real sem domínio empresarial verificável |

Taxa de Instagram nos dois sites confirmados testados: **2/2**. Na amostra completa de quatro CNPJs: **2/4**. Não extrapolar para Salvador.

Descrição institucional real da Login: “Encontre computadores, notebooks, periféricos e tudo em informática na Login. Tecnologia, preço baixo, entrega rápida e confiança há mais de 30 anos.” A afirmação é apresentada como texto institucional da fonte, não como fato cadastral independente.

## Limitações

- Sem API de busca, a pesquisa automática depende de domínio empresarial presente no cadastro ou URL candidata informada manualmente.
- Não há login ou scraping direto do Instagram; perfis são descobertos somente por links públicos nas fontes consultadas.
- Sites sem CNPJ exato permanecem candidatos, mesmo quando o domínio coincide com o e-mail cadastral.
- O parser não substitui revisão humana para páginas com múltiplos perfis, redirecionamentos comerciais ou conteúdo institucional ambíguo.
