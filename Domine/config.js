window.DOMINE_CONFIG = {
  client: { name: 'Domine Log', domain: 'domine.gpsbi.com.br', timezone: 'America/Sao_Paulo' },
  modules: { painel: true, operacao: true, agenda: true, mural: true, aprovacoes: true },
  data: {
    spreadsheetId: '1IP3vWWdJhVa3pdoQ-2UQUWobAMxhXF9e9vO7i0BNCik',
    sheets: { base: 'Base_Dash', metas: 'Metas', motoristas: 'Lista Motoristas' },
    // O Hub tenta carregar pelo GViz. Caso a planilha não esteja publicada, usa dados demonstrativos.
    useLiveGoogleSheet: true
  },
  companies: ['Global','DC','BENASSI','YAMALOG','C&F','ROMANATO'],
  statusLabels: {
    '1':'Confirmado','2':'Ag. Carregamento','3':'Em trânsito','4':'Finalizado',
    '5':'Ocorrência','6':'Cancelado'
  }
};
