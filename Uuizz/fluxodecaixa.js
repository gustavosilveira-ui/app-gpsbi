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

   ESCOPO DESTA VERSÃO: mostra apenas o realizado (Quitado/Conciliado).
   Itens em aberto/atrasados/perdidos não aparecem aqui — combinar com
   o Gustavo se depois quiserem uma visão "Em Aberto" separada.
   ================================================================ */

// TODO (Gustavo): preencher com os valores reais antes do deploy.
const SUPABASE_URL = '{{UUIZZ_SUPABASE_URL}}';
const SUPABASE_ANON_KEY = '{{UUIZZ_SUPABASE_ANON_KEY}}';
const SHEET_ID = '{{UUIZZ_SHEET_ID}}'; // extrair de https://docs.google.com/spreadsheets/d/ESTE_ID/edit
const GID_CAP = '{{GID_CAP}}';                         // aba "CAP" — Empoderamento (Conta Azul)
const GID_CAR = '{{GID_CAR}}';                         // aba "CAR" — Empoderamento (Conta Azul)
const GID_MOVIMENTACAO_UUIZZ = '{{GID_MOVIMENTACAO_UUIZZ}}'; // aba "Movimentação da Conta Uuizz" — Mister Wiz (Omie)
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
    cols.forEach((col,i)=>{ const cell=row.c[i]; obj[col]= cell ? (cell.v!==null?cell.v:(cell.f||null)) : null; });
    return obj;
  });
}
function parseDateCell(v){
  if(!v) return null;
  if(typeof v==='string'){
    if(/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
    if(v.includes('/')){ const [d,m,y]=v.split('/'); return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
    const dm = v.match(/Date\((\d+),(\d+),(\d+)\)/);
    if(dm){ const y=dm[1], m=String(parseInt(dm[2])+1).padStart(2,'0'), d=dm[3].padStart(2,'0'); return `${y}-${m}-${d}`; }
  }
  return null;
}
function extractCellValue(cell){
  if(cell===null || cell===undefined) return '';
  if(typeof cell==='object') return (cell.v ?? cell.f ?? '').toString().trim();
  return cell.toString().trim();
}

/* ================== Ingestão: CAP / CAR (Empoderamento — Conta Azul) ================== */
// tipoLancamento: 'pagar' (CAP) ou 'receber' (CAR)
function rowsFromCapCar(table, tipoLancamento){
  const raw = parseGvizRows(table);
  return raw.map(r=>{
    const situacao = normalizeTxt(getColNormalized(r,'situacao'));
    if(situacao !== 'quitado') return null; // só realizado entra no fluxo (aberto/atrasado/perdido ficam de fora nesta versão)

    const dateRaw = getColNormalized(r, 'data de vencimento');
    const date = parseDateCell(typeof dateRaw==='object' && dateRaw!==null ? (dateRaw.v||dateRaw) : dateRaw);
    if(!date) return null;

    const categoria = (getColNormalized(r, 'categoria 1') || 'Sem categoria').toString().trim();

    let valor;
    if(tipoLancamento === 'pagar'){
      valor = -Math.abs(parseMoneyBR(getColNormalized(r, 'valor total pago da parcela (r$)')));
    } else {
      valor = Math.abs(parseMoneyBR(getColNormalized(r, 'valor total recebido da parcela (r$)')));
    }
    if(!valor) return null; // linha quitada com valor zerado não soma nada e não precisa aparecer

    const grupo = tipoLancamento==='pagar' ? 'PAGAMENTOS' : 'RECEBIMENTOS';
    const conta = (getColNormalized(r,'conta bancaria')||'Não informada').toString().trim();
    const nome = (
      getColNormalized(r, tipoLancamento==='pagar' ? 'nome do fornecedor' : 'nome do cliente') || ''
    ).toString().trim();
    const documento = (getColNormalized(r,'nota fiscal') || getColNormalized(r,'codigo de referencia') || '').toString().trim();
    const historico = (getColNormalized(r,'descricao') || getColNormalized(r,'observacoes') || '').toString().trim();

    return { date, categoria, grupo, valor, conta, empresa:'Empoderamento', fonte: tipoLancamento==='pagar'?'CAP':'CAR', nome, documento, historico };
  }).filter(Boolean);
}

/* ================== Ingestão: Movimentação da Conta Uuizz (Mister Wiz — Omie) ================== */
function rowsFromMovimentacao(table){
  const raw = parseGvizRows(table);
  return raw.map(r=>{
    const clienteFornecedor = (getColNormalized(r, 'cliente ou fornecedor')||'').toString().trim();
    if(normalizeTxt(clienteFornecedor)==='saldo' || normalizeTxt(clienteFornecedor)==='saldo anterior') return null; // linhas marcadoras, não lançamentos

    const situacao = normalizeTxt(getColNormalized(r, 'situacao'));
    if(situacao !== 'conciliado') return null; // só realizado entra no fluxo nesta versão

    const dateRaw = getColNormalized(r, 'data');
    const date = parseDateCell(typeof dateRaw==='object' && dateRaw!==null ? (dateRaw.v||dateRaw) : dateRaw);
    if(!date) return null;

    const categoria = (getColNormalized(r, 'categoria') || 'Sem categoria').toString().trim();
    const valorRaw = getColNormalized(r, 'valor (r$)');
    const valor = parseMoneyBR(typeof valorRaw==='object' && valorRaw!==null ? (valorRaw.v ?? valorRaw.f) : valorRaw);
    if(!valor) return null;

    const grupo = valor >= 0 ? 'RECEBIMENTOS' : 'PAGAMENTOS';
    const conta = (getColNormalized(r, 'conta corrente')||'Não informada').toString().trim();
    const documento = (getColNormalized(r,'documento') || getColNormalized(r,'nota fiscal') || '').toString().trim();
    const historico = (getColNormalized(r,'observacoes') || '').toString().trim();

    return { date, categoria, grupo, valor, conta, empresa:'Mister Wiz', fonte:'Movimentação', nome: clienteFornecedor, documento, historico };
  }).filter(Boolean);
}

/* ================== Estado global ================== */
let rows = []; // { date, categoria, grupo, valor, conta, empresa, fonte, nome, documento, historico }
let currentUser = null;
let gpsStaff = false;
let empresaFiltro = 'global'; // 'global' | 'Empoderamento' | 'Mister Wiz'
const LIMITE_CONTA = 0; // nenhuma das duas empresas pode operar no vermelho

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
    for(const r of relevantRows){ if(r.date > override.data_referencia && r.date<=uptoDate) s += r.valor; }
    return s;
  }
  let s = 0;
  for(const r of relevantRows){ if(r.date<=uptoDate) s += r.valor; }
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
const isCategoria = (grupo,c) => r => r.grupo===grupo && r.categoria===c;

/* ================== ÁRVORE DE LINHAS ================== */
let rowTree = [];
function buildRowTree(){
  const scoped = rowsInScope();
  const catsRec = Array.from(new Set(scoped.filter(isRecebimento).map(r=>r.categoria))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const catsPag = Array.from(new Set(scoped.filter(isPagamento).map(r=>r.categoria))).sort((a,b)=>a.localeCompare(b,'pt-BR'));

  const recebimentosNode = {
    type:'recebimentos', level:0, label:'RECEBIMENTOS', filter:isRecebimento, expanded:false,
    children: catsRec.map(c=>({ type:'cat', level:1, label:c, filter:isCategoria('RECEBIMENTOS',c), expanded:false, children:[] }))
  };
  const pagamentosNode = {
    type:'pagamentos', level:0, label:'PAGAMENTOS', filter:isPagamento, expanded:true,
    children: catsPag.map(c=>({ type:'cat', level:1, label:c, filter:isCategoria('PAGAMENTOS',c), expanded:false, children:[] }))
  };

  const nodes = [
    { type:'saldo', level:0, label:'SALDO ACUMULADO', special:'saldo', expanded:false, children:[] },
    recebimentosNode,
    pagamentosNode,
  ];

  const ajustesCats = Array.from(new Set(scoped.filter(r=>r.grupo==='AJUSTES_MANUAIS').map(r=>r.categoria))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(ajustesCats.length){
    nodes.push({
      type:'ajustes', level:0, label:'LANÇAMENTOS MANUAIS (GPS)', filter:r=>r.grupo==='AJUSTES_MANUAIS', expanded:false,
      children: ajustesCats.map(c=>({ type:'cat', level:1, label:c, filter:isCategoria('AJUSTES_MANUAIS',c), expanded:false, children:[] }))
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
        const hoverCls = val>=0 ? ' fc-hover-receita' : ' fc-hover-despesa';
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
    return `<tr><td>${escapeFichaHtml(conta)}</td><td class="num" style="color:${val>=0?'#4F8F3A':'var(--red)'}">${fmtBRL(val)}</td><td class="num">${pct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</td><td class="num">${itens}</td></tr>`;
  }).join('') : `<tr><td colspan="4" style="color:var(--text3);">Nenhum lançamento encontrado.</td></tr>`;

  const linhas = detailRows.slice().sort((a,b)=>{
    const d=Math.abs(b.valor||0)-Math.abs(a.valor||0);
    return d!==0?d:(a.date<b.date?-1:a.date>b.date?1:0);
  });

  const detalheHtml = linhas.slice(0,120).map(r=>{
    const pct = total ? Math.abs(r.valor)/Math.abs(total)*100 : 0;
    const nome = r.nome || r.historico || r.categoria || 'Sem nome';
    const doc = r.documento || r.fonte || '';
    return `<tr>
      <td>${formatDateBR(r.date)}</td>
      <td>${escapeFichaHtml((r.empresa?r.empresa+' · ':'')+(r.conta||r.fonte||'Não informada'))}</td>
      <td class="wrap" title="${escapeFichaHtml(nome)}">${escapeFichaHtml(nome)}</td>
      <td class="small" title="${escapeFichaHtml(doc)}">${escapeFichaHtml(doc)}</td>
      <td class="num">${pct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</td>
      <td class="valor-modal" style="color:${r.valor>=0?'#4F8F3A':'var(--red)'}">${fmtNumeroFicha(r.valor)}</td>
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
function getLimiteContaHeaderInfo(c){
  if(!c || c.type!=='day') return null;
  const saldo = runningBalance(c.end);
  if(saldo < -LIMITE_CONTA){
    return { tipo:'alerta', severidade: getLimiteSeverity(Math.abs(saldo)), titulo:'⚠ Conta no vermelho', data:c.end, saldo, excesso: Math.abs(saldo), mensagem:'Sem limite de cheque especial — esse saldo negativo precisa de atenção.' };
  }
  const amanha = nextDateStr(c.end);
  const saldoAmanha = runningBalance(amanha);
  if(saldo >= -LIMITE_CONTA && saldoAmanha < -LIMITE_CONTA){
    return { tipo:'previo', severidade:'previo', titulo:'⚠ Alerta para amanhã', data:amanha, saldo:saldoAmanha, excesso: Math.abs(saldoAmanha), mensagem:'Amanhã o saldo fica negativo.' };
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
    rows.push({ date:a.data, categoria: a.descricao || 'Lançamento manual', grupo:'AJUSTES_MANUAIS', valor:a.valor, conta:'Lançamentos manuais', empresa:a.empresa, fonte:'Manual' });
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
