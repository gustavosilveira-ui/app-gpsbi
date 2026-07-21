/**
 * ================================================================
 * Hub GPSBI · Domine — Code.gs
 * Tudo dentro de um único projeto Apps Script, sem Supabase.
 * A própria planilha "Dash Domine" funciona como banco de dados
 * pras partes novas (login, mural, agenda, aprovações, metas).
 *
 * ABAS NOVAS QUE PRECISAM EXISTIR NA PLANILHA (crie manualmente,
 * com esses nomes e cabeçalhos exatos — a primeira execução de
 * qualquer função tenta criar as que faltarem automaticamente):
 *
 * Usuarios         | usuario | senha | nome | papel (admin/comum)
 * Sessoes          | token | usuario | criado_em
 * MetasSemanais    | empresa | data_inicio_vigencia | domingo | segunda | terca | quarta | quinta | sexta | sabado
 * Mural            | id | autor | titulo | mensagem | fixado | criado_em
 * MuralLeituras    | id | mural_id | usuario | lido_em
 * Tarefas          | id | usuario | titulo | data_tarefa | feito
 * Aprovacoes       | id | solicitante | motorista | tipo | descricao | status | resposta | respondido_por | respondido_em | criado_em
 * ================================================================
 */

const SPREADSHEET_ID = "1IP3vWWdJhVa3pdoQ-2UQUWobAMxhXF9e9vO7i0BNCik";
const BASE_SHEET = "Base_Dash";
const SESSAO_VALIDADE_HORAS = 12;

function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

/* ================== Roteamento ================== */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || "login";
  const token = (e && e.parameter && e.parameter.token) || "";

  if (page !== "login") {
    const sessao = validarToken_(token);
    if (!sessao) {
      const t = HtmlService.createTemplateFromFile("Login");
      t.erro = "Sua sessão expirou. Entre novamente.";
      return t.evaluate().setTitle("Hub GPSBI · Domine").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  let arquivo = "Login";
  if (page === "painel") arquivo = "Painel";
  else if (page === "mural") arquivo = "Mural";
  else if (page === "agenda") arquivo = "Agenda";
  else if (page === "aprovacoes") arquivo = "Aprovacoes";

  const template = HtmlService.createTemplateFromFile(arquivo);
  template.token = token;
  template.empresa = (e && e.parameter && e.parameter.empresa) || "DC";
  return template.evaluate()
    .setTitle("Hub GPSBI · Domine")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

/* ================== Autenticação (login fixo, sem Supabase) ==================
   Aviso de segurança (já alinhado com o Gustavo): isso é mais simples que
   login de verdade — a senha fica em texto simples na aba "Usuarios" e a
   sessão é só um token aleatório guardado na planilha. Adequado pra um
   painel operacional interno, não pra dado sensível. */
function getSheetOrCreate_(nome, cabecalho) {
  const ss = ss_();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.appendRow(cabecalho);
  }
  return sh;
}

function sheetParaObjetos_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift();
  return values.map((row, i) => {
    const obj = { _linha: i + 2 }; // linha real na planilha (1-based, +1 pelo cabeçalho)
    headers.forEach((h, idx) => { obj[h] = row[idx]; });
    return obj;
  });
}

function login(usuario, senha) {
  const sh = getSheetOrCreate_("Usuarios", ["usuario", "senha", "nome", "papel"]);
  const usuarios = sheetParaObjetos_(sh);
  const encontrado = usuarios.find(u =>
    String(u.usuario || "").trim().toLowerCase() === String(usuario || "").trim().toLowerCase() &&
    String(u.senha || "") === String(senha || "")
  );
  if (!encontrado) return { ok: false, erro: "Usuário ou senha inválidos." };

  const token = Utilities.getUuid();
  const sessoes = getSheetOrCreate_("Sessoes", ["token", "usuario", "criado_em"]);
  sessoes.appendRow([token, encontrado.usuario, new Date()]);

  return { ok: true, token: token, nome: encontrado.nome || encontrado.usuario, papel: encontrado.papel || "comum" };
}

function validarToken_(token) {
  if (!token) return null;
  const sh = getSheetOrCreate_("Sessoes", ["token", "usuario", "criado_em"]);
  const sessoes = sheetParaObjetos_(sh);
  const s = sessoes.find(x => x.token === token);
  if (!s) return null;
  const criado = new Date(s.criado_em);
  const horas = (new Date() - criado) / 36e5;
  if (horas > SESSAO_VALIDADE_HORAS) return null;
  return { usuario: s.usuario };
}

