(function(){
  'use strict';

  const RPC_BY_APP = Object.freeze({
    jambuzada: 'can_access_jambuzada',
    tangram: 'can_access_tangram'
  });

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function verifyAccess(sb, rpc){
    let lastError = null;
    for(let attempt=0; attempt<3; attempt++){
      const {data, error} = await sb.rpc(rpc);
      if(!error) return data === true;
      lastError = error;
      if(attempt === 0) await sb.auth.refreshSession();
      await wait(250 * (attempt + 1));
    }
    throw lastError || new Error('Não foi possível validar o acesso.');
  }

  window.requireGpsbiAppAccess = async function(sb, appSlug, loginUrl){
    const rpc = RPC_BY_APP[appSlug];
    if(!sb || !rpc) throw new Error('Configuração de segurança inválida.');

    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    const session = sessionData?.session || null;
    if(sessionError || !session){
      window.location.replace(loginUrl || 'index.html');
      return null;
    }

    let allowed;
    try{
      allowed = await verifyAccess(sb, rpc);
    }catch(error){
      document.documentElement.style.visibility = 'visible';
      alert('Não foi possível validar sua sessão agora. Atualize a página e tente novamente.');
      return null;
    }
    if(!allowed){
      await sb.auth.signOut();
      const target = new URL(loginUrl || 'index.html', window.location.href);
      target.searchParams.set('acesso', 'negado');
      window.location.replace(target.href);
      return null;
    }

    return session;
  };

  window.checkGpsbiAppAccess = async function(sb, appSlug){
    const rpc = RPC_BY_APP[appSlug];
    if(!sb || !rpc) return false;
    return verifyAccess(sb, rpc);
  };
})();
