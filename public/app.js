import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './app-config.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const statuses = ['Não iniciada', 'Em andamento', 'Atenção', 'Concluída'];
const pillarMeta = {
  'Evolução': ['PDI, conhecimento e relacionamento', '◉'],
  'Desenvolvimento': ['Tecnologia, inovação e processos', '◇'],
  'Finanças': ['Orçamento e redução de despesas', 'R$']
};
let supabase;
let session = null;
let actions = [];
let finances = [];
let activeView = 'overview';

const money = value => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }).format(Number(value || 0));
const dateBR = value => value ? new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value.length===10?`${value}T12:00:00`:value)).replace('.', '') : 'Sem data';
const safe = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const show = id => $(`#${id}`).classList.remove('hidden');
const hide = id => $(`#${id}`).classList.add('hidden');
const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/></svg>';

document.body.append($('#toast'), $('#error-banner'));
function flash(message){ const el=$('#toast'); el.textContent=`✓ ${message}`; el.classList.remove('hidden'); clearTimeout(flash.timer); flash.timer=setTimeout(()=>el.classList.add('hidden'),3000); }
function error(message){ const el=$('#error-banner'); el.textContent=message; el.classList.remove('hidden'); clearTimeout(error.timer); error.timer=setTimeout(()=>el.classList.add('hidden'),5000); }
function setBusy(form, busy){ $$('button,input,select,textarea',form).forEach(el=>el.disabled=busy); }

async function init(){
  hide('loading-view');
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){ show('setup-view'); return; }
  supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const { data }=await supabase.auth.getSession();
  session=data.session;
  supabase.auth.onAuthStateChange(async(event,newSession)=>{
    session=newSession;
    if(event==='PASSWORD_RECOVERY'){ hide('login-form'); show('new-password-form'); show('auth-view'); hide('app-view'); return; }
    await renderAuthState();
  });
  bindEvents();
  await renderAuthState();
}

async function renderAuthState(){
  hide('loading-view'); hide('setup-view');
  if(!session){ hide('app-view'); show('auth-view'); show('login-form'); hide('new-password-form'); return; }
  hide('auth-view'); show('app-view'); $('#user-email').textContent=session.user.email || 'Usuário';
  await loadData();
}

async function loadData(){
  const [a,f]=await Promise.all([
    supabase.from('actions').select('*').order('due',{ascending:true}),
    supabase.from('finance_entries').select('*').order('created_at',{ascending:false})
  ]);
  if(a.error || f.error){ error('Não foi possível carregar os dados. Confira a configuração do Supabase.'); return; }
  actions=a.data || []; finances=f.data || []; renderAll();
}

function bindEvents(){
  $('#login-form').addEventListener('submit',login);
  $('#forgot-password').addEventListener('click',forgotPassword);
  $('#new-password-form').addEventListener('submit',setNewPassword);
  $$('.password-toggle').forEach(button=>button.addEventListener('click',()=>togglePassword(button)));
  $$('.password-toggle').forEach(button=>button.addEventListener('click',()=>togglePassword(button)));
  $('#logout-button').addEventListener('click',()=>supabase.auth.signOut());
  $$('.nav-item').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.view)));
  $$('[data-go]').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.go)));
  $$('.open-action').forEach(button=>button.addEventListener('click',()=>$('#action-dialog').showModal()));
  $('#open-finance').addEventListener('click',()=>$('#finance-dialog').showModal());
  $$('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  $('#action-form').addEventListener('submit',createAction);
  $('#finance-form').addEventListener('submit',createFinance);
  $('#action-search').addEventListener('input',renderActions);
  $('#pillar-filter').addEventListener('change',renderActions);
  $('#menu-button').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-action]'); if(!target)return;
    if(target.dataset.action==='advance') advanceAction(target.dataset.id);
    if(target.dataset.action==='delete-action') deleteAction(target.dataset.id);
    if(target.dataset.action==='delete-finance') deleteFinance(target.dataset.id);
  });
}

function togglePassword(button){
  const input=$(`#${button.dataset.passwordTarget}`); const showing=input.type==='text';
  input.type=showing?'password':'text';
  button.classList.toggle('showing',!showing);
  button.setAttribute('aria-label',showing?'Mostrar senha':'Ocultar senha');
  button.title=showing?'Mostrar senha':'Ocultar senha';
}

function togglePassword(button){
  const input=$(`#${button.dataset.passwordTarget}`); const showing=input.type==='text';
  input.type=showing?'password':'text';
  button.classList.toggle('showing',!showing);
  button.setAttribute('aria-label',showing?'Mostrar senha':'Ocultar senha');
  button.title=showing?'Mostrar senha':'Ocultar senha';
}

