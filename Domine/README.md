# Domine Hub GPSBI

Protótipo funcional do novo Hub da Domine, preparado para GitHub/Vercel.

## Entregue
- Login no padrão Hub GPSBI (mock local; pronto para Supabase Auth).
- Painel Gerencial com deduplicação do Frete TAK por viagem.
- Ticket médio calculado sobre frete deduplicado.
- Quantidade com frete contada por viagem única.
- Meta prevista mensal de 150, não semanal.
- Operação Detalhada com campos de horário formatados como HH:mm.
- Estrutura inicial de Agenda, Mural e Aprovações.
- Tema claro/escuro persistente.

## Regra de viagem
A chave tenta usar `Viagem ID`/`ID Viagem`. Na ausência, usa:
`data + empresa + motorista + placa + horário de saída`.
Antes da produção, recomenda-se criar uma coluna estável `Viagem ID` na Base Operacional.

## Publicação
1. Subir todos os arquivos no repositório.
2. Importar o repositório na Vercel.
3. Vincular o domínio `domine.gpsbi.com.br`.
4. Publicar a planilha ou trocar o carregamento GViz por API/ETL protegido.
5. Integrar Supabase Auth e executar `supabase.sql`.

## Observação da fonte
A planilha informada é tentada via Google GViz. Se não estiver publicada para leitura, o projeto exibe dados demonstrativos para permitir a validação visual.