function getUsuarioLogado(token) {
  const s = validarToken_(token);
  if (!s) return null;
  const sh = getSheetOrCreate_("Usuarios", ["usuario", "senha", "nome", "papel"]);
  const usuarios = sheetParaObjetos_(sh);
  const u = usuarios.find(x => x.usuario === s.usuario);
  if (!u) return null;
  return { usuario: u.usuario, nome: u.nome || u.usuario, papel: u.papel || "comum" };
}

// Usado na tela de login (ainda sem sessão) — autentica direto por
// usuário + senha atual, sem precisar de token.
function trocarSenhaComUsuario(usuario, senhaAtual, senhaNova) {
  const sh = getSheetOrCreate_("Usuarios", ["usuario", "senha", "nome", "papel"]);
  const usuarios = sheetParaObjetos_(sh);
  const u = usuarios.find(x => String(x.usuario || "").trim().toLowerCase() === String(usuario || "").trim().toLowerCase());
  if (!u) return { ok: false, erro: "Usuário não encontrado." };
  if (String(u.senha) !== String(senhaAtual)) return { ok: false, erro: "Senha atual incorreta." };
  if (!senhaNova || senhaNova.length < 4) return { ok: false, erro: "A nova senha precisa ter pelo menos 4 caracteres." };
  sh.getRange(u._linha, 2).setValue(senhaNova);
  return { ok: true };
}

function trocarSenha(token, senhaAtual, senhaNova) {
  const s = validarToken_(token);
  if (!s) return { ok: false, erro: "Sessão expirada." };
  const sh = getSheetOrCreate_("Usuarios", ["usuario", "senha", "nome", "papel"]);
  const usuarios = sheetParaObjetos_(sh);
  const u = usuarios.find(x => x.usuario === s.usuario);
  if (!u) return { ok: false, erro: "Usuário não encontrado." };
  if (String(u.senha) !== String(senhaAtual)) return { ok: false, erro: "Senha atual incorreta." };
  if (!senhaNova || senhaNova.length < 4) return { ok: false, erro: "A nova senha precisa ter pelo menos 4 caracteres." };
  sh.getRange(u._linha, 2).setValue(senhaNova); // coluna 2 = senha
  return { ok: true };
}

function logout(token) {
  const sh = getSheetOrCreate_("Sessoes", ["token", "usuario", "criado_em"]);
  const sessoes = sheetParaObjetos_(sh);
  const s = sessoes.find(x => x.token === token);
  if (s) sh.deleteRow(s._linha);
  return { ok: true };
}

/* ================== Dashboard (Painel) ================== */
function getDashboardData(token, empresa) {
  if (!validarToken_(token)) throw new Error("Sessão expirada.");

  const ss = ss_();
  const sh = ss.getSheetByName(BASE_SHEET);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();

  const colPeriodo = findColumn(headers, ["Período"]);
  const colEmpresa = findColumn(headers, ["Empresa"]);
  const colDataEntrega = findColumn(headers, ["DATA Entrega"]);
  const colRota = findColumn(headers, ["Rota"]);
  const colMotorista = findColumn(headers, ["MOTORISTA"]);
  const colStatus = findColumn(headers, ["STATUS"]);
  const colTipoFrete = findColumn(headers, ["Tipo de Frete"]);
  const colValorFreteTac = findColumn(headers, ["Valor Frete Tac"]);

  const dataEmpresa = values.filter(row =>
    normalizarTexto(row[colEmpresa]) === normalizarTexto(empresa)
  );

  const ultimoPeriodo = getUltimoPeriodo(dataEmpresa, colDataEntrega);

  const dataPeriodo = dataEmpresa.filter(row =>
    String(row[colPeriodo] || "").trim() === ultimoPeriodo
  );

  const diasSemana = montarDiasSemana(
    empresa, dataPeriodo, colDataEntrega, colRota, colMotorista, colStatus
  );

  const resumoFrete = montarResumoFrete(
    dataPeriodo, colTipoFrete, colValorFreteTac, colRota
  );

  const totalRealizado = diasSemana.reduce((soma, item) => soma + item.realizado, 0);
  const totalPrevisto = diasSemana.reduce((soma, item) => soma + item.previsto, 0);

  const resumoMes = montarResumoMes(
    empresa, dataEmpresa, colDataEntrega, colRota, colMotorista, colStatus, totalPrevisto
  );

  return {
    empresa, periodoAtual: ultimoPeriodo,
    previsto: totalPrevisto, realizado: totalRealizado,
    percMeta: percentual(totalRealizado, totalPrevisto),
    frete: resumoFrete,
    semana: { previsto: totalPrevisto, realizado: totalRealizado, percMeta: percentual(totalRealizado, totalPrevisto) },
    mes: resumoMes,
    diasSemana: diasSemana
  };
}