async function login(event){
  event.preventDefault(); setBusy(event.currentTarget,true);
  const {error:authError}=await supabase.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});
  setBusy(event.currentTarget,false); if(authError) error('E-mail ou senha inválidos.');
}
async function forgotPassword(){
  const email=$('#login-email').value.trim(); if(!email){ error('Digite seu e-mail para redefinir a senha.'); return; }
  const {error:resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
  resetError?error('Não foi possível enviar o e-mail de recuperação.'):flash('Confira seu e-mail para criar uma nova senha.');
}
async function setNewPassword(event){
  event.preventDefault(); const password=$('#new-password').value; setBusy(event.currentTarget,true);
  const {error:updateError}=await supabase.auth.updateUser({password}); setBusy(event.currentTarget,false);
  if(updateError){error('Não foi possível alterar a senha.');return;} flash('Senha atualizada.'); hide('new-password-form'); await renderAuthState();
}

function switchView(view){
  activeView=view; $$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  const titles={overview:'Visão geral',schedule:'Cronograma',actions:'Ações',results:'Resultados'}; $('#page-title').textContent=titles[view]; $('#sidebar').classList.remove('open');
}

async function createAction(event){
  event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); setBusy(form,true);
  const payload={title:data.get('title').trim(),pillar:data.get('pillar'),owner:data.get('owner').trim(),due:new Date(data.get('due')).toISOString(),impact:Number(data.get('impact')||0),observation:data.get('observation').trim(),status:'Não iniciada',progress:0,created_by:session.user.id};
  const {data:created,error:dbError}=await supabase.from('actions').insert(payload).select().single(); setBusy(form,false);
  if(dbError){error('Não foi possível criar a ação.');return;} actions.push(created); actions.sort((a,b)=>new Date(a.due)-new Date(b.due)); form.reset(); form.pillar.value='Todos'; form.impact.value='0'; $('#action-dialog').close(); renderAll(); flash('Ação criada com sucesso.');
}
async function advanceAction(id){
  const item=actions.find(x=>x.id===id); if(!item)return; const status=statuses[(statuses.indexOf(item.status)+1)%statuses.length]; const progress={"Não iniciada":0,"Em andamento":50,"Atenção":25,"Concluída":100}[status];
  const {error:dbError}=await supabase.from('actions').update({status,progress}).eq('id',id); if(dbError){error('Não foi possível atualizar a ação.');return;} Object.assign(item,{status,progress}); renderAll(); flash('Status atualizado.');
}
async function deleteAction(id){
  const item=actions.find(x=>x.id===id); if(!item || !confirm(`Excluir a ação “${item.title}”?`))return;
  const {error:dbError}=await supabase.from('actions').delete().eq('id',id); if(dbError){error('Não foi possível excluir a ação.');return;} actions=actions.filter(x=>x.id!==id); renderAll(); flash('Ação excluída.');
}
async function createFinance(event){
  event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); setBusy(form,true);
  const payload={period:data.get('period'),cost_center:data.get('cost_center').trim(),budget:Number(data.get('budget')),actual:Number(data.get('actual')),headcount:Number(data.get('headcount')||0),observation:data.get('observation').trim(),created_by:session.user.id};
  const {data:created,error:dbError}=await supabase.from('finance_entries').insert(payload).select().single(); setBusy(form,false);
  if(dbError){error('Não foi possível salvar o lançamento.');return;} finances.unshift(created); form.reset(); form.headcount.value='0'; $('#finance-dialog').close(); renderAll(); flash('Resultado financeiro registrado.');
}
async function deleteFinance(id){
  const item=finances.find(x=>x.id===id); if(!item || !confirm(`Excluir o lançamento de ${item.cost_center}?`))return;
  const {error:dbError}=await supabase.from('finance_entries').delete().eq('id',id); if(dbError){error('Não foi possível excluir o lançamento.');return;} finances=finances.filter(x=>x.id!==id); renderAll(); flash('Lançamento excluído.');
}

