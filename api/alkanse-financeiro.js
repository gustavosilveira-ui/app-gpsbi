// Vercel Serverless Function: /api/alkanse-financeiro
// Configure no Vercel:
// ALKANSE_SHEET_ID=...
// SUPABASE_URL=https://....supabase.co
// SUPABASE_ANON_KEY=...
//
// A planilha pode permanecer pública TEMPORARIAMENTE para o backend conseguir
// ler via GViz. Depois, migre para credencial de serviço/Drive API e torne-a privada.

const ALLOWED = new Set([
  'daniel.morante@grupofb.com.br',
  'karina@grupofb.com.br',
  'juliana@grupofb.com.br',
  'andressa@grupofb.com.br',
  'pedro.kim@grupofb.com.br'
]);

function json(res, status, body){
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

async function validateUser(token){
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if(!url || !anon) throw new Error('Backend sem configuração Supabase');

  const r = await fetch(`${url}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': anon
    }
  });
  if(!r.ok) return null;
  return await r.json();
}

export default async function handler(req,res){
  if(req.method !== 'GET') return json(res,405,{error:'Método não permitido'});

  try{
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if(!token) return json(res,401,{error:'Não autenticado'});

    const user = await validateUser(token);
    const email = String(user?.email || '').trim().toLowerCase();
    const gps = email.endsWith('@gpsbi.com.br');

    if(!email || (!gps && !ALLOWED.has(email))){
      return json(res,403,{error:'Sem acesso ao fluxo Alkanse'});
    }

    const sheetId = process.env.ALKANSE_SHEET_ID;
    if(!sheetId) throw new Error('ALKANSE_SHEET_ID não configurado');

    const gviz = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent('Financeiro')}`;
    const r = await fetch(gviz, { headers:{'User-Agent':'GPSBI-Alkanse/1.0'} });
    if(!r.ok) throw new Error(`Fonte financeira HTTP ${r.status}`);

    const txt = await r.text();
    const a = txt.indexOf('{');
    const b = txt.lastIndexOf('}');
    if(a < 0 || b < 0) throw new Error('Resposta inválida do Google Sheets');

    const obj = JSON.parse(txt.slice(a,b+1));
    const table = obj?.table;
    if(!table) throw new Error('Aba Financeiro não retornou tabela');

    // Retorna somente o payload necessário; o ID da planilha nunca chega ao browser.
    return json(res,200,{ cols: table.cols || [], rows: table.rows || [] });
  }catch(err){
    console.error(err);
    return json(res,500,{error:'Falha ao carregar a fonte financeira'});
  }
}