function getDetalheOperacional(token, empresa) {
  if (!validarToken_(token)) throw new Error("Sessão expirada.");

  const ss = ss_();
  const sh = ss.getSheetByName(BASE_SHEET);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();

  const colPeriodo = findColumn(headers, ["Período"]);
  const colEmpresa = findColumn(headers, ["Empresa"]);
  const colDataEntrega = findColumn(headers, ["DATA Entrega"]);

  const dataEmpresa = values.filter(row =>
    normalizarTexto(row[colEmpresa]) === normalizarTexto(empresa)
  );

  const ultimoPeriodo = getUltimoPeriodo(dataEmpresa, colDataEntrega);
  const dataPeriodo = dataEmpresa.filter(row =>
    String(row[colPeriodo] || "").trim() === ultimoPeriodo
  );

  let colunas;
  if (normalizarTexto(empresa) === "DC") {
    colunas = ["Período","DATA Entrega","Nº PEDIDO LOJA","Peso / Volume","MOTORISTA","Placa","Rota","Hora Agendamento","Saida","CHEGADA na loja","SAÍDA/LOJA","Tipo de Frete","Valor Frete Tac","LEGENDA"];
  } else {
    colunas = ["Período","DATA Entrega","Operação","Nº PEDIDO LOJA","Peso / Volume","MOTORISTA","Rota","Saida","CHEGADA na loja","SAÍDA/LOJA","Tipo de Frete","Valor Frete Tac","LEGENDA"];
  }

  const colunasDeHorario = ["Hora Agendamento","Saida","Chegada CD","CHEGADA na loja","SAÍDA/LOJA","Saída CD"];
  const indices = colunas.map(nome => findColumn(headers, [nome]));

  const linhas = dataPeriodo
    .map(row => indices.map((index, i) => {
      if (index === -1) return "";
      const ehHorario = colunasDeHorario.indexOf(colunas[i]) !== -1;
      return formatarValor(row[index], ehHorario);
    }))
    .filter(row => row.some(valor => String(valor || "").trim() !== ""));

  return { empresa, periodoAtual: ultimoPeriodo, colunas, linhas };
}

function montarDiasSemana(empresa, dataPeriodo, colDataEntrega, colRota, colMotorista, colStatus) {
  const dias = [
    { nome: "Domingo", previsto: getMetaDia(empresa, 0), realizado: 0 },
    { nome: "Segunda", previsto: getMetaDia(empresa, 1), realizado: 0 },
    { nome: "Terça", previsto: getMetaDia(empresa, 2), realizado: 0 },
    { nome: "Quarta", previsto: getMetaDia(empresa, 3), realizado: 0 },
    { nome: "Quinta", previsto: getMetaDia(empresa, 4), realizado: 0 },
    { nome: "Sexta", previsto: getMetaDia(empresa, 5), realizado: 0 },
    { nome: "Sábado", previsto: getMetaDia(empresa, 6), realizado: 0 }
  ];
  const controleCF = {};

  dataPeriodo.forEach(row => {
    const dataEntrega = normalizarData(row[colDataEntrega]);
    const status = Number(row[colStatus]);
    if (!dataEntrega || status !== 3) return;
    const diaSemana = dataEntrega.getDay();

    if (normalizarTexto(empresa) === "C&F") {
      const motorista = String(row[colMotorista] || "").trim();
      if (!motorista) return;
      const chave = diaSemana + "|" + motorista;
      if (!controleCF[chave]) { controleCF[chave] = true; dias[diaSemana].realizado++; }
    } else {
      if (ehSaidaValida(row[colRota])) dias[diaSemana].realizado++;
    }
  });

  return dias.map(item => ({
    nome: item.nome, realizado: item.realizado, previsto: item.previsto,
    percMeta: percentual(item.realizado, item.previsto)
  }));
}

