// Vercel Serverless Function: /api/alkanse-comercial
// Fonte comercial Alkanse: usa a aba Vendas e descobre o nome real da aba.
// Se o comercial estiver em outra planilha, configure ALKANSE_COMERCIAL_SHEET_ID.

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

function norm(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
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
  const headers=Array.isArray(data[0])?data[0]:[];
  const width=headers.length;
  const cols=Array.from({length:width},(_,i)=>({id:`C${i}`,label:String(headers[i]??'').trim(),type:'string'}));
  const rows=data.slice(1).map(r=>({c:Array.from({length:width},(_,i)=>{
    const v=Array.isArray(r)?r[i]:null;
    return v===undefined||v===null||v===''?null:{v};
  })}));
  return {cols,rows};
}

async function googleJson(url, accessToken){
  const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
  const text=await r.text();
  let payload=null;
  try{ payload=JSON.parse(text); }catch(_){ }
  if(!r.ok){
    const detail=payload?.error?.message || text || `HTTP ${r.status}`;
    const err=new Error(detail);
    err.status=r.status;
    throw err;
  }
  return payload||{};
}

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Método não permitido'});
  try{
    const auth=req.headers.authorization||'';
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token) return json(res,401,{error:'Não autenticado'});
    const user=await validateUser(token);
    const email=String(user?.email||'').trim().toLowerCase();
    if(!email) return json(res,403,{error:'Sem acesso ao Hub Alkanse'});

    // Permite uma planilha própria do Comercial. Se não existir, mantém compatibilidade
    // com a planilha já usada pelo Financeiro.
    const sheetId=process.env.ALKANSE_COMERCIAL_SHEET_ID || env('ALKANSE_SHEET_ID');
    const accessToken=await googleAccessToken();

    // 1) Descobre os nomes reais das abas, evitando erro por espaço/caixa/grafia.
    const metaUrl=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=properties.title,sheets.properties.title`;
    const meta=await googleJson(metaUrl,accessToken);
    const tabs=(meta.sheets||[]).map(s=>String(s?.properties?.title||'')).filter(Boolean);

    // Vendas é a fonte oficial. Aceitamos apenas variações simples de caixa/espaço.
    const aliases=['Vendas'];
    let tab=tabs.find(t=>aliases.some(a=>norm(t)===norm(a)));

    if(!tab){
      return json(res,422,{
        error:'A aba Vendas não foi encontrada na planilha configurada',
        spreadsheet:meta?.properties?.title||'',
        availableTabs:tabs,
        hint:'Confirme se a aba Vendas existe na planilha configurada para a Alkanse.'
      });
    }

    // 2) Lê a aba encontrada.
    const range=encodeURIComponent(`'${tab}'`);
    const valuesUrl=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
    const payload=await googleJson(valuesUrl,accessToken);
    const table=valuesToTable(payload.values||[]);

    return json(res,200,{
      ...table,
      source:tab,
      spreadsheet:meta?.properties?.title||'',
      rowCount:table.rows.length
    });
  }catch(err){
    console.error('alkanse-comercial:',err);
    return json(res,500,{
      error:'Falha ao carregar a fonte comercial',
      detail:String(err?.message||err),
      hint:'Confira as variáveis da Vercel e o compartilhamento da planilha com a service account.'
    });
  }
}
