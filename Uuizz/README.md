# Hub GPSBI · UUIZZ

Projeto consolidado com o BI Comercial da Mister Wiz.

## Atualização da base comercial

1. Exporte o relatório do Omie mantendo os cabeçalhos atuais.
2. Renomeie o arquivo para `pivot.xlsx`.
3. Substitua apenas esse arquivo no deploy.

O painel usa `Data de Inclusão (completa)` na Receita Captada e
`Data do Faturamento (completa)` na Receita Faturada.

## Arquivos novos ou alterados

- `painel.html`: BI Comercial Mister Wiz.
- `pivot.xlsx`: base comercial utilizada pelo painel.
- `index.html`: novo acesso ao BI na página inicial.
- `nav.js`: BI Comercial incluído na navegação compartilhada.
- `supabase_setup_uuizz.sql`: permissões e tabelas auxiliares do BI.
