/* ================================================================
   Hub GPSBI · Uuizz — Fluxo de Caixa
   Baseado na arquitetura homologada da Tangram (tabela ano>mês>dia,
   ficha de detalhamento, saldo inicial e lançamentos manuais via
   Supabase, alertas de limite bancário), adaptado para duas fontes
   de dados diferentes de duas empresas do mesmo grupo:

   - Empoderamento (Conta Azul): abas "CAP" (contas a pagar) e "CAR"
     (contas a receber), por Data de Vencimento. Só linhas com
     Situação = "Quitado" contam como caixa real.
   - Mister Wiz (Omie): aba "Movimentação da Conta Uuizz" (mesma
     estrutura usada na Tangram/Mebrasi). Só linhas com
     Situação = "Conciliado" contam como caixa real.

   ESCOPO DESTA VERSÃO:
   - realizado pela Data Real;
   - projeções futuras pela data prevista/vencimento;
   - vencidos sem baixa ficam fora do fluxo;
   - valores seguem as colunas de apoio homologadas "Data Real" e "Valor".
   ================================================================ */

// TODO (Gustavo): preencher com os valores reais antes do deploy.
const SUPABASE_URL = 'https://okrvklvvulmjdarlwdbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rcnZrbHZ2dWxtamRhcmx3ZGJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgxOTEsImV4cCI6MjA5OTUzNDE5MX0.X8lXu_ZHB1v_tSvQso4RVEWt32NaI7gPZrTlQsB6dog';
const SHEET_ID = '1eFzTg4nqZecn7fqjcvFOOQOhcE0cl5iAR1U1p_gKO2s'; // extrair de https://docs.google.com/spreadsheets/d/ESTE_ID/edit
const GID_CAP = '193110136';                         // aba "CAP" — Empoderamento (Conta Azul)
const GID_CAR = '14079185';                         // aba "CAR" — Empoderamento (Conta Azul)
const GID_MOVIMENTACAO_UUIZZ = '1752090986'; // aba "Movimentação da Conta Uuizz" — Mister Wiz (Omie)
const LOGIN_URL = 'index.html';

function normalizeTxt(s){
  return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
// Busca o valor de uma coluna pelo nome "normalizado" (sem acento/maiúscula),
// pra não depender de bater a grafia exata do cabeçalho vindo do Google Sheets.
function getColNormalized(rowObj, wantedKeyNormalized){
  for(const k in rowObj){
    if(normalizeTxt(k)===wantedKeyNormalized) return rowObj[k];
  }
  return undefined;
}

// Acesso à página: equipe GPSBI + gestora principal da Uuizz (Daniela).
function canAccessFluxo(email){
  email = (email||'').toLowerCase();
  return email.endsWith('@gpsbi.com.br') || email === 'daniela@empoderamentoadolescente.com.br';
}
// Recursos de ajuste (Saldo Inicial, Lançamentos Manuais) são só do time interno GPS.
function isGpsStaff(email){
  return (email||'').toLowerCase().endsWith('@gpsbi.com.br');
}
function isOwner(email){
  return (email||'').toLowerCase().endsWith('@gpsbi.com.br');
}
function nameFromEmail(email){ return email.split('@')[0].split('.').map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' '); }
function el(id){ return document.getElementById(id); }

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function fmtBRL(n){
  if(n===null||n===undefined||isNaN(n)) return 'R$ 0';
  const sign = n<0 ? '-' : '';
  return sign+'R$ '+Math.round(Math.abs(n)).toLocaleString('pt-BR');
}
function parseMoneyBR(v){
  if(v===null||v===undefined||v==='') return 0;
  if(typeof v==='number') return v;
  return parseFloat(String(v).replace(/\./g,'').replace(',','.')) || 0;
}

async function fetchGviz(gid){
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}&headers=1`;
  const res = await fetch(url);
  const text = await res.text();
  const clean = text.replace(/^[^{]*/, '').replace(/\s*\)\s*;?\s*$/, '');
  return JSON.parse(clean).table;
}
function parseGvizRows(table){
  if(!table || !table.rows) return [];
  const cols = table.cols.map(c=>c.label);
  return table.rows.map(row=>{
    const obj={};
    obj.__cells = row.c.map(cell=>cell ? (cell.v!==null ? cell.v : (cell.f||null)) : null);
    cols.forEach((col,i)=>{
      if(!col) return;
      const cell=row.c[i];
      obj[col]= cell ? (cell.v!==null?cell.v:(cell.f||null)) : null;
    });
    return obj;
  });
}
function getCellByIndex(r, zeroBasedIndex){
  return r && Array.isArray(r.__cells) ? r.__cells[zeroBasedIndex] : undefined;
}
function parseDateCell(v){
  if(v===null || v===undefined || v==='') return null;

  if(v instanceof Date && !isNaN(v)){
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }

  if(typeof v==='number'){
    const epoch = new Date(Date.UTC(1899,11,30));
    const d = new Date(epoch.getTime() + v * 86400000);
    if(!isNaN(d)) return d.toISOString().slice(0,10);
  }

  const s = String(v).trim();
  if(!s || normalizeTxt(s)==='em aberto') return null;

  const gviz = s.match(/Date\((\d+),(\d+),(\d+)\)/);
  if(gviz){
    return `${gviz[1]}-${String(Number(gviz[2])+1).padStart(2,'0')}-${String(gviz[3]).padStart(2,'0')}`;
  }

  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`;

  return null;
}
function extractCellValue(cell){
  if(cell===null || cell===undefined) return '';
  if(typeof cell==='object') return (cell.v ?? cell.f ?? '').toString().trim();
  return cell.toString().trim();
}
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function readDateCol(r, colName){
  const raw = getColNormalized(r, colName);
  return parseDateCell(typeof raw==='object' && raw!==null ? (raw.v||raw) : raw);
}

/* ================== Ingestão: CAP / CAR (Empoderamento — Conta Azul) ==================
   Réplica exata do racional já usado no Google Sheets do Gustavo:
   - "Data Real": se tem Data do último pagamento, usa ela (é quando o caixa mexeu de
     verdade, podendo ser diferente da data de vencimento). Sem pagamento: usa a data
     de vencimento/prevista SE ainda não venceu (fica como projeção no fluxo). Vencida
     e sem pagamento = "Em aberto" de verdade, fica fora do fluxo.
   - "Valor": total pago/recebido se já há pagamento; senão, o valor original da
     parcela (projeção). Sempre em módulo — Pagamentos e Recebimentos são positivos;
     só o Saldo Acumulado é o líquido (Recebimentos − Pagamentos).
   - Categoria 1 / Categoria 2: dois níveis de agrupamento, iguais aos da planilha. */
