/* ================================================================
   Hub GPSBI · Alkanse — Navegação compartilhada
   Padrão visual e comportamento espelhados da Mebrasi.
   O mesmo menu aparece em TODAS as páginas.
   ================================================================ */
(function(){
  function fileName(){
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function isPainel(){ return fileName()==='painel.html'; }

  function pageHref(key){
    const onPainel=isPainel();
    if(key==='comercial') return 'comercial.html';
    if(key==='fluxo') return 'fluxodecaixa.html';
    if(key==='servicos') return onPainel ? '#dashboard' : 'painel.html#dashboard';
    if(key==='agenda') return onPainel ? '#agenda' : 'painel.html#agenda';
    if(key==='mural') return onPainel ? '#mural' : 'painel.html#mural';
    if(key==='aprovacoes') return onPainel ? '#aprovacoes' : 'painel.html#aprovacoes';
    return '#';
  }

  function currentKey(){
    const f=fileName();
    const h=(location.hash||'').toLowerCase();
    if(f==='comercial.html') return 'comercial';
    if(f==='fluxodecaixa.html') return 'fluxo';
    if(f==='painel.html'){
      if(h==='#agenda') return 'agenda';
      if(h==='#mural') return 'mural';
      if(h==='#aprovacoes') return 'aprovacoes';
      return 'servicos';
    }
    return '';
  }

  function buildLinks(){
    const active=currentKey();
    const pages=[
      {key:'comercial', label:'📊 Bi Comercial', id:'navComercial'},
      {key:'fluxo', label:'💰 Fluxo de Caixa', id:'navFluxo'},
      {key:'servicos', label:'🛠️ Serviços', id:'navServicos'},
      {key:'agenda', label:'🗓️ Agenda', id:'navAgenda'},
      {key:'mural', label:'📣 Mural Corporativo', id:'navMural'},
      {key:'aprovacoes', label:'✅ Aprovações', id:'navAprovacoes'}
    ];
    return pages.map(p=>{
      const exp=(isPainel() && ['servicos','agenda','mural','aprovacoes'].includes(p.key))
        ? ` data-experience="${p.key==='servicos'?'dashboard':p.key}"` : '';
      return `<a href="${pageHref(p.key)}" id="${p.id}" class="${p.key===active?'active':''}"${exp}>${p.label}</a>`;
    }).join('');
  }

  function normalizeTopbar(){
    const topbar=document.querySelector('.app-topbar, .topbar');
    if(!topbar) return;
    topbar.classList.add('app-topbar');

    const brand=topbar.querySelector('.app-brand, .brand');
    if(brand){
      brand.classList.add('app-brand');
      brand.innerHTML='<span class="dot"></span> Hub GPSBI';
    }

    const nav=topbar.querySelector('.app-nav, .primary-nav, nav');
    if(nav){
      nav.classList.add('app-nav');
      nav.innerHTML=buildLinks();
      if(isPainel()) nav.id='primaryNav';
    }

    const right=topbar.querySelector('.app-right, .right');
    if(right) right.classList.add('app-right');
  }

  function applyActive(){
    const active=currentKey();
    const ids={comercial:'navComercial',fluxo:'navFluxo',servicos:'navServicos',agenda:'navAgenda',mural:'navMural',aprovacoes:'navAprovacoes'};
    document.querySelectorAll('.app-nav a').forEach(a=>a.classList.remove('active'));
    const el=document.getElementById(ids[active]);
    if(el) el.classList.add('active');
  }

  function theme(t){
    document.documentElement.classList.toggle('light',t==='light');
    localStorage.setItem('alkanse_theme',t);
    const d=document.getElementById('appBtnDark')||document.getElementById('btnDark');
    const l=document.getElementById('appBtnLight')||document.getElementById('btnLight');
    if(d) d.classList.toggle('active',t==='dark');
    if(l) l.classList.toggle('active',t==='light');
  }

  function wireTheme(){
    const saved=localStorage.getItem('alkanse_theme')||'light';
    theme(saved);
    const d=document.getElementById('appBtnDark')||document.getElementById('btnDark');
    const l=document.getElementById('appBtnLight')||document.getElementById('btnLight');
    if(d) d.addEventListener('click',()=>theme('dark'));
    if(l) l.addEventListener('click',()=>theme('light'));
  }

  function run(){
    normalizeTopbar();
    wireTheme();
    applyActive();
    document.documentElement.style.visibility='visible';
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run);
  else run();
  window.addEventListener('hashchange',()=>{ normalizeTopbar(); applyActive(); });
  window.alkanseNormalizeNav=()=>{ normalizeTopbar(); applyActive(); };
})();
