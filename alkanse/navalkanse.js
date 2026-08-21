/* Hub GPSBI · Alkanse — navegação compartilhada */
(function(){
  const PAGES=[
    {href:'painel.html#dashboard',label:'🛠️ Serviços',key:'painel'},
    {href:'fluxodecaixa.html',label:'💰 Fluxo de Caixa',key:'fluxodecaixa'},
    {href:'comercial.html',label:'📈 Comercial',key:'comercial'},
    {href:'painel.html#agenda',label:'🗓️ Agenda',key:'agenda'},
    {href:'painel.html#mural',label:'📣 Mural Corporativo',key:'mural'},
    {href:'painel.html#aprovacoes',label:'✅ Aprovações',key:'aprovacoes'}
  ];
  function currentKey(){
    const f=(location.pathname.split('/').pop()||'').toLowerCase();
    const h=(location.hash||'').toLowerCase();
    if(f==='fluxodecaixa.html') return 'fluxodecaixa';
    if(f==='comercial.html') return 'comercial';
    if(f==='painel.html'){ if(h==='#agenda')return'agenda'; if(h==='#mural')return'mural'; if(h==='#aprovacoes')return'aprovacoes'; return 'painel';}
    return '';
  }
  function normalizeNav(){
    const nav=document.querySelector('.app-nav, .topbar nav'); if(!nav) return;
    const active=currentKey();
    nav.innerHTML=PAGES.map(p=>`<a href="${p.href}" class="${p.key===active?'active':''}" ${p.key==='fluxodecaixa'?'id="navFluxo"':''} ${p.key==='mural'?'id="navMural"':''}>${p.label}</a>`).join('');
  }
  function theme(t){ document.documentElement.classList.toggle('light',t==='light'); localStorage.setItem('alkanse_theme',t); }
  function wireTheme(){
    const saved=localStorage.getItem('alkanse_theme')||'light'; theme(saved);
    const d=document.getElementById('appBtnDark'), l=document.getElementById('appBtnLight');
    if(d) d.onclick=()=>theme('dark'); if(l) l.onclick=()=>theme('light');
  }
  function run(){normalizeNav();wireTheme();document.documentElement.style.visibility='visible'}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run); else run();
  window.alkanseNormalizeNav=normalizeNav;
})();