// Estrutura oficial do fluxo atual da Empoderamento.
// A base traz a categoria detalhada em Categoria 1; o grupo-pai é a conta
// gerencial usada no fluxo homologado.
const EMPODERAMENTO_GRUPOS = {
  'Investimento CDB':'1. Investimentos',
  'Consultoria/Mentoria':'1. Investimentos',

  'ISS sobre Faturamento':'Deduções Da Receita',
  'Alvará de Funcionamento':'Deduções Da Receita',
  'Comissões de Vendedores':'Deduções Da Receita',
  'PIS':'Deduções Da Receita',
  'Cofins':'Deduções Da Receita',
  'COFINS':'Deduções Da Receita',
  'CSLL':'Deduções Da Receita',
  'IRPJ':'Deduções Da Receita',
  'Estorno para clientes':'Deduções Da Receita',
  'DARE - SC':'Deduções Da Receita',
  'Teen Power Impostos':'Deduções Da Receita',
  'Simples Nacional - DAS':'Deduções Da Receita',
  'Bonificações':'Deduções Da Receita',

  'Embalagens/Caixa de envio':'2. Fornecedores',
  'Equipe - Prestadores de serviços':'2. Fornecedores',
  'Mentoria':'2. Fornecedores',
  'Embalagens/Caixas de envio':'2. Fornecedores',
  'Transferência- Mister Wiz':'2. Fornecedores',
  'Freelancer':'2. Fornecedores',
  'Gráfica':'2. Fornecedores',

  'Despesas com cartão de crédito':'3. Despesas Financeiras',
  'Tarifas de Boletos':'3. Despesas Financeiras',
  'Tarifas Bancárias':'3. Despesas Financeiras',
  'Juros pagos':'3. Despesas Financeiras',
  'Juros sobre empréstimo':'3. Despesas Financeiras',
  'IOF':'3. Despesas Financeiras',
  'Empréstimos de Bancos':'3. Despesas Financeiras',
  'Empréstimos de Sócios':'3. Despesas Financeiras',
  'Adiantamento a Sócios':'3. Despesas Financeiras',
  'Empréstimos de Outras Instituições':'3. Despesas Financeiras',
  'Entre Contas Empoderamento-Despesa':'3. Despesas Financeiras',

  'Despesas Médicas':'4. Despesas Com Pessoal',
  'Capacitação e Cursos':'4. Despesas Com Pessoal',
  'Exames Médicos':'4. Despesas Com Pessoal',
  'FGTS e Multa de FGTS':'4. Despesas Com Pessoal',
  'Transporte Ônibus':'4. Despesas Com Pessoal',
  '13º Salário - 2ª Parcela':'4. Despesas Com Pessoal',
  'Roupas/Acessórios':'4. Despesas Com Pessoal',
  'IRRF':'4. Despesas Com Pessoal',
  'INSS sobre Pró-labore - GPS':'4. Despesas Com Pessoal',
  'INSS sobre Salários - GPS':'4. Despesas Com Pessoal',
  'Darf':'4. Despesas Com Pessoal',
  'GRU Judicial':'4. Despesas Com Pessoal',
  'Lanches e Refeições':'4. Despesas Com Pessoal',
  'Plano de Saúde Sócios':'4. Despesas Com Pessoal',
  'Plano de saúde':'4. Despesas Com Pessoal',
  'Pró-labore':'4. Despesas Com Pessoal',
  'Apoio':'4. Despesas Com Pessoal',
  'Salários':'4. Despesas Com Pessoal',
  'Recrutamento':'4. Despesas Com Pessoal',
  'Segurança do Trabalho':'4. Despesas Com Pessoal',
  'Teen Power Salarios':'4. Despesas Com Pessoal',
  'Transporte (táxi, uber, gasolina e estac.)':'4. Despesas Com Pessoal',
  'Vale-Transporte':'4. Despesas Com Pessoal',

  'Despesas Pessoais dos Sócios':'5. Despesas Administrativas',
  'Confraternizações':'5. Despesas Administrativas',
  '13º Salário - 1ª Parcela':'5. Despesas Administrativas',
  'Teen Power-Honorários contábeis':'5. Despesas Administrativas',
  'Coworking':'5. Despesas Administrativas',
  'Reembolso':'5. Despesas Administrativas',
  'Assessoria Jurídica':'5. Despesas Administrativas',
  'Honorários Contábeis':'5. Despesas Administrativas',
  'Certificado Digital':'5. Despesas Administrativas',
  'Materiais de Escritório':'5. Despesas Administrativas',
  'Limpeza':'5. Despesas Administrativas',
  'Telefonia':'5. Despesas Administrativas',

  'Hospedagem':'4.8 Despesas com Viagem',
  'Passagem aérea':'4.8 Despesas com Viagem',

  'Aluguel':'6. Despesas Com Infra-Estrutura',
  'Condomínio':'6. Despesas Com Infra-Estrutura',
  'Consertos/Reposição de peças':'6. Despesas Com Infra-Estrutura',
  'Benfeitorias em Bens de Terceiros':'6. Despesas Com Infra-Estrutura',
  'manutenção e reforma':'6. Despesas Com Infra-Estrutura',
  'Manutenção de Equipamentos':'6. Despesas Com Infra-Estrutura',
  'Energia Elétrica':'6. Despesas Com Infra-Estrutura',

  'Combustíveis':'7. Despesas Logísticas',
  'Transporte Urbano (táxi, Uber)':'7. Despesas Logísticas',
  'Frete/Correios/Motoboy':'7. Despesas Logísticas',
  'Correios/Frete/Motoboy':'7. Despesas Logísticas',
  'Estacionamento':'7. Despesas Logísticas',
  'Pedágios':'7. Despesas Logísticas',

  'ware':'Despesa com TI',
  'Memberkit - Plataforma CGP - SM':'Despesa com TI',
  'Streamyard - SM':'Despesa com TI',
  'Equipamentos eletrônicos - SM':'Despesa com TI',
  'Nuvem - Drive - SM':'Despesa com TI',
  'Sistema operacional - SM':'Despesa com TI',
  'Hospedagem SM':'Despesa com TI',
  'Teen Power SM':'Despesa com TI',
  'Vimeo - SM':'Despesa com TI',
  'Soundcloud - SM':'Despesa com TI',
  'Clickup SM':'Despesa com TI',
  'Telefonia SM':'Despesa com TI',
  'Programa/Ferramenta SM':'Despesa com TI',
  'Socialeds - SM':'Despesa com TI',
  'Agenda online - sistema op. SM':'Despesa com TI',
  'Guru':'Despesa com TI',
  'CRM SM':'Despesa com TI',
  'CRM':'Despesa com TI',
  'Computadores':'Despesa com TI',
  'Desplugados':'Despesa com TI',
  'Equipamentos eletrônicos':'Despesa com TI',
  'Internet':'Despesa com TI',
  'Plataforma ZOOM':'Despesa com TI',
  'Recarga/Plano Móvel':'Despesa com TI',
  'Software':'Despesa com TI',
  'Sistema operacional':'Despesa com TI',

  'Ferramenta comercial':'Despesas Com Marketing',
  'Ferramenta de Tecnologia':'Despesas Com Marketing',
  'Ferramenta de MKT':'Despesas Com Marketing',
  'Agência de Marketing':'Despesas Com Marketing',
  'Produção de vídeo':'Despesas Com Marketing',
  'Assessoria de imprensa':'Despesas Com Marketing',
  'Brindes para Clientes':'Despesas Com Marketing',
  'Doação':'Despesas Com Marketing',
  'Edição de vídeos':'Despesas Com Marketing',
  'Evento presencial':'Despesas Com Marketing',
  'Foto e Filmagem':'Despesas Com Marketing',
  'Influencers':'Despesas Com Marketing',
  'Make/Cabelo':'Despesas Com Marketing',
  'Presentes/bonificações':'Despesas Com Marketing',
  'Produtos Eventos':'Despesas Com Marketing',
  'Registros de Marca':'Despesas Com Marketing',
  'Teen Power-Acate':'Despesas Com Marketing',
  'Tráfego Pago':'Despesas Com Marketing',

  'Distribuição de Lucros':'07. Distribuição de Lucros'
};
function grupoEmpoderamento(categoria){
  return EMPODERAMENTO_GRUPOS[categoria] || 'Outros';
}

