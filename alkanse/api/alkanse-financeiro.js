// Vercel Serverless Function: /api/alkanse-financeiro
// Leitura privada via Vercel OIDC + Google Workload Identity Federation.
// Requer: @vercel/oidc e google-auth-library

import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';

const ALLOWED = new Set([
  'daniel.morante@grupofb.com.br',
  'karina@grupofb.com.br',
  'juliana@grupofb.com.br',
  'andressa@grupofb.com.br',
  'pedro.kim@grupofb.com.br'
]);

// Cache apenas na memória da função serverless. Não vai para o navegador/CDN.
// Reduz drasticamente chamadas repetidas ao Google Sheets em instâncias quentes.
const TABLE_TTL_MS = Number(process.env.ALKANSE_FINANCEIRO_CACHE_MS || 60000);
let tableCache = { expiresAt:0, table:null };
let tokenCache = { expiresAt:0, token:null };

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
  const agora=Date.now();
  if(tokenCache.token && tokenCache.expiresAt>agora) return tokenCache.token;
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
  // Tokens Google costumam durar ~1h. Mantemos só 45 min por segurança.
  tokenCache={token,expiresAt:Date.now()+45*60*1000};
  return token;
}

function valuesToTable(values){
  const data=Array.isArray(values)?values:[];
  if(!data.length) return {cols:[],rows:[]};

  // A primeira linha da aba Financeiro contém os cabeçalhos.
  // O HTML do fluxo usa table.cols[].label para descobrir "Data Caixa",
  // "Data Vencimento", "Conta", "Débito", "Crédito", "Situação" etc.
  const headers=Array.isArray(data[0])?data[0]:[];
  const width=headers.length;

  const cols=Array.from({length:width},(_,i)=>({
    id:`C${i}`,
    label:String(headers[i]??'').trim(),
    type:'string'
  }));

  // A primeira linha é cabeçalho; não pode entrar como lançamento.
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
    const gps=email.endsWith('@gpsbi.com.br');
    if(!email||(!gps&&!ALLOWED.has(email))) return json(res,403,{error:'Sem acesso ao fluxo Alkanse'});

    const agora=Date.now();
    if(tableCache.table && tableCache.expiresAt>agora){
      res.setHeader('X-Alkanse-Cache','HIT');
      return json(res,200,tableCache.table);
    }

    const sheetId=env('ALKANSE_SHEET_ID');
    const accessToken=await googleAccessToken();
    const range=encodeURIComponent("'Financeiro'");
    const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
    const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
    if(!r.ok){
      const detail=await r.text().catch(()=>'');
      console.error('Google Sheets API',r.status,detail.slice(0,1000));
      throw new Error(`Fonte financeira HTTP ${r.status}`);
    }
    const payload=await r.json();
    const table=valuesToTable(payload.values||[]);
    tableCache={table,expiresAt:Date.now()+TABLE_TTL_MS};
    res.setHeader('X-Alkanse-Cache','MISS');
    return json(res,200,table);
  }catch(err){
    console.error(err);
    return json(res,500,{error:'Falha ao carregar a fonte financeira'});
  }
}
