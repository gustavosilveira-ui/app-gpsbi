/* ================================================================
   Hub GPSBI · Tangram Comercial — Navegação compartilhada
   ================================================================ */
const APP_PAGES = [
  { href:'painel.html', label:'📊 Dashboard', id:'navPainel' },
  { href:'simulador.html', label:'🎯 Simulador de Meta' },
  { href:'agenda.html', label:'🗓️ Minha Agenda' },
  { href:'mural.html', label:'📣 Mural Corporativo', id:'navMural' },
  { href:'aprovacoes.html', label:'✅ Aprovações' },
];
const APP_PAGE_COMISSAO = { href:'comissao.html', label:'💰 Comissão', id:'navComissao' };
const APP_PAGE_FLUXO = { href:'fluxodecaixa.html', label:'💰 Fluxo de Caixa', id:'navFluxo' };
function _navCanSeeRestrito(email){
  email = (email||'').toLowerCase();
  return email.endsWith('@gpsbi.com.br') || email === 'anderson@tangrampersonalizados.com.br';
}
function _navCanSeeFluxo(email){ return _navCanSeeRestrito(email); }
function _navCanSeeComissao(email){ return _navCanSeeRestrito(email); }

let _appNavSb = null, _appNavUser = null;

function appApplyTheme(t, skipSync){
  document.documentElement.classList.toggle('light', t==='light');
  localStorage.setItem('tangram_theme', t);
  const bd = document.getElementById('appBtnDark'), bl = document.getElementById('appBtnLight');
  if(bd) bd.classList.toggle('active', t==='dark');
  if(bl) bl.classList.toggle('active', t==='light');
  // guarda a preferência na própria conta, pra acompanhar o usuário em qualquer aparelho
  if(!skipSync && _appNavSb && _appNavUser){ _appNavSb.auth.updateUser({ data: { theme: t } }).catch(()=>{}); }
}

function renderAppNav({ activePage, userLabel, userRole, onLogout, sb, currentUser }){
  _appNavSb = sb || null;
  _appNavUser = currentUser || null;

  // preferência salva na CONTA tem prioridade; sem isso, cai pro que já tinha no navegador;
  // sem nenhum dos dois (primeiro acesso), o padrão é o tema CLARO.
  const savedInAccount = currentUser && currentUser.user_metadata && currentUser.user_metadata.theme;
  const theme = savedInAccount || localStorage.getItem('tangram_theme') || 'light';
  document.documentElement.classList.toggle('light', theme==='light');

  const emailAtual = currentUser && currentUser.email;
  let pages = [...APP_PAGES];
  if(_navCanSeeComissao(emailAtual)) pages.push(APP_PAGE_COMISSAO);
  if(_navCanSeeFluxo(emailAtual)) pages.push(APP_PAGE_FLUXO);
  const navLinks = pages.map(p=>{
    const cls = p.href===activePage ? 'active' : '';
    const idAttr = p.id ? ` id="${p.id}"` : '';
    return `<a class="${cls}"${idAttr} href="${p.href}">${p.label}</a>`;
  }).join('');

  const initials = (userLabel||'--').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

  const html = `
  <div class="app-topbar">
    <div class="app-brand"><span class="dot"></span> Hub GPSBI</div>
    <nav class="app-nav">${navLinks}</nav>
    <div class="app-right">
      <div class="app-theme-toggle" id="appThemeToggle">
        <button id="appBtnDark" title="Escuro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg></button>
        <button id="appBtnLight" title="Claro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg></button>
      </div>
      <div class="app-user-chip"><div class="app-user-avatar">${initials}</div><span>${userLabel||''}${userRole==='owner' ? ' 👑' : ''}</span></div>
      <div class="app-logout" id="appLogoutBtn" title="Sair"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg></div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('afterbegin', html);

  appApplyTheme(theme, true);
  if(savedInAccount) localStorage.setItem('tangram_theme', theme); // mantém o cache local sincronizado
  document.getElementById('appBtnDark').addEventListener('click', ()=>appApplyTheme('dark'));
  document.getElementById('appBtnLight').addEventListener('click', ()=>appApplyTheme('light'));
  document.getElementById('appLogoutBtn').addEventListener('click', onLogout);

  document.documentElement.style.visibility = 'visible';

  // Notificação no menu: badge com a contagem de não lidas em Fluxo de
  // Caixa, BI Comercial e Mural Corporativo. Fica aqui no nav.js
  // compartilhado pra não precisar repetir em cada página.
  if(currentUser && currentUser.email) aplicarBadgesNav(currentUser.email);
}

async function aplicarBadgesNav(email){
  if(!_appNavSb) return;
  try{
    const [fluxoQ, fluxoLidasQ, comercialQ, comercialLidasQ, muralQ, muralLidasQ] = await Promise.all([
      _appNavSb.from('fluxo_mensagens').select('id').in('tipo',['observacao','aviso']),
      _appNavSb.from('fluxo_mensagens_leituras').select('mensagem_id').eq('usuario_email', email),
      _appNavSb.from('comercial_mensagens').select('id').in('tipo',['observacao','aviso']),
      _appNavSb.from('comercial_mensagens_leituras').select('mensagem_id').eq('usuario_email', email),
      _appNavSb.from('comunicados').select('id'),
      _appNavSb.from('comunicado_leituras').select('comunicado_id').eq('usuario_email', email),
    ]);
    const naoLidas = (todos, lidas, campoLido) => {
      const lidosSet = new Set((lidas||[]).map(l=>l[campoLido]));
      return (todos||[]).filter(x=>!lidosSet.has(x.id)).length;
    };
    pintarBadgeNav('navFluxo', naoLidas(fluxoQ.data, fluxoLidasQ.data, 'mensagem_id'));
    pintarBadgeNav('navPainel', naoLidas(comercialQ.data, comercialLidasQ.data, 'mensagem_id'));
    pintarBadgeNav('navMural', naoLidas(muralQ.data, muralLidasQ.data, 'comunicado_id'));
  }catch(e){ console.error('Erro ao calcular notificações do menu:', e); }
}
function pintarBadgeNav(navId, count){
  const linkEl = document.getElementById(navId);
  if(!linkEl) return; // link pode nem existir nessa página, ou ter sido escondido (ex: sem acesso ao Fluxo)
  const existente = linkEl.querySelector('.nav-badge');
  if(existente) existente.remove();
  if(count>0){
    const span = document.createElement('span');
    span.className = 'nav-badge';
    span.textContent = count>99 ? '99+' : String(count);
    linkEl.appendChild(span);
  }
}