// tipoLancamento: 'pagar' (CAP) ou 'receber' (CAR)
function rowsFromCapCar(table, tipoLancamento){
  const raw = parseGvizRows(table);
  const hoje = todayISO();

  return raw.map(r=>{
    /*
      Regra homologada na planilha:
      CAP:
        Data Real = se sem pagamento e vencida -> "Em aberto";
                    senão, data do pagamento; se não houver, vencimento.
        Valor = valor pago, senão valor original.

      CAR:
        Data Real = se sem recebimento e vencida -> "Em aberto";
                    senão, data do recebimento; se não houver, prevista.
        Valor = valor recebido, senão valor original.

      O Hub usa prioritariamente as colunas de apoio "Data Real" e "Valor".
    */
    // Leitura por posição fixa das colunas homologadas.
    // CAP: AX=Data Real, AY=Valor, AC=Categoria 1, AI=Categoria 2.
    // CAR: AK=Data Real, AN=Valor, AC=Categoria 1, AG=Categoria 2.
    const isCap = tipoLancamento==='pagar';
    let date = parseDateCell(getCellByIndex(r, isCap ? 49 : 36));

    const dataVenc = parseDateCell(getCellByIndex(r, isCap ? 4 : 5)) ||
                     parseDateCell(getCellByIndex(r, isCap ? 5 : 4));
    const dataBaixa = parseDateCell(getCellByIndex(r, 25));

    if(!date){
      if(!dataBaixa && (!dataVenc || dataVenc < hoje)) return null;
      date = dataBaixa || dataVenc;
    }

    if(!date) return null;

    const categoria1 = (getCellByIndex(r, 28) || 'Sem categoria').toString().trim();
    const categoria2 = (getCellByIndex(r, isCap ? 34 : 32) || '').toString().trim();

    const valorApoio = Math.abs(parseMoneyBR(getCellByIndex(r, isCap ? 50 : 39)));
    const valorRealizado = Math.abs(parseMoneyBR(getCellByIndex(r, 18)));
    const valorOriginal = Math.abs(parseMoneyBR(getCellByIndex(r, 12)));

    const valor = valorApoio > 0
      ? valorApoio
      : (valorRealizado > 0 ? valorRealizado : valorOriginal);

    if(!valor) return null;

    const conta = (getCellByIndex(r,24) || 'Não informada').toString().trim();

    /*
      O CAP original soma somente estas contas:
      Inter, Sicredi e Teen Power-Sicredi.
    */
    if(tipoLancamento==='pagar'){
      const contaNorm = normalizeTxt(conta);
      const permitidas = new Set(['inter','sicredi','teen power-sicredi']);
      if(!permitidas.has(contaNorm)) return null;
    }

    const grupo = tipoLancamento==='pagar' ? 'PAGAMENTOS' : 'RECEBIMENTOS';
    const signedValor = grupo==='RECEBIMENTOS' ? valor : -valor;

    const nome = (
      getColNormalized(
        r,
        tipoLancamento==='pagar'
          ? 'nome do fornecedor'
          : 'nome do cliente'
      ) || ''
    ).toString().trim();

    const documento = (
      getColNormalized(r,'nota fiscal') ||
      getColNormalized(r,'codigo de referencia') ||
      getColNormalized(r,'código de referência') ||
      ''
    ).toString().trim();

    const historico = (
      getColNormalized(r,'descricao') ||
      getColNormalized(r,'descrição') ||
      getColNormalized(r,'observacoes') ||
      getColNormalized(r,'observações') ||
      ''
    ).toString().trim();

    /*
      Hierarquia:
      RECEBIMENTOS/PAGAMENTOS
        Conta contábil (Categoria 1)
          Categoria detalhada (Categoria 2)

      Mantemos Categoria 1 como grupo principal porque é assim que o fluxo
      original da Empoderamento está estruturado.
    */
    const contaContabil = tipoLancamento==='pagar'
      ? grupoEmpoderamento(categoria1)
      : (categoria2 || categoria1 || 'Sem categoria');
    const categoriaDetalhe = tipoLancamento==='pagar'
      ? categoria1
      : (categoria2 ? categoria1 : '');

    return {
      date,
      categoria1,
      categoria2,
      contaContabil,
      categoriaDetalhe,
      grupo,
      valor,
      signedValor,
      conta,
      empresa:'Empoderamento',
      fonte: tipoLancamento==='pagar' ? 'CAP' : 'CAR',
      nome,
      documento,
      historico
    };
  }).filter(Boolean);
}

