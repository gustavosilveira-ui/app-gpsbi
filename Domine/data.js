(function(){
const C=window.DOMINE_CONFIG;
const SAMPLE=[
 {periodo:'26_02',empresa:'DC',data:'2026-05-01',motorista:'Rubenilson Costa',placa:'EYC0496',rota:'1º Entrega',pedido:'Roldão Cidade Dutra',agendamento:'08:00',saida:'06:30',chegadaLoja:'09:20',status:'4',frete:650,meta:20},
 {periodo:'26_02',empresa:'DC',data:'2026-05-01',motorista:'Rubenilson Costa',placa:'EYC0496',rota:'2º Entrega',pedido:'Senda Cidade Dutra',agendamento:'10:00',saida:'06:30',chegadaLoja:'11:10',status:'4',frete:650,meta:20},
 {periodo:'26_02',empresa:'DC',data:'2026-05-01',motorista:'Adilson Souza',placa:'DCZ4G89',rota:'1º Entrega',pedido:'Sendas Cotia',agendamento:'13:00',saida:'11:20',chegadaLoja:'14:05',status:'4',frete:650,meta:20},
 {periodo:'26_02',empresa:'DC',data:'2026-05-02',motorista:'Eduardo Erik',placa:'ONO8H82',rota:'1º Entrega',pedido:'Senda Jabaquara',agendamento:'08:30',saida:'06:15',chegadaLoja:'09:10',status:'3',frete:425,meta:20},
 {periodo:'26_02',empresa:'DC',data:'2026-05-02',motorista:'Eduardo Erik',placa:'ONO8H82',rota:'2º Entrega',pedido:'Senda Santa Catarina',agendamento:'11:00',saida:'06:15',chegadaLoja:'11:35',status:'3',frete:425,meta:20},
 {periodo:'26_02',empresa:'BENASSI',data:'2026-05-03',motorista:'Wellington',placa:'ABC1D23',rota:'1º Entrega',pedido:'Ayumi 7',agendamento:'03:00',saida:'05:40',chegadaLoja:'06:40',status:'4',frete:780,meta:15}
];
function norm(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
function excelDate(v){const n=Number(v); if(!Number.isFinite(n)) return String(v||''); const d=new Date(Date.UTC(1899,11,30)+n*86400000);return d.toISOString().slice(0,10)}
function timeValue(v){if(v===null||v===undefined||v===''||v==='-')return ''; const s=String(v).trim().replace(';',':'); if(/^\d{1,2}:\d{2}/.test(s))return s.slice(0,5).padStart(5,'0'); const n=Number(v);if(Number.isFinite(n)){const mins=Math.round((n%1)*1440)%1440;return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0')} const d=new Date(v);return isNaN(d)?s:d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
function tripKey(r){
 // Uma viagem é contada uma única vez. A chave prioriza identificador explícito; no fallback usa data+empresa+motorista+placa+hora de saída.
 return r.viagem_id || [r.data,r.empresa,norm(r.motorista),norm(r.placa),r.saida||r.carregamento||'sem-hora'].join('|');
}
function parseGviz(text){const json=JSON.parse(text.match(/setResponse\((.*)\);?$/s)[1]);const cols=json.table.cols.map(c=>c.label||c.id);return json.table.rows.map(row=>{const o={};row.c.forEach((c,i)=>o[cols[i]]=c?.v??'');return o})}
async function loadSheet(name){const id=C.data.spreadsheetId;const url=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}`;const res=await fetch(url);if(!res.ok)throw new Error('Fonte indisponível');return parseGviz(await res.text())}
function mapRows(rows){return rows.map((x,i)=>({
 periodo:x['Período']||'',empresa:x['Empresa']||'',data:excelDate(x['DATA Entrega']),operacao:x['Operação']||'',colaborador:x['Colaborador Domine']||'',pedido:x['Nº PEDIDO\nLOJA']||x['Nº PEDIDO LOJA']||'',motorista:x['MOTORISTA']||'',placa:x['Placa']||'',rota:x['Rota']||'',agendamento:timeValue(x['Hora \nAgendamento']||x['Hora Agendamento']),carregamento:timeValue(x['Carregamento']),saida:timeValue(x['Saida']||x['Saida ']),chegadaCD:timeValue(x['Chegada CD']),chegadaLoja:timeValue(x['CHEGADA\n na loja']),saidaLoja:timeValue(x['SAÍDA/\nLOJA']),status:String(x['STATUS']||''),frete:Number(x['Frete TAK']||x['Frete']||0),viagem_id:x['Viagem ID']||x['ID Viagem']||''
})).filter(r=>r.empresa||r.motorista||r.pedido)}
async function load(){if(C.data.useLiveGoogleSheet){try{return mapRows(await loadSheet(C.data.sheets.base))}catch(e){console.warn('Usando dados demonstrativos:',e.message)}}return SAMPLE}
function metrics(rows,monthlyMeta){const trips=new Map();rows.forEach(r=>{const k=tripKey(r);if(!trips.has(k))trips.set(k,r)});const unique=[...trips.values()];const finalized=unique.filter(r=>r.status==='4'||norm(C.statusLabels[r.status]).includes('final')).length;const freight=unique.reduce((s,r)=>s+(Number(r.frete)||0),0);const withFreight=unique.filter(r=>Number(r.frete)>0).length;return{routes:unique.length,finalized,freight,withFreight,ticket:withFreight?freight/withFreight:0,monthlyMeta:monthlyMeta||0,uniqueTrips:unique}}
window.DomineData={load,metrics,tripKey,timeValue,norm};
})();
