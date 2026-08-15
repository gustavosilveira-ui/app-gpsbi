(function(){
  'use strict';

  const RPC_BY_APP = Object.freeze({
    jambuzada: 'can_access_jambuzada',
    tangram: 'can_access_tangram'
  });

  window.requireGpsbiAppAccess = async function(sb, appSlug, loginUrl){
    const rpc = RPC_BY_APP[appSlug];
    if(!sb || !rpc) throw new Error('Configuração de segurança inválida.');

    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    const session = sessionData?.session || null;
    if(sessionError || !session){
      window.location.replace(loginUrl || 'index.html');
      return null;
    }

    const { data: allowed, error: accessError } = await sb.rpc(rpc);
    if(accessError || allowed !== true){
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
    const { data, error } = await sb.rpc(rpc);
    return !error && data === true;
  };
})();