// "Mês" = previsto da semana atual × 4 (confirmado com o cliente — não é
// soma dia-a-dia do calendário do mês, que dava um número torto).
function montarResumoMes(empresa, dataEmpresa, colDataEntrega, colRota, colMotorista, colStatus, previstoSemanaAtual) {
  let ultimaData = null;
  dataEmpresa.forEach(row => {
    const d = normalizarData(row[colDataEntrega]);
    if (d && (!ultimaData || d > ultimaData)) ultimaData = d;
  });
  if (!ultimaData) return { previsto: 0, realizado: 0, percMeta: 0 };

  const ano = ultimaData.getFullYear();
  const mes = ultimaData.getMonth();
  const dataDoMes = dataEmpresa.filter(row => {
    const d = normalizarData(row[colDataEntrega]);
    return d && d.getFullYear() === ano && d.getMonth() === mes;
  });

  const previstoMes = previstoSemanaAtual * 4;

  let realizadoMes = 0;
  const controleCF = {};
  dataDoMes.forEach(row => {
    const dataEntrega = normalizarData(row[colDataEntrega]);
    const status = Number(row[colStatus]);
    if (!dataEntrega || status !== 3) return;
    if (normalizarTexto(empresa) === "C&F") {
      const motorista = String(row[colMotorista] || "").trim();
      if (!motorista) return;
      const chave = Utilities.formatDate(dataEntrega, "America/Sao_Paulo", "yyyy-MM-dd") + "|" + motorista;
      if (!controleCF[chave]) { controleCF[chave] = true; realizadoMes++; }
    } else {
      if (ehSaidaValida(row[colRota])) realizadoMes++;
    }
  });

  return { previsto: previstoMes, realizado: realizadoMes, percMeta: percentual(realizadoMes, previstoMes) };
}

// Frete: só conta a 1ª parada de cada saída (Rota reconhecida por
// ehSaidaValida), sem exigir status Finalizado — confirmado com o cliente.
function montarResumoFrete(dataPeriodo, colTipoFrete, colValorFreteTac, colRota) {
  const tipos = {};
  let totalFrete = 0, qtdComFrete = 0, qtdTotal = 0;

  dataPeriodo.forEach(row => {
    const rota = colRota === -1 ? "" : row[colRota];
    if (!ehSaidaValida(rota)) return;

    const tipo = colTipoFrete === -1 ? "Não informado" : String(row[colTipoFrete] || "Não informado").trim();
    const valor = colValorFreteTac === -1 ? 0 : converterNumero(row[colValorFreteTac]);

    if (!tipos[tipo]) tipos[tipo] = { tipo: tipo, qtd: 0, valor: 0 };
    tipos[tipo].qtd++;
    tipos[tipo].valor += valor;
    qtdTotal++;
    if (valor > 0) { totalFrete += valor; qtdComFrete++; }
  });

  const porTipo = Object.values(tipos)
    .map(item => ({ tipo: item.tipo, qtd: item.qtd, valor: Math.round(item.valor * 100) / 100, percQtd: percentual(item.qtd, qtdTotal) }))
    .sort((a, b) => b.valor - a.valor);

  return {
    totalFrete: Math.round(totalFrete * 100) / 100,
    qtdComFrete: qtdComFrete,
    qtdTotal: qtdTotal,
    ticketMedioFrete: qtdComFrete > 0 ? Math.round((totalFrete / qtdComFrete) * 100) / 100 : 0,
    porTipo: porTipo
  };
}

/* ================== Metas semanais (editável pelo usuário) ==================
   Substitui as constantes fixas de antes (getMetaDia hardcoded). Agora lê
   da aba "MetasSemanais": pra cada empresa, pode ter várias "vigências"
   (a partir de qual data cada meta vale) — sempre usa a vigência mais
   recente que já começou. Isso permite mudar a meta ao longo do tempo
   sem perder o histórico de quanto era a meta antes. */
const DIAS_SEMANA_KEYS = ["domingo","segunda","terca","quarta","quinta","sexta","sabado"];

