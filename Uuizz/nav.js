/* ================================================================
   Hub GPSBI · Uuizz — Navegação compartilhada
   Baseado no nav.js homologado (Tangram). Dashboard, Simulador e
   Aprovações ficam FORA do menu nesta fase (não contratados / sem
   base de vendedor ainda) — reativar quando o escopo mudar.
   ================================================================ */
const APP_PAGES = [
  { href:'agenda.html', label:'🗓️ Minha Agenda' },
  { href:'mural.html', label:'📣 Mural' },
];
const APP_PAGE_FLUXO = { href:'fluxodecaixa.html', label:'💰 Fluxo de Caixa' };

// Acesso ao Fluxo: equipe GPSBI + gestora principal da Uuizz (Daniela).
function _navCanSeeFluxo(email){
  email = (email||'').toLowerCase();
  return email.endsWith('@gpsbi.com.br') || email === 'daniela@empoderamentoadolescente.com.br';
}

let _appNavSb = null, _appNavUser = null;

function appApplyTheme(t, skipSync){
  document.documentElement.classList.toggle('light', t==='light');
  localStorage.setItem('uuizz_theme', t);
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
  const theme = savedInAccount || localStorage.getItem('uuizz_theme') || 'light';
  document.documentElement.classList.toggle('light', theme==='light');

  const pages = _navCanSeeFluxo(currentUser && currentUser.email) ? [...APP_PAGES, APP_PAGE_FLUXO] : APP_PAGES;
  const navLinks = pages.map(p=>{
    const cls = p.href===activePage ? 'active' : '';
    return `<a class="${cls}" href="${p.href}">${p.label}</a>`;
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
  if(savedInAccount) localStorage.setItem('uuizz_theme', theme); // mantém o cache local sincronizado
  document.getElementById('appBtnDark').addEventListener('click', ()=>appApplyTheme('dark'));
  document.getElementById('appBtnLight').addEventListener('click', ()=>appApplyTheme('light'));
  document.getElementById('appLogoutBtn').addEventListener('click', onLogout);

  document.documentElement.style.visibility = 'visible';
}
