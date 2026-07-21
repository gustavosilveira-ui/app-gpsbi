const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
const qs=s=>document.querySelector(s);
function authGuard(){if(location.pathname.endsWith('index.html')||location.pathname==='/')return;if(!sessionStorage.getItem('domine_session'))location.href='index.html'}
function initCommon(){authGuard();const theme=localStorage.getItem('domine_theme')||'light';document.documentElement.dataset.theme=theme;qs('#themeBtn')?.addEventListener('click',()=>{const n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;localStorage.setItem('domine_theme',n)});qs('#logoutBtn')?.addEventListener('click',()=>{sessionStorage.removeItem('domine_session');location.href='index.html'})}
document.addEventListener('DOMContentLoaded',initCommon);
