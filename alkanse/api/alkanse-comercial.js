// Vercel Serverless Function: /api/alkanse-comercial
// Leitura privada via Vercel OIDC + Google Workload Identity Federation.
// Requer: @vercel/oidc e google-auth-library
//
// Igual ao alkanse-financeiro.js, mas lê a aba "Vendas" em vez de
// "Financeiro". Diferença de acesso: o Comercial é aberto a QUALQUER
// usuário autenticado do Hub (não é restrito a uma lista de e-mails,
// diferente do Fluxo de Caixa) — só exige sessão válida.

import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';

function json(res,status,body){
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

async function validateUser(token){
  const url=process.env.SUPABASE_URL;
  const anon=process.env.SUPABASE_ANON_KEY;
  if(!url||!anon) throw new Error('Backend sem configuração Supabase');
  const r=await fetch(`${url}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:anon}});
  if(!r.ok) return null;
  return r.json();
}

function env(name){
  const v=process.env[name];
  if(!v) throw new Error(`${name} não configurado`);
  return v;
}

async function googleAccessToken(){
  const projectNumber=env('GCP_PROJECT_NUMBER');
  const serviceAccount=env('GCP_SERVICE_ACCOUNT_EMAIL');
  const poolId=env('GCP_WORKLOAD_IDENTITY_POOL_ID');
  const providerId=env('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID');

  const client=ExternalAccountClient.fromJSON({
    type:'external_account',
    audience:`//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
    token_url:'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    subject_token_supplier:{getSubjectToken:getVercelOidcToken}
  });
  if(!client) throw new Error('Falha ao inicializar autenticação Google');
  client.scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'];
  const t=await client.getAccessToken();
  const token=typeof t==='string'?t:t?.token;
  if(!token) throw new Error('Google não retornou access token');
  return token;
}

function valuesToTable(values){
  const data=Array.isArray(values)?values:[];
  if(!data.length) return {cols:[],rows:[]};

  // A primeira linha da aba Vendas contém os cabeçalhos (DATA, NOME,
  // NOTA FISCAL/FATURA, VALOR DA NOTA, REPRESENTANTE, PROD/SERV/FATURA
  // etc.) — o HTML do Comercial usa table.cols[].label pra achar cada
  // coluna, igual o Financeiro já faz.
  const headers=Array.isArray(data[0])?data[0]:[];
  const width=headers.length;

  const cols=Array.from({length:width},(_,i)=>({
    id:`C${i}`,
    label:String(headers[i]??'').trim(),
    type:'string'
  }));

  // A primeira linha é cabeçalho; não entra como registro de venda.
  const rows=data.slice(1).map(r=>({
    c:Array.from({length:width},(_,i)=>{
      const v=Array.isArray(r)?r[i]:null;
      return v===undefined||v===null||v===''?null:{v};
    })
  }));

  return {cols,rows};
}

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Método não permitido'});
  try{
    const auth=req.headers.authorization||'';
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token) return json(res,401,{error:'Não autenticado'});

    const user=await validateUser(token);
    const email=String(user?.email||'').trim().toLowerCase();
    // Comercial é aberto a qualquer usuário autenticado do Hub — só
    // precisa de sessão válida, sem whitelist de e-mail.
    if(!email) return json(res,403,{error:'Sem acesso ao Hub Alkanse'});

    const sheetId=env('ALKANSE_SHEET_ID');
    const accessToken=await googleAccessToken();
    const range=encodeURIComponent("'Vendas'");
    const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
    const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
    if(!r.ok){
      const detail=await r.text().catch(()=>'');
      console.error('Google Sheets API',r.status,detail.slice(0,1000));
      throw new Error(`Fonte comercial HTTP ${r.status}`);
    }
    const payload=await r.json();
    const table=valuesToTable(payload.values||[]);
    return json(res,200,table);
  }catch(err){
    console.error(err);
    return json(res,500,{error:'Falha ao carregar a fonte comercial'});
  }
}
