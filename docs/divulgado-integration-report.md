# Integração do DIVULGADO ao MONSTRO

## Arquitetura consolidada

O DIVULGADO passa a ser a experiência comercial interna do MONSTRO. A rota `/divulgado` reutiliza o mesmo componente e os mesmos contratos da rota técnica `/lead-intelligence`, evitando duas implementações e duas fontes de verdade.

- **Motor cadastral:** DuckDB, ingestão pública do CNPJ e consultas do pacote `@monstro/lead-intelligence`.
- **Experiência comercial:** Radar de Empresas, carteira, funil, agenda, listas, dossiê e missões.
- **Persistência única:** tabelas de estabelecimentos, listas, contas comerciais, interações, histórico e descobertas digitais no banco configurado por `MONSTRO_LEAD_DB`.
- **Integração:** APIs existentes em `/api/lead-intelligence/*`; a apresentação DIVULGADO não copia dados.

## O que foi reaproveitado

Do produto legado DIVULGADO foram preservados o vocabulário comercial, a navegação por radar/carteira/funil/agenda, a identidade clara em branco, verde e turquesa e o atalho manual para WhatsApp. Do MONSTRO foram preservados a base real da Receita, pesquisa paginada, filtros, exportação, dossiês, listas persistentes, enriquecimento verificável e carteira com histórico.

## Duplicações eliminadas

Não foram copiados o arquivo monolítico `companies.json`, a pesquisa cadastral paralela, dados demonstrativos ou o radar geográfico aproximado por círculos de bairro. A compatibilidade da rota `/lead-intelligence` foi mantida, mas ela e `/divulgado` apontam para o mesmo componente.

## Fluxo funcional V1

1. Pesquisar uma empresa real no Radar de Empresas.
2. Abrir o dossiê e consultar uma URL pública candidata com as proteções existentes.
3. Salvar produto, responsável, estágio, próxima atividade e observações na carteira.
4. Visualizar o registro em Minha Carteira, Funil Comercial e Agenda.
5. Registrar interações e consultar o histórico no dossiê.
6. Abrir o WhatsApp manualmente quando existir telefone cadastral; nenhuma mensagem é enviada pelo sistema.

## Preservação e migração

Não houve exclusão nem migração destrutiva. Registros existentes no DuckDB e o projeto legado permanecem preservados. A adoção é por contrato e composição de interface, não por cópia integral do aplicativo anterior.

## Pendências e riscos

- A persistência local em DuckDB é adequada à V1, mas implantação multi-instância exigirá banco transacional compartilhado, autenticação, autorização e isolamento por organização.
- Telefones da Receita são cadastrais; o link manual não implica consentimento para contato.
- O enriquecimento depende de URL candidata e confirmação de identidade; não deve associar homônimas.
- Agenda ainda é uma visão das próximas atividades, sem integração com calendário externo ou notificações.
- A rota técnica é mantida por compatibilidade e poderá futuramente redirecionar para `/divulgado` após validação dos consumidores.