function seedMetasSemanaisSeVazia_() {
  const sh = getSheetOrCreate_("MetasSemanais", ["empresa","data_inicio_vigencia","domingo","segunda","terca","quarta","quinta","sexta","sabado"]);
  if (sh.getLastRow() > 1) return; // já tem dado, não sobrescreve
  const dataAntiga = new Date(2020, 0, 1);
  sh.appendRow(["DC", dataAntiga, 5, 30, 30, 25, 15, 30, 15]);
  sh.appendRow(["BENASSI", dataAntiga, 15, 15, 15, 15, 15, 15, 15]);
}

function getMetaDia(empresa, diaSemana, dataRef) {
  seedMetasSemanaisSeVazia_();
  const sh = ss_().getSheetByName("MetasSemanais");
  const linhas = sheetParaObjetos_(sh);
  const emp = normalizarTexto(empresa);
  const ref = dataRef || new Date();

  const candidatas = linhas.filter(l => normalizarTexto(l.empresa) === emp && new Date(l.data_inicio_vigencia) <= ref);
  if (!candidatas.length) return 0;
  candidatas.sort((a, b) => new Date(b.data_inicio_vigencia) - new Date(a.data_inicio_vigencia));
  const vigente = candidatas[0];
  return Number(vigente[DIAS_SEMANA_KEYS[diaSemana]] || 0);
}

function getMetasVigentes(token, empresa) {
  if (!validarToken_(token)) throw new Error("Sessão expirada.");
  seedMetasSemanaisSeVazia_();
  const sh = ss_().getSheetByName("MetasSemanais");
  const linhas = sheetParaObjetos_(sh).filter(l => normalizarTexto(l.empresa) === normalizarTexto(empresa));
  linhas.sort((a, b) => new Date(b.data_inicio_vigencia) - new Date(a.data_inicio_vigencia));
  return linhas.map(l => ({
    dataInicioVigencia: Utilities.formatDate(new Date(l.data_inicio_vigencia), "America/Sao_Paulo", "dd/MM/yyyy"),
    valores: DIAS_SEMANA_KEYS.map(k => Number(l[k] || 0)),
    total: DIAS_SEMANA_KEYS.reduce((s, k) => s + Number(l[k] || 0), 0)
  }));
}

// valores = [domingo, segunda, terca, quarta, quinta, sexta, sabado]
function salvarMetaSemanal(token, empresa, dataInicioVigenciaStr, valores) {
  if (!validarToken_(token)) return { ok: false, erro: "Sessão expirada." };
  if (!empresa || !dataInicioVigenciaStr || !valores || valores.length !== 7) {
    return { ok: false, erro: "Preencha empresa, data de início e os 7 dias da semana." };
  }
  const partes = dataInicioVigenciaStr.split("-"); // espera "yyyy-MM-dd" (input type=date)
  const dataInicio = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));

  const sh = getSheetOrCreate_("MetasSemanais", ["empresa","data_inicio_vigencia","domingo","segunda","terca","quarta","quinta","sexta","sabado"]);
  sh.appendRow([empresa, dataInicio, ...valores.map(Number)]);
  return { ok: true };
}

/* ================== Mural ================== */
function getMural(token) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) throw new Error("Sessão expirada.");
  const sh = getSheetOrCreate_("Mural", ["id","autor","titulo","mensagem","fixado","criado_em"]);
  const leiturasSh = getSheetOrCreate_("MuralLeituras", ["id","mural_id","usuario","lido_em"]);
  const posts = sheetParaObjetos_(sh);
  const leituras = sheetParaObjetos_(leiturasSh);
  posts.sort((a, b) => {
    if (!!a.fixado !== !!b.fixado) return a.fixado ? -1 : 1;
    return new Date(b.criado_em) - new Date(a.criado_em);
  });
  return {
    papel: usuario.papel,
    posts: posts.map(p => ({
      id: p.id, autor: p.autor, titulo: p.titulo, mensagem: p.mensagem, fixado: !!p.fixado,
      criadoEm: Utilities.formatDate(new Date(p.criado_em), "America/Sao_Paulo", "dd/MM/yyyy HH:mm"),
      jaLeu: leituras.some(l => String(l.mural_id) === String(p.id) && l.usuario === usuario.usuario),
      totalLeituras: leituras.filter(l => String(l.mural_id) === String(p.id)).length
    }))
  };
}