function renderAll(){ renderOverview(); renderSchedule(); renderActions(); renderFinances(); }
function renderOverview(){
  const complete=actions.filter(x=>x.status==='Concluída').length; const overall=actions.length?Math.round(actions.reduce((s,x)=>s+Number(x.progress),0)/actions.length):0; const savings=actions.reduce((s,x)=>s+Number(x.impact),0); const people=new Set(actions.map(x=>x.owner.trim().toLowerCase()).filter(Boolean)).size;
  $('#kpi-complete').textContent=complete; $('#kpi-total').textContent=`de ${actions.length} cadastradas`; $('#kpi-progress').textContent=`${overall}%`; $('#kpi-savings').textContent=money(savings); $('#kpi-people').textContent=people; $('#sidebar-progress').style.width=`${overall}%`; $('#sidebar-progress-label').textContent=`${overall}% concluído`;
  $('#pillar-progress').innerHTML=Object.entries(pillarMeta).map(([name,[detail,icon]])=>{const list=actions.filter(x=>x.pillar===name||x.pillar==='Todos');const value=list.length?Math.round(list.reduce((s,x)=>s+Number(x.progress),0)/list.length):0;return `<div class="pillar-row"><span class="pillar-icon">${icon}</span><div><h4>${name}</h4><p>${detail}</p><div class="bar"><i style="width:${value}%"></i></div></div><b>${value}%</b></div>`}).join('');
  $('#schedule-summary').textContent=actions.length?'Cronograma em andamento':'Nenhum prazo cadastrado'; $('#schedule-summary-copy').textContent=actions.length?'Consulte as próximas entregas do programa.':'As datas aparecerão após a criação das ações.';
}
function empty(title,text){return `<div class="empty-state"><h3>${title}</h3><p>${text}</p></div>`}
function renderSchedule(){
  $('#schedule-count').textContent=`${actions.length} ${actions.length===1?'item':'itens'} no cronograma`;
  $('#schedule-list').innerHTML=actions.length?actions.map(a=>`<article class="record schedule"><strong class="green">${dateBR(a.due)}</strong><div><h4>${safe(a.title)}</h4><p>${safe(a.pillar)} • ${safe(a.owner)}</p>${a.observation?`<p class="observation">${safe(a.observation)}</p>`:''}</div><span class="status" data-status="${safe(a.status)}">${safe(a.status)}</span></article>`).join(''):empty('Cronograma vazio','Cadastre a primeira ação para adicionar um prazo.');
}
function renderActions(){
  const query=$('#action-search').value.toLowerCase(); const filter=$('#pillar-filter').value; const filtered=actions.filter(a=>(filter==='Qualquer'||a.pillar===filter)&&`${a.title} ${a.owner} ${a.observation}`.toLowerCase().includes(query));
  $('#actions-list').innerHTML=filtered.length?filtered.map(a=>`<article class="record"><div><h4>${safe(a.title)}</h4><p>${safe(a.pillar)} • ${safe(a.owner)} • ${dateBR(a.due)}</p>${a.observation?`<p class="observation">${safe(a.observation)}</p>`:''}</div><div class="record-progress"><span>Progresso: ${a.progress}%</span><div class="bar"><i style="width:${a.progress}%"></i></div></div><button class="status" data-action="advance" data-id="${a.id}" data-status="${safe(a.status)}" title="Clique para mudar o status">${safe(a.status)}</button><button class="delete" data-action="delete-action" data-id="${a.id}" title="Excluir ação" aria-label="Excluir ação">${trashIcon}</button></article>`).join(''):empty('Nenhuma ação encontrada','Crie uma ação ou ajuste os filtros.');
}
function renderFinances(){
  const budget=finances.reduce((s,x)=>s+Number(x.budget),0),actual=finances.reduce((s,x)=>s+Number(x.actual),0),balance=budget-actual,headcount=finances.reduce((s,x)=>s+Number(x.headcount),0);
  $('#finance-budget').textContent=money(budget);$('#finance-actual').textContent=money(actual);$('#finance-balance').textContent=money(balance);$('#finance-balance-note').textContent=balance>=0?'abaixo do orçamento':'acima do orçamento';$('#finance-headcount').textContent=headcount;$('#finance-count').textContent=`${finances.length} ${finances.length===1?'registro financeiro':'registros financeiros'}`;
  $('#finance-table').innerHTML=finances.map(f=>`<tr><td>${safe(f.period)}</td><td><strong>${safe(f.cost_center)}</strong></td><td>${money(f.budget)}</td><td>${money(f.actual)}</td><td>${f.headcount}</td><td>${safe(f.observation)||'—'}</td><td><button class="delete" data-action="delete-finance" data-id="${f.id}" title="Excluir lançamento" aria-label="Excluir lançamento">${trashIcon}</button></td></tr>`).join('');
  $('#finance-empty').innerHTML=finances.length?'':empty('Nenhum resultado registrado','Adicione o primeiro lançamento financeiro.');
}

init().catch(()=>{hide('loading-view');show('setup-view');});