/* ================== Ingestão: Movimentação da Conta Uuizz (Mister Wiz — Omie) ==================
   Extrato bancário: já traz Situação com realizado (Conciliado/Não Conciliado) e
   projeção futura (A vencer/Vence hoje/Previsto/Calculando). Só exclui "Atrasado"
   (equivalente ao "Em aberto vencido" do Conta Azul). Um único nível de categoria
   (não tem Categoria 1/2 separadas como CAP/CAR). */
function rowsFromMovimentacao(table){
  const raw = parseGvizRows(table);
  return raw.map(r=>{
    const clienteFornecedor = (getColNormalized(r, 'cliente ou fornecedor')||'').toString().trim();
    if(normalizeTxt(clienteFornecedor)==='saldo' || normalizeTxt(clienteFornecedor)==='saldo anterior') return null; // linhas marcadoras, não lançamentos

    const situacao = normalizeTxt(getColNormalized(r, 'situacao'));
    if(situacao === 'atrasado') return null; // vencido e não conciliado, fora do fluxo

    const date = readDateCol(r, 'data');
    if(!date) return null;

    const categoria1 = (getColNormalized(r, 'categoria') || 'Sem categoria').toString().trim();
    const valorRaw = getColNormalized(r, 'valor (r$)');
    const rawValor = parseMoneyBR(typeof valorRaw==='object' && valorRaw!==null ? (valorRaw.v ?? valorRaw.f) : valorRaw);
    if(!rawValor) return null;

    const grupo = rawValor >= 0 ? 'RECEBIMENTOS' : 'PAGAMENTOS';
    const valor = Math.abs(rawValor);
    const signedValor = rawValor;
    const conta = (getColNormalized(r, 'conta corrente')||'Não informada').toString().trim();
    const documento = (getColNormalized(r,'documento') || getColNormalized(r,'nota fiscal') || '').toString().trim();
    const historico = (getColNormalized(r,'observacoes') || '').toString().trim();

    return { date, categoria1, categoria2:'', contaContabil:categoria1, categoriaDetalhe:'', grupo, valor, signedValor, conta, empresa:'Mister Wiz', fonte:'Movimentação', nome: clienteFornecedor, documento, historico };
  }).filter(Boolean);
}


/* ================== Estado global ================== */
let rows = []; // { date, categoria1, categoria2, contaContabil, categoriaDetalhe, grupo, valor, signedValor, conta, empresa, fonte, nome, documento, historico }
let currentUser = null;
let gpsStaff = false;
let empresaFiltro = 'global'; // 'global' | 'Empoderamento' | 'Mister Wiz'
const LIMITES_POR_EMPRESA = {
  'Empoderamento': 0,
  'Mister Wiz': 80000
};

function rowsInScope(){
  return empresaFiltro==='global' ? rows : rows.filter(r=>r.empresa===empresaFiltro);
}

async function init(){
  const { data } = await sb.auth.getSession();
  if(!data.session){ window.location.replace(LOGIN_URL); return; }
  currentUser = data.session.user;
  const email = currentUser.email;

  if(!canAccessFluxo(email)){
    el('loadingScreen').style.display='none';
    el('deniedScreen').style.display='block';
    document.documentElement.style.visibility='visible';
    return;
  }

  gpsStaff = isGpsStaff(email);
  if(!gpsStaff){
    const card = el('fcAjustesGpsCard'); if(card) card.style.display='none';
  }

  renderAppNav({ activePage:'fluxodecaixa.html', userLabel: nameFromEmail(email), userRole: isOwner(email)?'owner':'vendor', onLogout: doLogout, sb, currentUser });

  await loadData();
}

async function loadData(){
  try{
    const [tableCap, tableCar, tableMov] = await Promise.all([
      fetchGviz(GID_CAP),
      fetchGviz(GID_CAR),
      fetchGviz(GID_MOVIMENTACAO_UUIZZ),
    ]);
    rows = [
      ...rowsFromCapCar(tableCap, 'pagar'),
      ...rowsFromCapCar(tableCar, 'receber'),
      ...rowsFromMovimentacao(tableMov),
    ];
    rows.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);

    await loadSaldoInicial();
    await loadAjustesManuais();
    buildAndRenderTable();
    el('loadingScreen').style.display='none';
    el('mainContent').style.display='block';
    document.documentElement.style.visibility='visible';
  }catch(e){
    console.error(e);
    el('loadingMsg').textContent = 'Erro ao carregar a base. Verifique o acesso à planilha e os GIDs configurados.';
  }
}

function setEmpresaFiltro(v){
  empresaFiltro = v;
  document.querySelectorAll('#fcEmpresaToggle .fc-empresa-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.empresa===v);
  });
  buildAndRenderTable();
}