function publicarMural(token, titulo, mensagem, fixado) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) return { ok: false, erro: "Sessão expirada." };
  if (usuario.papel !== "admin") return { ok: false, erro: "Só administradores podem publicar." };
  if (!titulo || !mensagem) return { ok: false, erro: "Preencha título e mensagem." };
  const sh = getSheetOrCreate_("Mural", ["id","autor","titulo","mensagem","fixado","criado_em"]);
  const id = Utilities.getUuid();
  sh.appendRow([id, usuario.nome, titulo, mensagem, !!fixado, new Date()]);
  return { ok: true };
}

function marcarMuralLido(token, muralId) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) return { ok: false, erro: "Sessão expirada." };
  const sh = getSheetOrCreate_("MuralLeituras", ["id","mural_id","usuario","lido_em"]);
  const leituras = sheetParaObjetos_(sh);
  if (leituras.some(l => String(l.mural_id) === String(muralId) && l.usuario === usuario.usuario)) return { ok: true };
  sh.appendRow([Utilities.getUuid(), muralId, usuario.usuario, new Date()]);
  return { ok: true };
}

function excluirMural(token, muralId) {
  const usuario = getUsuarioLogado(token);
  if (!usuario || usuario.papel !== "admin") return { ok: false, erro: "Sem permissão." };
  const sh = ss_().getSheetByName("Mural");
  const posts = sheetParaObjetos_(sh);
  const p = posts.find(x => String(x.id) === String(muralId));
  if (p) sh.deleteRow(p._linha);
  return { ok: true };
}

/* ================== Agenda (tarefas pessoais) ================== */
function getTarefas(token) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) throw new Error("Sessão expirada.");
  const sh = getSheetOrCreate_("Tarefas", ["id","usuario","titulo","data_tarefa","feito"]);
  const tarefas = sheetParaObjetos_(sh).filter(t => t.usuario === usuario.usuario);
  tarefas.sort((a, b) => new Date(a.data_tarefa) - new Date(b.data_tarefa));
  return tarefas.map(t => ({
    id: t.id, titulo: t.titulo,
    dataTarefa: Utilities.formatDate(new Date(t.data_tarefa), "America/Sao_Paulo", "yyyy-MM-dd"),
    feito: !!t.feito
  }));
}

function addTarefa(token, titulo, dataTarefaStr) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) return { ok: false, erro: "Sessão expirada." };
  if (!titulo) return { ok: false, erro: "Escreva a tarefa." };
  const partes = (dataTarefaStr || Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyy-MM-dd")).split("-");
  const data = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  const sh = getSheetOrCreate_("Tarefas", ["id","usuario","titulo","data_tarefa","feito"]);
  sh.appendRow([Utilities.getUuid(), usuario.usuario, titulo, data, false]);
  return { ok: true };
}

function toggleTarefa(token, tarefaId, feito) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) return { ok: false, erro: "Sessão expirada." };
  const sh = ss_().getSheetByName("Tarefas");
  const tarefas = sheetParaObjetos_(sh);
  const t = tarefas.find(x => String(x.id) === String(tarefaId) && x.usuario === usuario.usuario);
  if (!t) return { ok: false, erro: "Tarefa não encontrada." };
  sh.getRange(t._linha, 5).setValue(!!feito); // coluna 5 = feito
  return { ok: true };
}

function excluirTarefa(token, tarefaId) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) return { ok: false, erro: "Sessão expirada." };
  const sh = ss_().getSheetByName("Tarefas");
  const tarefas = sheetParaObjetos_(sh);
  const t = tarefas.find(x => String(x.id) === String(tarefaId) && x.usuario === usuario.usuario);
  if (t) sh.deleteRow(t._linha);
  return { ok: true };
}

/* ================== Aprovações ==================
   Generalizado pro contexto de logística (não é desconto de venda,
   como no modelo original da Tangram) — solicitação livre relacionada
   a um motorista/rota (troca de rota, custo extra, ajuste de horário
   etc), pra um gestor aprovar ou recusar com justificativa. Ajuste os
   rótulos se o Francisco quiser algo mais específico. */
function getAprovacoes(token) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) throw new Error("Sessão expirada.");
  const sh = getSheetOrCreate_("Aprovacoes", ["id","solicitante","motorista","tipo","descricao","status","resposta","respondido_por","respondido_em","criado_em"]);
  let lista = sheetParaObjetos_(sh);
  if (usuario.papel !== "admin") lista = lista.filter(a => a.solicitante === usuario.usuario);
  lista.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  return {
    papel: usuario.papel,
    lista: lista.map(a => ({
      id: a.id, solicitante: a.solicitante, motorista: a.motorista, tipo: a.tipo,
      descricao: a.descricao, status: a.status || "pendente", resposta: a.resposta || "",
      respondidoPor: a.respondido_por || "",
      criadoEm: Utilities.formatDate(new Date(a.criado_em), "America/Sao_Paulo", "dd/MM/yyyy HH:mm")
    }))
  };
}

