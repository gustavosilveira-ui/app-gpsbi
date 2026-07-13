# CLIENT_CONFIG · Uuizz

Documentação da configuração deste cliente, no padrão descrito na Hub GPSBI Master Constitution.

```js
const CLIENT_CONFIG = {
  cliente: {
    id: 'uuizz',
    nome: 'Uuizz',
    logo: 'Logo_sem_fundo.png (fornecido pelo cliente)',
    grupo: ['Empoderamento (Conta Azul)', 'Mister Wiz (Omie)'],
  },
  modulos: {
    dashboard: false,       // não contratado nesta fase
    fluxoCaixa: true,
    agenda: true,
    mural: true,
    aprovacoes: false,      // adiado — sem base de vendedor/meta ainda
    simulador: false,       // adiado — sem base de vendedor/meta ainda
  },
  acessos: {
    gestorPrincipal: 'daniela@empoderamentoadolescente.com.br',
    gpsbi: '*@gpsbi.com.br',
    dominiosCadastroPermitidos: ['empoderamentoadolescente.com.br', 'gpsbi.com.br'], // ASSUNÇÃO — confirmar domínio da Mister Wiz
  },
  fontesDados: {
    financeiro: {
      tipo: 'Google Sheets (gviz)',
      sheetId: '1eFzTg4nqZecn7fqjcvFOOQOhcE0cl5iAR1U1p_gKO2s', // extrair de https://docs.google.com/spreadsheets/d/ESTE_ID/edit
      abas: {
        CAP: { gid: '193110136', empresa: 'Empoderamento', sistema: 'Conta Azul', papel: 'contas a pagar' },
        CAR: { gid: '14079185', empresa: 'Empoderamento', sistema: 'Conta Azul', papel: 'contas a receber' },
        'Movimentação da Conta Uuizz': { gid: '1752090986', empresa: 'Mister Wiz', sistema: 'Omie', papel: 'extrato bancário realizado' },
      },
    },
  },
  regras: {
    realizadoCapCar: 'Situação = "Quitado"',
    realizadoMovimentacao: 'Situação = "Conciliado"',
    limiteBancario: { Empoderamento: 0, 'Mister Wiz': 0 }, // nenhuma das duas pode operar no vermelho
    metaFaturamento: 'Não aplicável nesta fase (Simulador adiado)',
  },
};
```

## Pendências antes do deploy
1. Preencher `https://okrvklvvulmjdarlwdbl.supabase.co` / `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rcnZrbHZ2dWxtamRhcmx3ZGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgxOTEsImV4cCI6MjA5OTUzNDE5MX0.X8lXu_ZHB1v_tSvQso4RVEWt32NaI7gPZrTlQsB6dog` (projeto Supabase da Uuizz) em `index.html`, `mural.html`, `agenda.html`, `fluxodecaixa.js`.
2. Preencher `1eFzTg4nqZecn7fqjcvFOOQOhcE0cl5iAR1U1p_gKO2s` e os três GIDs (`CAP`, `CAR`, `Movimentação da Conta Uuizz`) em `fluxodecaixa.js`, extraídos do link do Google Sheets enviado.
3. Rodar `supabase_setup_uuizz.sql` no SQL Editor do projeto.
4. Confirmar com a Daniela o domínio de e-mail da Mister Wiz (hoje só temos o da Daniela/Empoderamento).
5. Configurar Auth Hook / trigger restringindo cadastro aos domínios do item acima.