/* ================== ÁRVORE DE COLUNAS (Ano > Mês > Dia) ================== */
const MESES_ABBR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DOW_ABBR = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
let columnTree = [];
function buildColumnTree(){
  const scoped = rowsInScope();
  if(!scoped.length) return [];
  const minYear = parseInt(scoped[0].date.slice(0,4),10);
  const maxYear = parseInt(scoped[scoped.length-1].date.slice(0,4),10);
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const curYear = today.getFullYear(), curMonth = today.getMonth()+1;

  const years = [];
  for(let y=minYear; y<=maxYear; y++){
    const months = [];
    for(let m=1; m<=12; m++){
      const lastDay = new Date(y,m,0).getDate();
      const days = [];
      for(let d=1; d<=lastDay; d++){
        const dstr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dow = DOW_ABBR[new Date(y,m-1,d).getDay()];
        days.push({ type:'day', key:'d'+dstr, label:`<div class="fc-dow">${dow}</div><div>${String(d).padStart(2,'0')}</div>`, start:dstr, end:dstr, isToday: dstr===todayStr, children:[], expanded:false });
      }
      months.push({ type:'month', key:`m${y}-${m}`, label:MESES_ABBR[m-1]+'/'+String(y).slice(2),
        start:`${y}-${String(m).padStart(2,'0')}-01`, end:`${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
        isToday:false, children:days, expanded:(y===curYear && m===curMonth) });
    }
    years.push({ type:'year', key:'y'+y, label:String(y), start:`${y}-01-01`, end:`${y}-12-31`,
      isToday:false, children:months, expanded:(y===curYear) });
  }
  return years;
}
function flattenColumns(nodes){
  let out = [];
  for(const n of nodes){
    out.push(n);
    if(n.expanded && n.children.length) out = out.concat(flattenColumns(n.children));
  }
  return out;
}

/* ================== CÁLCULO DE VALORES ================== */
function sumInRange(catFilterFn, start, end){
  let s = 0;
  for(const r of rowsInScope()){ if(r.date>=start && r.date<=end && catFilterFn(r)) s += r.valor; }
  return s;
}

let saldoInicialOverrides = {}; // { Empoderamento: {data_referencia,valor}|null, 'Mister Wiz': {...}|null }

function runningBalanceForEmpresa(empresaKey, uptoDate){
  const override = saldoInicialOverrides[empresaKey];
  const relevantRows = rows.filter(r=>r.empresa===empresaKey);
  if(override && uptoDate >= override.data_referencia){
    let s = override.valor;
    for(const r of relevantRows){ if(r.date > override.data_referencia && r.date<=uptoDate) s += r.signedValor; }
    return s;
  }
  let s = 0;
  for(const r of relevantRows){ if(r.date<=uptoDate) s += r.signedValor; }
  return s;
}
function runningBalance(uptoDate){
  if(empresaFiltro==='global'){
    return runningBalanceForEmpresa('Empoderamento', uptoDate) + runningBalanceForEmpresa('Mister Wiz', uptoDate);
  }
  return runningBalanceForEmpresa(empresaFiltro, uptoDate);
}

const isRecebimento = r => r.grupo==='RECEBIMENTOS';
const isPagamento = r => r.grupo==='PAGAMENTOS';

/* ================== ÁRVORE DE LINHAS ==================
   RECEBIMENTOS e PAGAMENTOS em dois níveis — Categoria 1 (a "conta"/grupo,
   ex: "2. Fornecedores") e, dentro dela, Categoria 2 — igual à planilha e ao
   padrão homologado da Tangram. Tudo fechado por padrão (nada explodido). */
let rowTree = [];
function buildGrupoChildren(scoped, grupo, signHint){
  const rowsGrupo = scoped.filter(r=>r.grupo===grupo);

  const contas = Array.from(new Set(
    rowsGrupo.map(r=>r.contaContabil || r.categoria1 || 'Sem categoria')
  )).sort((a,b)=>a.localeCompare(b,'pt-BR'));

  return contas.map(contaLabel=>{
    const rowsConta = rowsGrupo.filter(r=>
      (r.contaContabil || r.categoria1 || 'Sem categoria')===contaLabel
    );

    const categorias = Array.from(new Set(
      rowsConta.map(r=>r.categoriaDetalhe || r.categoria2 || '').filter(Boolean)
    )).sort((a,b)=>a.localeCompare(b,'pt-BR'));

    const children = categorias.map(categoriaLabel=>({
      type:'categoria',
      level:2,
      label:categoriaLabel,
      signHint,
      filter:r=>
        r.grupo===grupo &&
        (r.contaContabil || r.categoria1 || 'Sem categoria')===contaLabel &&
        (r.categoriaDetalhe || r.categoria2 || '')===categoriaLabel,
      expanded:false,
      children:[]
    }));

    return {
      type:'conta',
      level:1,
      label:contaLabel,
      signHint,
      filter:r=>
        r.grupo===grupo &&
        (r.contaContabil || r.categoria1 || 'Sem categoria')===contaLabel,
      expanded:false,
      children
    };
  });
}
function buildRowTree(){
  const scoped = rowsInScope();

  const recebimentosNode = { type:'recebimentos', level:0, label:'RECEBIMENTOS', signHint:'pos', filter:isRecebimento, expanded:false, children: buildGrupoChildren(scoped, 'RECEBIMENTOS', 'pos') };
  const pagamentosNode = { type:'pagamentos', level:0, label:'PAGAMENTOS', signHint:'neg', filter:isPagamento, expanded:false, children: buildGrupoChildren(scoped, 'PAGAMENTOS', 'neg') };

  const nodes = [
    { type:'saldo', level:0, label:'SALDO ACUMULADO', special:'saldo', expanded:false, children:[] },
    recebimentosNode,
    pagamentosNode,
  ];

  const ajustesRows = scoped.filter(r=>r.grupo==='AJUSTES_MANUAIS');
  const ajustesCats = Array.from(new Set(ajustesRows.map(r=>r.categoria1))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(ajustesCats.length){
    nodes.push({
      type:'ajustes', level:0, label:'LANÇAMENTOS MANUAIS (GPS)', filter:r=>r.grupo==='AJUSTES_MANUAIS', expanded:false,
      children: ajustesCats.map(c=>({ type:'cat1', level:1, label:c, filter: r=>r.grupo==='AJUSTES_MANUAIS'&&r.categoria1===c, expanded:false, children:[] }))
    });
  }
  return nodes;
}
function flattenRows(nodes){
  let out = [];
  for(const n of nodes){
    out.push(n);
    if(n.expanded && n.children && n.children.length) out = out.concat(flattenRows(n.children));
  }
  return out;
}

/* ================== RENDER ================== */
function buildAndRenderTable(){
  columnTree = buildColumnTree();
  rowTree = buildRowTree();
  renderTable();
  renderDebugStats();
  const doScroll = ()=>scrollToToday();
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(doScroll); }
  requestAnimationFrame(()=>requestAnimationFrame(doScroll));
  setTimeout(doScroll, 300);
}

function renderDebugStats(){
  const wrap = el('fcDebugStats');
  if(!wrap) return;
  if(!gpsStaff){ wrap.textContent = ''; return; }
  const scoped = rowsInScope();
  const totalEmp = scoped.filter(r=>r.empresa==='Empoderamento').length;
  const totalMW = scoped.filter(r=>r.empresa==='Mister Wiz').length;
  const totalRec = scoped.filter(isRecebimento).length;
  const totalPag = scoped.filter(isPagamento).length;
  const totalAjustes = scoped.filter(r=>r.grupo==='AJUSTES_MANUAIS').length;
  wrap.textContent = `🔍 Diagnóstico (só GPS): ${scoped.length} linhas no escopo atual (${empresaFiltro}) · Empoderamento: ${totalEmp} · Mister Wiz: ${totalMW} · Recebimentos: ${totalRec} · Pagamentos: ${totalPag} · Lançamentos manuais: ${totalAjustes}`;
}

function renderColumnHeader(c){
  const hasChildren = c.children && c.children.length;
  const arrow = hasChildren ? `<span class="fc-col-toggle" onclick="toggleColumn('${c.key}')">${c.expanded?'−':'+'}</span> ` : '';
  const limiteInfo = getLimiteContaHeaderInfo(c);
  const alerta = limiteInfo ? renderLimiteContaHeaderAlert(limiteInfo) : '';
  if(c.type === 'day'){
    const datePart = (c.start || '').slice(8,10);
    const dowMatch = String(c.label||'').match(/<div class="fc-dow">([^<]+)<\/div>/);
    const dow = dowMatch ? dowMatch[1] : '';
    return `<th class="${c.isToday?'fc-today':''}"><span class="fc-day-head"><span class="fc-day-top"><span class="fc-dow">${dow}</span>${alerta}</span><span class="fc-day-num">${datePart}</span></span></th>`;
  }
  return `<th class="${c.isToday?'fc-today':''}"><span class="fc-limit-head">${arrow}${c.label}</span></th>`;
}

let fcRowDetailRefs = {};
let fcColDetailRefs = {};

function renderTable(){
  const cols = flattenColumns(columnTree);
  const visibleRows = flattenRows(rowTree);
  fcRowDetailRefs = {};
  fcColDetailRefs = {};

  if(!cols.length){
    el('fcTable').innerHTML = '<tbody><tr><td style="padding:20px;color:var(--text3);">Nenhum lançamento realizado encontrado para esse recorte.</td></tr></tbody>';
    return;
  }

  let thead = '<thead><tr><th></th>' + cols.map(c=>renderColumnHeader(c)).join('') + '</tr></thead>';

  let tbody = '<tbody>';
  visibleRows.forEach((rNode,rowIdx)=>{
    const rowId = 'r'+rowIdx;
    fcRowDetailRefs[rowId] = rNode;
    const cls = `fc-lvl-${rNode.level}`;
    const hasChildren = rNode.children && rNode.children.length;
    const arrow = hasChildren ? `<span class="fc-toggle">${rNode.expanded?'▾':'▸'}</span> ` : (rNode.level>0 ? '<span class="fc-toggle"></span> ' : '');
    const labelClick = hasChildren ? `toggleRowNode('${rNode.label.replace(/'/g,"\\'")}', ${rNode.level})` : '';
    tbody += `<tr class="${cls}">`;
    tbody += `<td class="fc-row-label" onclick="${labelClick}">${arrow}${rNode.label}</td>`;
    cols.forEach((c,colIdx)=>{
      const colId = 'c'+colIdx;
      fcColDetailRefs[colId] = c;
      let val;
      if(rNode.special==='saldo'){
        val = runningBalance(c.end);
        const cellCls = (val>=0?'fc-saldo-pos':'fc-saldo-neg') + (c.isToday?' fc-today':'');
        tbody += `<td class="${cellCls}">${fmtBRL(val)}</td>`;
      } else {
        val = sumInRange(rNode.filter, c.start, c.end);
        const clickable = Math.round(val)!==0;
        const negativo = rNode.signHint ? rNode.signHint==='neg' : val<0;
        const hoverCls = negativo ? ' fc-hover-despesa' : ' fc-hover-receita';
        const cellCls = `${c.isToday?'fc-today':''}${clickable?(' fc-clickable-cell'+hoverCls):''}`.trim();
        const onClick = clickable ? ` onclick="openFluxoFicha('${rowId}','${colId}')"` : '';
        tbody += `<td class="${cellCls}"${onClick}>${fmtBRL(val)}</td>`;
      }
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  el('fcTable').innerHTML = thead + tbody;
}

function formatDateBR(dstr){
  if(!dstr) return '';
  return new Date(dstr+'T00:00:00').toLocaleDateString('pt-BR');
}
function rangeLabel(start,end){
  return start===end ? formatDateBR(start) : `${formatDateBR(start)} até ${formatDateBR(end)}`;
}
function fmtNumeroFicha(n){
  if(n===null||n===undefined||isNaN(n)) return '0';
  return Math.round(Math.abs(n)).toLocaleString('pt-BR');
}
function escapeFichaHtml(s){
  return String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}
function rowsForFicha(rNode,start,end){
  if(!rNode || rNode.special==='saldo') return [];
  return rowsInScope().filter(r=>r.date>=start && r.date<=end && rNode.filter(r) && Math.abs(r.valor||0)>0);
}
function openFluxoFicha(rowId,colId){
  const rNode = fcRowDetailRefs[rowId];
  const col = fcColDetailRefs[colId];
  if(!rNode || !col || rNode.special==='saldo') return;

  const negativo = rNode.signHint === 'neg';
  const corValor = negativo ? 'var(--red)' : '#4F8F3A';

  const detailRows = rowsForFicha(rNode,col.start,col.end);
  const total = detailRows.reduce((s,r)=>s+r.valor,0);

  const porConta = {};
  detailRows.forEach(r=>{
    const conta = (r.empresa? r.empresa+' · ':'') + (r.conta || r.fonte || 'Não informada');
    porConta[conta] = (porConta[conta]||0) + r.valor;
  });

  const contas = Object.entries(porConta).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  const qtd = detailRows.length;

  el('fluxoFichaTitulo').textContent = 'Ficha · '+rNode.label;
  el('fluxoFichaSub').textContent = 'Período: '+rangeLabel(col.start,col.end);

  const contasHtml = contas.length ? contas.map(([conta,val])=>{
    const pct = total ? Math.abs(val)/Math.abs(total)*100 : 0;
    const itens = detailRows.filter(r=>((r.empresa? r.empresa+' · ':'') + (r.conta||r.fonte||'Não informada'))===conta).length;
    return `<tr><td>${escapeFichaHtml(conta)}</td><td class="num" style="color:${corValor}">${fmtBRL(val)}</td><td class="num">${pct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</td><td class="num">${itens}</td></tr>`;
  }).join('') : `<tr><td colspan="4" style="color:var(--text3);">Nenhum lançamento encontrado.</td></tr>`;

  const linhas = detailRows.slice().sort((a,b)=>{
    const d=Math.abs(b.valor||0)-Math.abs(a.valor||0);
    return d!==0?d:(a.date<b.date?-1:a.date>b.date?1:0);
  });

  const detalheHtml = linhas.slice(0,120).map(r=>{
    const pct = total ? Math.abs(r.valor)/Math.abs(total)*100 : 0;
    const nome = r.nome || r.historico || r.categoria2 || r.categoria1 || 'Sem nome';
    const doc = r.documento || r.fonte || '';
    return `<tr>
      <td>${formatDateBR(r.date)}</td>
      <td>${escapeFichaHtml((r.empresa?r.empresa+' · ':'')+(r.conta||r.fonte||'Não informada'))}</td>
      <td class="wrap" title="${escapeFichaHtml(nome)}">${escapeFichaHtml(nome)}</td>
      <td class="small" title="${escapeFichaHtml(doc)}">${escapeFichaHtml(doc)}</td>
      <td class="num">${pct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</td>
      <td class="valor-modal" style="color:${corValor}">${fmtNumeroFicha(r.valor)}</td>
    </tr>`;
  }).join('');

  el('fluxoFichaBody').innerHTML = `
    <div class="fc-detail-summary">
      <div class="fc-detail-kpi"><div class="fc-detail-kpi-val">${fmtBRL(total)}</div><div class="fc-detail-kpi-lbl">Total no período</div></div>
      <div class="fc-detail-kpi"><div class="fc-detail-kpi-val">${contas.length}</div><div class="fc-detail-kpi-lbl">Contas com movimento</div></div>
      <div class="fc-detail-kpi"><div class="fc-detail-kpi-val">${qtd}</div><div class="fc-detail-kpi-lbl">Lançamentos</div></div>
    </div>
    <table class="fc-detail-table"><thead><tr><th>Conta</th><th class="num">Valor</th><th class="num">%</th><th class="num">Itens</th></tr></thead><tbody>${contasHtml}</tbody></table>
    <div class="fc-detail-list"><table class="fc-detail-table" style="margin-top:0;"><thead><tr><th>Data</th><th>Conta</th><th>Nome</th><th>Documento</th><th class="num">%</th><th class="num">Valor</th></tr></thead><tbody>${detalheHtml||`<tr><td colspan="6" style="color:var(--text3);">Sem lançamentos.</td></tr>`}</tbody></table></div>
    ${linhas.length>120?`<div class="fc-detail-muted">Mostrando os primeiros 120 lançamentos.</div>`:''}
  `;
  el('fluxoFichaModal').classList.add('show');
}
function closeFluxoFicha(){ el('fluxoFichaModal').classList.remove('show'); }

function scrollToToday(){
  const wrap = document.querySelector('.fc-wrap');
  const todayTh = document.querySelector('.fc-table th.fc-today');
  if(wrap && todayTh) wrap.scrollLeft = todayTh.offsetLeft - 260;
}
function findColumnNode(nodes, key){
  for(const n of nodes){
    if(n.key===key) return n;
    if(n.children && n.children.length){ const found = findColumnNode(n.children,key); if(found) return found; }
  }
  return null;
}
function toggleColumn(key){
  const node = findColumnNode(columnTree, key);
  if(node){ node.expanded = !node.expanded; renderTable(); }
}
function findRowNode(nodes, label, level){
  for(const n of nodes){
    if(n.label===label && n.level===level) return n;
    if(n.children && n.children.length){ const found = findRowNode(n.children,label,level); if(found) return found; }
  }
  return null;
}
function toggleRowNode(label, level){
  const node = findRowNode(rowTree, label, level);
  if(node){ node.expanded = !node.expanded; renderTable(); }
}
async function doLogout(){ await sb.auth.signOut(); window.location.href = LOGIN_URL; }

/* ================== Limite da Conta (fixo em R$ 0 pras duas empresas) ================== */
function openSaldoInicialModal(){ el('saldoInicialModal').classList.add('show'); }
function closeSaldoInicialModal(){ el('saldoInicialModal').classList.remove('show'); }
function openAjustesManuaisModal(){ el('ajustesManuaisModal').classList.add('show'); }
function closeAjustesManuaisModal(){ el('ajustesManuaisModal').classList.remove('show'); }

function prevDateStr(dstr){
  const d = new Date(dstr+'T00:00:00');
  d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);
}
function nextDateStr(dstr){
  const d = new Date(dstr+'T00:00:00');
  d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}
function getLimiteAplicavel(){
  if(empresaFiltro==='Empoderamento') return LIMITES_POR_EMPRESA['Empoderamento'];
  if(empresaFiltro==='Mister Wiz') return LIMITES_POR_EMPRESA['Mister Wiz'];

  // No consolidado, somente Mister Wiz possui limite disponível.
  return LIMITES_POR_EMPRESA['Mister Wiz'];
}

function getLimiteContaHeaderInfo(c){
  if(!c || c.type!=='day') return null;

  const limite = getLimiteAplicavel();
  const saldo = runningBalance(c.end);

  if(saldo < -limite){
    const excesso = Math.abs(saldo) - limite;
    return {
      tipo:'alerta',
      severidade:getLimiteSeverity(excesso),
      titulo:'⚠ Limite bancário ultrapassado',
      data:c.end,
      saldo,
      excesso,
      mensagem: limite > 0
        ? `Limite considerado: ${fmtBRL(limite)}. Excesso: ${fmtBRL(excesso)}.`
        : 'Sem limite bancário disponível para esta empresa.'
    };
  }

  const amanha = nextDateStr(c.end);
  const saldoAmanha = runningBalance(amanha);

  if(saldo >= -limite && saldoAmanha < -limite){
    const excessoAmanha = Math.abs(saldoAmanha) - limite;
    return {
      tipo:'previo',
      severidade:'previo',
      titulo:'⚠ Alerta para amanhã',
      data:amanha,
      saldo:saldoAmanha,
      excesso:excessoAmanha,
      mensagem: limite > 0
        ? `Amanhã o saldo ultrapassa o limite de ${fmtBRL(limite)}.`
        : 'Amanhã o saldo ficará negativo e não há limite disponível.'
    };
  }

  return null;
}
function getLimiteSeverity(excesso){
  if(excesso >= 50000) return 'critico';
  if(excesso >= 10000) return 'atencao';
  return 'alert';
}
function renderLimiteContaHeaderAlert(info){
  const dataLabel = new Date(info.data+'T00:00:00').toLocaleDateString('pt-BR');
  return `<span class="fc-limit-dot ${info.severidade || (info.tipo==='alerta'?'alert':'previo')}"></span><span class="fc-limit-tooltip"><b>${escapeHtml(info.titulo)}</b><div class="row"><span>Data</span><strong>${dataLabel}</strong></div><div class="row"><span>Saldo previsto</span><strong>${fmtBRL(info.saldo)}</strong></div><div class="muted">${escapeHtml(info.mensagem)}</div></span>`;
}

/* ================== Saldo Inicial (por empresa) ================== */
async function loadSaldoInicial(){
  const { data, error } = await sb.from('fluxo_saldo_inicial').select('*').order('criado_em',{ascending:false});
  saldoInicialOverrides = { 'Empoderamento': null, 'Mister Wiz': null };
  if(!error && data){
    for(const empresa of ['Empoderamento','Mister Wiz']){
      const found = data.find(d=>d.empresa===empresa);
      if(found) saldoInicialOverrides[empresa] = found;
    }
  }
  renderSaldoInicialStatus();
}
function renderSaldoInicialStatus(){
  const wrap = el('fcSaldoInicialStatus');
  if(!wrap) return;
  const linhas = ['Empoderamento','Mister Wiz'].map(empresa=>{
    const o = saldoInicialOverrides[empresa];
    if(o){
      const dataLabel = new Date(o.data_referencia+'T00:00:00').toLocaleDateString('pt-BR');
      return `✅ <b>${empresa}</b>: ${fmtBRL(o.valor)} em ${dataLabel} <button class="btn btn-danger btn-sm" onclick="removeSaldoInicial('${empresa}')">Remover</button>`;
    }
    return `<b>${empresa}</b>: sem saldo inicial definido (Acumulado soma todo o histórico realizado).`;
  });
  wrap.innerHTML = linhas.join('<br><br>');
}
async function applySaldoInicial(){
  const empresa = el('fcSaldoInicialEmpresa').value;
  const data_referencia = el('fcSaldoInicialData').value;
  const valor = parseFloat(el('fcSaldoInicialValor').value);
  if(!data_referencia || isNaN(valor)){ alert('Preencha a data e o saldo dessa data.'); return; }
  await sb.from('fluxo_saldo_inicial').delete().eq('empresa', empresa);
  const { error } = await sb.from('fluxo_saldo_inicial').insert({ empresa, data_referencia, valor, criado_por: nameFromEmail(currentUser.email) });
  if(error){ alert('Erro ao salvar: '+error.message); return; }
  el('fcSaldoInicialData').value=''; el('fcSaldoInicialValor').value='';
  await loadSaldoInicial();
  renderTable();
}
async function removeSaldoInicial(empresa){
  if(!confirm(`Remover o saldo inicial de ${empresa}? O Saldo Acumulado volta a considerar todo o histórico realizado.`)) return;
  await sb.from('fluxo_saldo_inicial').delete().eq('empresa', empresa);
  await loadSaldoInicial();
  renderTable();
}

/* ================== Lançamentos Manuais (por empresa) ================== */
let ajustesManuais = [];
async function loadAjustesManuais(){
  const { data, error } = await sb.from('fluxo_ajustes_manuais').select('*').order('data',{ascending:true});
  ajustesManuais = (!error && data) ? data : [];
  rows = rows.filter(r=>r.grupo!=='AJUSTES_MANUAIS');
  ajustesManuais.forEach(a=>{
  rows.push({ date:a.data, categoria1: a.descricao || 'Lançamento manual', categoria2:'', grupo:'AJUSTES_MANUAIS', valor:a.valor, signedValor:a.valor, conta:'Lançamentos manuais', empresa:a.empresa, fonte:'Manual' });
  });
  rows.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  renderAjustesManuaisList();
}
function renderAjustesManuaisList(){
  const wrap = el('fcAjusteList');
  if(!wrap) return;
  wrap.innerHTML = ajustesManuais.length ? ajustesManuais.map(a=>`
    <div class="fc-sim-entry">
      <span class="desc">${escapeHtml(a.empresa)} · ${escapeHtml(a.descricao)}</span>
      <span class="data">${new Date(a.data+'T00:00:00').toLocaleDateString('pt-BR')}</span>
      <span class="valor" style="color:${a.valor>=0?'#98C47C':'var(--red)'}">${fmtBRL(a.valor)}</span>
      <button class="del" onclick="removeAjusteManual(${a.id})">✕</button>
    </div>`).join('') : '<div style="color:var(--text3);font-size:12.5px;">Nenhum lançamento manual ativo.</div>';
  const countEl = el('fcAjusteCount');
  if(countEl) countEl.textContent = ajustesManuais.length ? `(${ajustesManuais.length})` : '';
}
async function addAjusteManual(){
  const empresa = el('fcAjusteEmpresa').value;
  const descricao = el('fcAjusteDesc').value.trim();
  const valor = parseFloat(el('fcAjusteValor').value);
  const data = el('fcAjusteData').value;
  if(!descricao || isNaN(valor) || !data){ alert('Preencha descrição, valor e data.'); return; }
  const { error } = await sb.from('fluxo_ajustes_manuais').insert({ empresa, data, descricao, valor, criado_por: nameFromEmail(currentUser.email) });
  if(error){ alert('Erro ao salvar: '+error.message); return; }
  el('fcAjusteDesc').value=''; el('fcAjusteValor').value=''; el('fcAjusteData').value='';
  await loadAjustesManuais();
  buildAndRenderTable();
}
async function removeAjusteManual(id){
  if(!confirm('Remover esse lançamento manual? Ele deixa de contar no Saldo Acumulado.')) return;
  await sb.from('fluxo_ajustes_manuais').delete().eq('id', id);
  await loadAjustesManuais();
  buildAndRenderTable();
}

init();