function criarAprovacao(token, motorista, tipo, descricao) {
  const usuario = getUsuarioLogado(token);
  if (!usuario) return { ok: false, erro: "Sessão expirada." };
  if (!tipo || !descricao) return { ok: false, erro: "Preencha tipo e descrição." };
  const sh = getSheetOrCreate_("Aprovacoes", ["id","solicitante","motorista","tipo","descricao","status","resposta","respondido_por","respondido_em","criado_em"]);
  sh.appendRow([Utilities.getUuid(), usuario.usuario, motorista || "", tipo, descricao, "pendente", "", "", "", new Date()]);
  return { ok: true };
}

function responderAprovacao(token, aprovacaoId, status, resposta) {
  const usuario = getUsuarioLogado(token);
  if (!usuario || usuario.papel !== "admin") return { ok: false, erro: "Sem permissão." };
  const sh = ss_().getSheetByName("Aprovacoes");
  const lista = sheetParaObjetos_(sh);
  const a = lista.find(x => String(x.id) === String(aprovacaoId));
  if (!a) return { ok: false, erro: "Solicitação não encontrada." };
  sh.getRange(a._linha, 6, 1, 4).setValues([[status, resposta || "", usuario.nome, new Date()]]); // status,resposta,respondido_por,respondido_em
  return { ok: true };
}

/* ================== Utilitários (mesmos de antes) ================== */
function ehSaidaValida(rota) {
  if (!rota) return false;
  const rotaNorm = normalizarChave(rota);
  if (rotaNorm.includes("1 ENTREGA")) return true;
  if (rotaNorm.includes("1A ENTREGA")) return true;
  if (rotaNorm.includes("SAIDA 1")) return true;
  return false;
}

function getUltimoPeriodo(data, colDataEntrega) {
  let ultimaData = null;
  data.forEach(row => {
    const dataEntrega = normalizarData(row[colDataEntrega]);
    if (dataEntrega && (!ultimaData || dataEntrega > ultimaData)) ultimaData = dataEntrega;
  });
  if (!ultimaData) return "";
  const domingo = new Date(ultimaData);
  domingo.setDate(ultimaData.getDate() - ultimaData.getDay());
  const sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);
  const diaInicio = Utilities.formatDate(domingo, "America/Sao_Paulo", "dd");
  const diaFim = Utilities.formatDate(sabado, "America/Sao_Paulo", "dd");
  return diaInicio + "_" + diaFim;
}

function findColumn(headers, nomesPossiveis) {
  const headersNormalizados = headers.map(h => normalizarChave(h));
  for (let nome of nomesPossiveis) {
    const index = headersNormalizados.indexOf(normalizarChave(nome));
    if (index !== -1) return index;
  }
  return -1;
}

function normalizarChave(valor) {
  return String(valor || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/º/g, "").replace(/ª/g, "A").replace(/°/g, "")
    .replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizarTexto(valor) {
  return String(valor || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/º/g, "").replace(/ª/g, "A").replace(/°/g, "").trim();
}

function normalizarData(valor) {
  if (valor instanceof Date) { const d = new Date(valor); d.setHours(0,0,0,0); return d; }
  if (!valor) return null;
  const partes = String(valor).split("/");
  if (partes.length === 3) { const d = new Date(partes[2], partes[1]-1, partes[0]); d.setHours(0,0,0,0); return d; }
  return null;
}

function formatarValor(valor, ehHorario) {
  if (valor instanceof Date) {
    return ehHorario ? Utilities.formatDate(valor, "America/Sao_Paulo", "HH:mm") : Utilities.formatDate(valor, "America/Sao_Paulo", "dd/MM/yyyy");
  }
  if (typeof valor === "number") return valor;
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

function converterNumero(valor) {
  if (typeof valor === "number") return valor;
  if (!valor) return 0;
  return Number(String(valor).replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
}

function percentual(realizado, previsto) {
  if (!previsto) return 0;
  return Math.round((realizado / previsto) * 100);
}
