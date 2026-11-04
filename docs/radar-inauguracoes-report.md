# Radar de Inaugurações — validação inicial

Data: 2026-11-03. Branch: `codex/lead-intelligence-v1`.

## Cobertura declarada

Conjunto inicial controlado de 12 operações citadas pela reportagem do Alô Alô Bahia de 27/10/2026. Não representa todas as futuras inaugurações de Salvador. A reportagem é evidência jornalística inicial, não confirmação universal nem substituto de fonte oficial.

## Classificação inicial

- 2 inaugurações com data exata futura: Makô (15/11/2026) e Ziggy Pizza Pub (11/11/2026).
- 8 previsões anunciadas com mês, estação ou janela temporal.
- 1 possível abertura com período vago: Fazenda Churrascada.
- 1 evento já transcorrido, mantido no histórico: Jubiabrasa (01/11/2026).

Datas vagas permanecem em `period_text`; `exact_date` fica nulo. Nenhum CNPJ foi associado apenas por semelhança nominal. Site, Instagram e telefone permanecem vazios até confirmação independente.

## Funcionalidades

- filtros por horizonte, mês, bairro, segmento, tipo, confiança e não abordadas;
- dossiê com fonte, publicação, verificação, classificação e justificativa de confiança;
- oportunidade persistente mesmo antes de existir vínculo seguro com CNPJ;
- registro de contato, responsável e próximo acompanhamento;
- atualização manual ou temporizador local enquanto a página estiver ativa;
- histórico de atualizações e preservação dos dados anteriores;
- sem mensagens, ligações ou campanhas automáticas.

## Validação

- teste do pacote: 13/13 aprovado;
- suíte completa: 31/31 aprovada;
- typecheck: aprovado;
- build Next.js: aprovado com `MONSTRO_STANDALONE=false` no Windows;
- rota gerada: `/divulgado/inauguracoes`;
- API gerada: `/api/lead-intelligence/openings`.

## Limitações

- a V1 não executa busca geral na web nem contorna bloqueios de redes sociais;
- o botão de atualização reprocessa as fontes locais configuradas e atualiza a data de verificação; novas fontes precisam ser cadastradas explicitamente;
- datas e situação podem mudar após a publicação original;
- a validação visual autenticada exige login manual do administrador.
