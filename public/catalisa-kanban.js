import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './app-config.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const show=id=>$(`#${id}`).classList.remove('hidden');
const hide=id=>$(`#${id}`).classList.add('hidden');
const roleLabels={admin:'Administrador',manager:'Gestor',collaborator:'Colaborador'};
const statusLabels={todo:'Planejada',progress:'Em andamento',attention:'Atenção',done:'Concluída'};
const statusDatabase={todo:'Não iniciada',progress:'Em andamento',attention:'Atenção',done:'Concluída'};
const statusKeys={'Não iniciada':'todo','Em andamento':'progress','Atenção':'attention','Concluída':'done'};
const kanbanColumns=[{key:'todo',title:'Planejadas'},{key:'progress',title:'Em andamento'},{key:'attention',title:'Atenção'},{key:'done',title:'Concluídas'}];
const siteOwnerEmail='luciano@botuvera.com';
const pillarTemplates={
  evolucao:{number:'PILAR 01',title:'Evolução',description:'Desenvolvimento das pessoas, compartilhamento de conhecimento e fortalecimento das relações.',projects:[['PDI','P','Planos individuais acompanhados em paralelo.'],['Multiplicador','M','Conhecimento compartilhado por especialistas internos.'],['Relacionamento','R','Ações para fortalecer confiança e comunicação.']]},
  desenvolvimento:{number:'PILAR 02',title:'Desenvolvimento',description:'Tecnologia, inovação e processos aplicados à melhoria contínua.',projects:[['Tecnologia','T','Ferramentas digitais para apoiar as equipes.'],['Inovação','I','Ideias testadas com impacto mensurável.'],['Processos','P','Fluxos mais simples, claros e eficientes.']]},
  financas:{number:'PILAR 03',title:'Finanças',description:'Orçamento, eficiência dos recursos e redução de despesas.',projects:[['Orçamento','O','Planejamento e acompanhamento dos recursos.'],['Redução de despesas','R$','Economia sem comprometer a operação.'],['Eficiência','E','Indicadores para consolidar os resultados.']]}
};

let supabase;
let session=null;
let profile=null;
let profiles=[];
let pillars={};
let activePillar='evolucao';
let activeView='pillar';
let calendarDate=new Date();
let customProjects=[];
const demoMode=(!SUPABASE_URL||!SUPABASE_ANON_KEY)&&['localhost','127.0.0.1'].includes(location.hostname);
let inviteFlow=location.hash.includes('type=invite')||new URLSearchParams(location.search).get('type')==='invite';

const demoProfiles=[
  {id:'user-luciano',email:siteOwnerEmail,full_name:'luciano carmanhães',role:'admin',manager_id:null,active:true},
  {id:'user-gabriela',email:'gabriela@botuvera.com',full_name:'gabriela silva',role:'manager',manager_id:null,active:true},
  {id:'user-vicente',email:'vicente@botuvera.com',full_name:'vicente oliveira',role:'collaborator',manager_id:'user-gabriela',active:true},
  {id:'user-deise',email:'deisebissoni@botuvera.com',full_name:'deise bissoni',role:'collaborator',manager_id:'user-gabriela',active:true}
];
let demoActions=[
  {id:'demo-1',title:'PDI — Luciano',pillar:'Evolução',project:'PDI',owner:'Luciano Carmanhães',due:new Date(2026,8,28,9).toISOString(),observation:'Acompanhamento do plano de desenvolvimento.',collaborator_id:'user-luciano',manager_id:'user-gabriela',created_by:'user-gabriela',status:'Em andamento',progress:50,steps:[{id:'step-1',title:'Reunião de alinhamento',due:new Date(2026,8,18,9).toISOString(),done:true},{id:'step-2',title:'Definir plano de ação',due:new Date(2026,8,28,9).toISOString(),done:false}],updates:[{id:'update-1',note:'Objetivos iniciais definidos.',created_by:'user-gabriela',created_at:new Date(2026,8,10,14).toISOString()}]},
  {id:'demo-2',title:'Automação do fluxo de compras',pillar:'Desenvolvimento',project:'Tecnologia',owner:'Vicente Oliveira',due:new Date(2026,9,8,10).toISOString(),observation:'Validar integração com o processo atual.',collaborator_id:'user-vicente',manager_id:'user-gabriela',created_by:'user-gabriela',status:'Atenção',progress:25,steps:[{id:'step-3',title:'Mapear requisitos',due:new Date(2026,8,22,10).toISOString(),done:false}],updates:[]},
  {id:'demo-3',title:'Revisão mensal do orçamento',pillar:'Finanças',project:'Orçamento',owner:'Deise Bissoni',due:new Date(2026,8,30,15).toISOString(),observation:'Consolidar os desvios do mês.',collaborator_id:'user-deise',manager_id:'user-gabriela',created_by:'user-gabriela',status:'Não iniciada',progress:0,steps:[],updates:[]},
  {id:'demo-4',title:'Reunião geral do programa',pillar:'Todos',project:'Geral',owner:'Luciano Carmanhães',due:new Date(2026,9,15,8,30).toISOString(),observation:'Alinhamento entre os três pilares.',collaborator_id:'user-luciano',manager_id:'user-luciano',created_by:'user-luciano',status:'Concluída',progress:100,steps:[],updates:[]}
];

function resetPillars(){
  pillars=Object.fromEntries(Object.entries(pillarTemplates).map(([key,pillar])=>[key,{...pillar,projects:pillar.projects.map(([name,icon,description])=>({name,icon,description,actions:[]}))}]));
  customProjects.forEach(project=>{
    const key=Object.keys(pillars).find(item=>pillars[item].title===project.pillar);
    if(key&&!pillars[key].projects.some(item=>item.name.toLocaleLowerCase('pt-BR')===project.name.toLocaleLowerCase('pt-BR'))){
      pillars[key].projects.push({...project,icon:project.icon||project.name.slice(0,2).toUpperCase(),actions:[]});
    }
  });
}
function flash(message){const toast=$('#toast');toast.textContent=`✓ ${message}`;toast.classList.add('show');clearTimeout(flash.timer);flash.timer=setTimeout(()=>toast.classList.remove('show'),3200)}
function error(message){const banner=$('#error-banner');banner.textContent=message;banner.classList.remove('hidden');clearTimeout(error.timer);error.timer=setTimeout(()=>banner.classList.add('hidden'),6000)}
function setBusy(form,busy){$$('button,input,select,textarea',form).forEach(element=>element.disabled=busy)}
function dateBR(value){if(!value)return 'Sem data';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)).replace('.','')}
function datetimeInput(value){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function dateEdit(value){if(!value)return 'A definir';const date=new Date(value);const pad=number=>String(number).padStart(2,'0');return `${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`}
function currentName(){return profile?.full_name||session?.user?.email||'Usuário'}
function canManage(){return ['admin','manager'].includes(profile?.role)}
function isSiteOwner(){return profile?.email?.toLowerCase()===siteOwnerEmail}
function titleCase(value){return String(value||'').toLocaleLowerCase('pt-BR').replace(/(^|[\s'-])([\p{L}])/gu,(all,prefix,letter)=>prefix+letter.toLocaleUpperCase('pt-BR'))}
function userCanEdit(item){return profile?.role==='admin'||(profile?.role==='manager'&&(item.created_by===session?.user?.id||item.manager_id===session?.user?.id))||item.collaborator_id===session?.user?.id}
function userCanDelete(item){return profile?.role==='admin'||(profile?.role==='manager'&&(item.created_by===session?.user?.id||item.manager_id===session?.user?.id))}

async function init(){
  hide('loading-view');
  bindStaticEvents();
  if(demoMode){
    const demoUserId=new URLSearchParams(location.search).get('demoUser')||'user-luciano';
    profile=demoProfiles.find(user=>user.id===demoUserId)||demoProfiles[0];
    session={user:{id:profile.id,email:profile.email}};profiles=demoProfiles;
    hide('auth-view');show('app-view');await loadData();showOverview();
    return;
  }
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY){show('setup-view');return}
  supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const {data}=await supabase.auth.getSession();session=data.session;
  supabase.auth.onAuthStateChange(async(event,newSession)=>{
    session=newSession;
    if(event==='PASSWORD_RECOVERY'||(inviteFlow&&newSession)){showPasswordForm();return}
    await renderAuthState();
  });
  if(inviteFlow&&session){showPasswordForm();return}
  await renderAuthState();
}
function showPasswordForm(){hide('login-form');show('new-password-form');show('auth-view');hide('app-view');hide('loading-view')}
async function renderAuthState(){
  hide('loading-view');hide('setup-view');
  if(!session){hide('app-view');show('auth-view');show('login-form');hide('new-password-form');return}
  const {data,error:profileError}=await supabase.from('profiles').select('*').eq('id',session.user.id).single();
  if(profileError||!data){hide('app-view');show('auth-view');error('Seu perfil ainda não foi configurado. Peça ao administrador para executar a atualização do banco.');return}
  if(!data.active){await supabase.auth.signOut();error('Seu acesso está suspenso. Fale com o administrador.');return}
  profile=data;hide('auth-view');show('app-view');await loadData();
}
async function loadData(){
  if(demoMode){
    profiles=demoProfiles;customProjects=customProjects||[];resetPillars();
    const visibleDemoActions=profile.role==='admin'?demoActions:profile.role==='manager'?demoActions.filter(action=>action.created_by===session.user.id||action.manager_id===session.user.id):demoActions.filter(action=>action.collaborator_id===session.user.id);
    ingestRows(visibleDemoActions,visibleDemoActions.flatMap(action=>action.steps.map((step,index)=>({...step,action_id:action.id,sort_order:index}))),visibleDemoActions.flatMap(action=>action.updates.map(update=>({...update,action_id:action.id}))));
    updateProfileHeader();renderCurrentView();return;
  }
  const [profilesResult,actionsResult,stepsResult,updatesResult,projectsResult]=await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('actions').select('*').order('due'),
    supabase.from('action_steps').select('*').order('sort_order'),
    supabase.from('action_updates').select('*').order('created_at'),
    supabase.from('projects').select('*').eq('active',true).order('sort_order')
  ]);
  const firstError=[profilesResult,actionsResult,stepsResult,updatesResult,projectsResult].find(result=>result.error)?.error;
  if(firstError){error(`Não foi possível carregar o painel: ${firstError.message}`);return}
  profiles=profilesResult.data||[];customProjects=projectsResult.data||[];resetPillars();
  ingestRows(actionsResult.data||[],stepsResult.data||[],updatesResult.data||[]);
  updateProfileHeader();renderCurrentView();
}
function ingestRows(rows,stepRows,updateRows){
  const stepsByAction=stepRows.reduce((groups,step)=>{(groups[step.action_id]??=[]).push(step);return groups},{});
  const updatesByAction=updateRows.reduce((groups,update)=>{(groups[update.action_id]??=[]).push(update);return groups},{});
  for(const row of rows){
    const manager=profiles.find(item=>item.id===row.manager_id);
    const collaborator=profiles.find(item=>item.id===row.collaborator_id);
    const action={...row,dueLabel:dateBR(row.due),manager:titleCase(manager?.full_name||row.owner),collaborator:titleCase(collaborator?.full_name||row.owner),steps:(stepsByAction[row.id]||[]).map(step=>({...step,dateLabel:dateBR(step.due)})),updates:(updatesByAction[row.id]||[]).map(update=>({...update,dateLabel:dateBR(update.created_at),text:update.note,author:titleCase(profiles.find(user=>user.id===update.created_by)?.full_name||'Usuário')})),status:statusKeys[row.status]||'todo',label:row.status==='Não iniciada'?'Planejada':row.status};
    const targetKeys=row.pillar==='Todos'?Object.keys(pillars):[Object.keys(pillars).find(key=>pillars[key].title===row.pillar)].filter(Boolean);
    for(const key of targetKeys){
      let project=row.pillar==='Todos'?pillars[key].projects.find(item=>item.name==='Todos os pilares'):pillars[key].projects.find(item=>item.name===row.project);
      if(!project){project={name:row.pillar==='Todos'?'Todos os pilares':row.project||'Geral',icon:'+',description:'Ações de abrangência geral.',actions:[]};pillars[key].projects.push(project)}
      project.actions.push(action);
    }
  }
}

function visibleProjects(pillar){return profile.role==='collaborator'?pillar.projects.filter(project=>project.actions.length):pillar.projects}
function allActionsUnique(){const map=new Map();Object.values(pillars).forEach(pillar=>pillar.projects.forEach(project=>project.actions.forEach(action=>map.set(action.id,action))));return [...map.values()]}
function stepMarkup(step,index,item){return `<label class="subaction"><input type="checkbox" data-step-action="${item.id}" data-step-index="${index}" ${step.done?'checked':''} ${userCanEdit(item)?'':'disabled'}><span><strong>${safe(step.title)}</strong><small>${safe(step.dateLabel)}</small></span></label>`}
function updateMarkup(update){return `<div class="update-entry"><span>${safe(update.dateLabel)} · ${safe(update.author||'Usuário')}</span><p>${safe(update.text)}</p></div>`}
function actionMarkup(item,columnIndex){const editable=userCanEdit(item);const deletable=userCanDelete(item);const completed=item.steps.filter(step=>step.done).length;return `<article class="kanban-card" data-action-id="${item.id}" ${editable?'draggable="true"':''}><div class="card-grip" aria-hidden="true">⋮⋮</div><span class="status ${item.status}">${safe(item.label)}</span><h5>${safe(item.title)}</h5><div class="card-person"><span>${safe(item.collaborator.split(' ').map(part=>part[0]).slice(0,2).join(''))}</span><div><small>Colaborador</small><strong>${safe(item.collaborator)}</strong></div></div><div class="card-facts"><span>Prazo <b>${safe(item.dueLabel)}</b></span><span>Etapas <b>${completed}/${item.steps.length}</b></span></div><details class="kanban-details"><summary>Ver acompanhamento</summary><div class="card-details">${item.observation?`<p class="card-observation">${safe(item.observation)}</p>`:''}<h6>Ações previstas e datas</h6><div class="subactions">${item.steps.map((step,index)=>stepMarkup(step,index,item)).join('')||'<p class="no-update">Nenhuma etapa registrada.</p>'}</div><div class="journal"><h6>Histórico do acompanhamento</h6><div class="update-list">${item.updates.map(updateMarkup).join('')||'<p class="no-update">Nenhuma atualização registrada.</p>'}</div>${editable?`<form class="update-form" data-action-id="${item.id}"><input aria-label="Nova atualização" placeholder="Escreva o que ocorreu…" required><button type="submit">Registrar</button></form>`:''}</div>${editable?`<div class="card-admin-actions"><button type="button" data-edit-action="${item.id}">Editar</button>${deletable?`<button type="button" data-delete-action="${item.id}">Excluir</button>`:''}</div>`:''}</div></details>${editable?`<div class="move-actions"><button type="button" data-move="prev" data-action-id="${item.id}" ${columnIndex===0?'disabled':''}>←</button><small>Mover</small><button type="button" data-move="next" data-action-id="${item.id}" ${columnIndex===kanbanColumns.length-1?'disabled':''}>→</button></div>`:''}</article>`}
function boardMarkup(project){return `<div class="kanban-board">${kanbanColumns.map((column,columnIndex)=>{const items=project.actions.filter(item=>item.status===column.key);return `<section class="kanban-column ${column.key}" data-drop-status="${column.key}"><header><span></span><strong>${column.title}</strong><b>${items.length}</b></header><div class="kanban-list">${items.map(item=>actionMarkup(item,columnIndex)).join('')||'<p class="column-empty">Solte uma ação aqui</p>'}</div></section>`}).join('')}</div>`}
function updateProfileHeader(){const name=titleCase(currentName());$('#user-initials').textContent=name.split(' ').map(part=>part[0]).slice(0,2).join('').toUpperCase();$('#user-name').textContent=name;$('#user-role').textContent=roleLabels[profile.role];const messages={admin:'Você está visualizando e administrando todos os pilares, projetos e ações.',manager:'Você visualiza as ações iniciadas por você com seus colaboradores.',collaborator:'Você acompanha somente as ações vinculadas ao seu perfil.'};$('#access-summary').innerHTML=`<span>${roleLabels[profile.role]}</span><p>${messages[profile.role]}</p>`;$('#access-nav').hidden=!isSiteOwner()}
function renderPillar(key){
  activeView='pillar';activePillar=key;const pillar=pillars[key];const projects=visibleProjects(pillar);const actionMap=new Map();projects.forEach(project=>project.actions.forEach(action=>actionMap.set(action.id,action)));const actions=[...actionMap.values()];const steps=actions.reduce((total,action)=>total+action.steps.length,0);const progress=actions.length?Math.round(actions.reduce((total,action)=>total+(action.status==='done'?100:action.status==='attention'?25:action.status==='progress'?55:0),0)/actions.length):0;
  showOnly('dashboard-view');$('#pillar-kicker').textContent=pillar.number;$('#pillar-title').textContent=pillar.title;$('#page-title').textContent=`Pilar ${pillar.title}`;$('#pillar-description').textContent=pillar.description;$('#metric-projects').textContent=projects.length;$('#metric-actions').textContent=actions.length;$('#metric-subactions').textContent=steps;$('#metric-progress').textContent=`${progress}%`;$('#metric-bar').style.width=`${progress}%`;$('#hero-new').hidden=!canManage()||!projects.length;$('#new-project').hidden=profile.role!=='admin';
  $('#projects').innerHTML=projects.length?projects.map((project,index)=>`<article class="project-card"><header class="project-head"><div class="project-title"><span class="project-icon">${project.icon}</span><div><h4>${safe(project.name)}</h4><p>${safe(project.description)}</p></div></div><div class="project-summary"><span>${project.actions.length} ${project.actions.length===1?'acompanhamento':'acompanhamentos'}</span><strong>${project.actions.reduce((total,action)=>total+action.steps.length,0)} atuações</strong>${profile.role==='admin'&&project.id&&project.created_by===session.user.id?`<button class="delete-project" type="button" data-project-id="${project.id}" aria-label="Excluir projeto ${safe(project.name)}" title="Excluir projeto e suas ações">Excluir projeto</button>`:''}${canManage()?`<button class="primary new-record" data-project-index="${index}">+ Registro</button>`:''}</div></header><div class="project-body">${boardMarkup(project)}</div></article>`).join(''):'<div class="profile-empty"><strong>Nenhuma ação disponível neste pilar</strong><p>Este perfil não possui acompanhamentos vinculados aqui.</p></div>';
  $$('[data-pillar]').forEach(button=>{button.classList.toggle('active',button.dataset.pillar===key);if(button.getAttribute('role')==='tab'){button.setAttribute('aria-selected',String(button.dataset.pillar===key));const count=pillars[button.dataset.pillar].projects.filter(item=>item.name!=='Todos os pilares').length;button.querySelector('small').textContent=`${count} ${count===1?'projeto':'projetos'}`}});bindDynamicEvents();$('#sidebar').classList.remove('open');
}

function showOnly(id){['dashboard-view','overview-view','schedule-view','permissions-view'].forEach(view=>$("#"+view).classList.toggle('hidden',view!==id));$$('.nav-item').forEach(button=>button.classList.remove('active'))}
function renderCurrentView(){if(activeView==='overview')renderOverview();else if(activeView==='schedule')renderSchedule();else if(activeView==='permissions')showPermissions();else renderPillar(activePillar)}
function showOverview(){activeView='overview';showOnly('overview-view');$('#page-title').textContent='Visão geral';$('[data-view="overview"]').classList.add('active');renderOverview();$('#sidebar').classList.remove('open')}
function renderOverview(){
  const actions=allActionsUnique();const done=actions.filter(item=>item.status==='done').length;const progress=actions.filter(item=>item.status==='progress').length;const attention=actions.filter(item=>item.status==='attention').length;const todo=actions.filter(item=>item.status==='todo').length;const completion=actions.length?Math.round(done/actions.length*100):0;
  $('#overview-metrics').innerHTML=`<article><small>Total de ações</small><strong>${actions.length}</strong><span>nos três pilares</span></article><article><small>Concluídas</small><strong>${done}</strong><span>${completion}% do total</span></article><article><small>Em andamento</small><strong>${progress}</strong><span>ações em execução</span></article><article><small>Precisam de atenção</small><strong>${attention}</strong><span>acompanhar prioridades</span></article>`;
  $('#status-chart').innerHTML=`<div class="donut-wrap"><div class="donut" style="--done:${completion*3.6}deg"><strong>${completion}%</strong><span>concluído</span></div><div class="chart-legend"><span><i class="todo"></i>Planejadas <b>${todo}</b></span><span><i class="progress"></i>Em andamento <b>${progress}</b></span><span><i class="attention"></i>Atenção <b>${attention}</b></span><span><i class="done"></i>Concluídas <b>${done}</b></span></div></div>`;
  $('#pillar-chart').innerHTML=Object.entries(pillars).map(([key,pillar])=>{const unique=new Map();pillar.projects.forEach(project=>project.actions.forEach(action=>unique.set(action.id,action)));const list=[...unique.values()];const value=list.length?Math.round(list.reduce((sum,item)=>sum+(item.progress||0),0)/list.length):0;return `<div class="bar-row"><div><strong>${pillar.title}</strong><span>${list.length} ações</span></div><div class="bar-track"><i class="${key}" style="width:${value}%"></i></div><b>${value}%</b></div>`}).join('');
  const upcoming=actions.filter(item=>item.due).sort((a,b)=>new Date(a.due)-new Date(b.due)).slice(0,6);$('#next-deadlines').innerHTML=upcoming.map(item=>`<div class="deadline-item"><time>${safe(dateBR(item.due))}</time><div><strong>${safe(item.title)}</strong><span>${safe(item.pillar)} · ${safe(item.project)}</span></div><span class="status ${item.status}">${safe(item.label)}</span></div>`).join('')||'<p class="no-update">Nenhum prazo cadastrado.</p>';
}
function showSchedule(){activeView='schedule';showOnly('schedule-view');$('#page-title').textContent='Cronograma';$('[data-view="schedule"]').classList.add('active');renderSchedule();$('#sidebar').classList.remove('open')}
function calendarEvents(){return allActionsUnique().flatMap(action=>[{date:action.due,title:action.title,pillar:action.pillar,type:'Ação'},...action.steps.filter(step=>step.due).map(step=>({date:step.due,title:step.title,pillar:action.pillar,type:'Etapa'}))]).filter(event=>event.date)}
function pillarClass(name){if(name==='Todos')return'todos';return Object.keys(pillars).find(key=>pillars[key].title===name)||'todos'}
function renderSchedule(){
  const year=calendarDate.getFullYear(),month=calendarDate.getMonth();$('#calendar-label').textContent=titleCase(new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(calendarDate));const first=new Date(year,month,1);const offset=(first.getDay()+6)%7;const start=new Date(year,month,1-offset);const events=calendarEvents();
  $('#calendar-grid').innerHTML=Array.from({length:42},(_,index)=>{const day=new Date(start);day.setDate(start.getDate()+index);const dayEvents=events.filter(event=>{const value=new Date(event.date);return value.getFullYear()===day.getFullYear()&&value.getMonth()===day.getMonth()&&value.getDate()===day.getDate()});const today=new Date();const classes=[day.getMonth()!==month?'outside':'',day.toDateString()===today.toDateString()?'today':''].filter(Boolean).join(' ');return `<article class="calendar-day ${classes}"><strong>${day.getDate()}</strong><div>${dayEvents.slice(0,3).map(event=>`<button type="button" class="calendar-event ${pillarClass(event.pillar)}" title="${safe(event.title)}"><span>${new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(event.date))}</span>${safe(event.title)}</button>`).join('')}${dayEvents.length>3?`<small>+${dayEvents.length-3} eventos</small>`:''}</div></article>`}).join('');
}

function findAction(actionId){for(const pillar of Object.values(pillars)){for(const project of pillar.projects){const action=project.actions.find(item=>item.id===actionId);if(action)return action}}}
async function moveAction(actionId,directionOrStatus){const item=findAction(actionId);if(!item||!userCanEdit(item))return;const current=kanbanColumns.findIndex(column=>column.key===item.status);const direct=kanbanColumns.findIndex(column=>column.key===directionOrStatus);const next=direct>=0?direct:directionOrStatus==='next'?current+1:current-1;if(next<0||next>=kanbanColumns.length)return;const key=kanbanColumns[next].key;const progressValue=key==='done'?100:key==='progress'?50:key==='attention'?25:0;if(demoMode){const row=demoActions.find(action=>action.id===item.id);row.status=statusDatabase[key];row.progress=progressValue;row.updates.push({id:crypto.randomUUID(),note:`Status alterado para ${statusLabels[key]}.`,created_by:session.user.id,created_at:new Date().toISOString()})}else{const {error:updateError}=await supabase.from('actions').update({status:statusDatabase[key],progress:progressValue}).eq('id',item.id);if(updateError){error('Não foi possível mover a ação.');return}await supabase.from('action_updates').insert({action_id:item.id,note:`Status alterado para ${statusLabels[key]}.`,created_by:session.user.id})}await loadData();flash(`Ação movida para ${statusLabels[key]}.`)}
function bindDynamicEvents(){
  $$('.new-record').forEach(button=>button.addEventListener('click',()=>openRecordDialog(Number(button.dataset.projectIndex))));
  $$('.delete-project').forEach(button=>button.addEventListener('click',()=>deleteProject(button.dataset.projectId)));
  $$('.kanban-card[draggable="true"]').forEach(card=>{card.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',card.dataset.actionId);card.classList.add('dragging')});card.addEventListener('dragend',()=>{$$('.kanban-column').forEach(column=>column.classList.remove('drag-over'));card.classList.remove('dragging')})});
  $$('.kanban-column').forEach(column=>{column.addEventListener('dragover',event=>{event.preventDefault();column.classList.add('drag-over')});column.addEventListener('dragleave',event=>{if(!column.contains(event.relatedTarget))column.classList.remove('drag-over')});column.addEventListener('drop',event=>{event.preventDefault();moveAction(event.dataTransfer.getData('text/plain'),column.dataset.dropStatus)})});
  $$('[data-move]').forEach(button=>button.addEventListener('click',()=>moveAction(button.dataset.actionId,button.dataset.move)));
  $$('[data-step-action]').forEach(input=>input.addEventListener('change',async()=>{const item=findAction(input.dataset.stepAction);const step=item?.steps[Number(input.dataset.stepIndex)];if(!step||!userCanEdit(item))return;if(demoMode){const row=demoActions.find(action=>action.id===item.id);row.steps.find(entry=>entry.id===step.id).done=input.checked}else{const {error:updateError}=await supabase.from('action_steps').update({done:input.checked}).eq('id',step.id);if(updateError){input.checked=!input.checked;error('Não foi possível atualizar a etapa.');return}}flash('Etapa atualizada.')}));
  $$('.update-form').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const input=form.querySelector('input');const item=findAction(form.dataset.actionId);if(!item||!userCanEdit(item))return;if(demoMode){demoActions.find(action=>action.id===item.id).updates.push({id:crypto.randomUUID(),note:input.value.trim(),created_by:session.user.id,created_at:new Date().toISOString()})}else{const {error:insertError}=await supabase.from('action_updates').insert({action_id:form.dataset.actionId,note:input.value.trim(),created_by:session.user.id});if(insertError){error('Não foi possível registrar a atualização.');return}}await loadData();flash('Atualização registrada.')}));
  $$('[data-edit-action]').forEach(button=>button.addEventListener('click',()=>openRecordDialog(null,findAction(button.dataset.editAction))));
  $$('[data-delete-action]').forEach(button=>button.addEventListener('click',()=>deleteAction(button.dataset.deleteAction)));
}

function populateCollaborators(selectedId=''){const select=$('#record-form [name="collaborator"]');const available=profiles.filter(item=>item.active);select.innerHTML=available.map(item=>`<option value="${item.id}" ${item.id===selectedId?'selected':''}>${safe(titleCase(item.full_name||item.email.split('@')[0]))}</option>`).join('')}
function openRecordDialog(projectIndex,item=null){const form=$('#record-form');form.reset();const project=item?pillars[activePillar].projects.find(project=>project.name===item.project||item.pillar==='Todos'&&project.name==='Todos os pilares'):pillars[activePillar].projects[projectIndex??0];form.dataset.projectName=item?.project||project?.name||'Geral';form.dataset.editingId=item?.id||'';$('#record-project').textContent=project?.name||item?.project||'Geral';populateCollaborators(item?.collaborator_id);if(item){form.elements.title.value=item.title;form.elements.due.value=datetimeInput(item.due);form.elements.scope.value=item.pillar==='Todos'?'Todos':'pillar';form.elements.steps.value=item.steps.map(step=>`${dateEdit(step.due)} — ${step.title}`).join('\n');form.elements.observation.value=item.observation||''}const collaboratorEditing=item&&profile.role==='collaborator';form.elements.collaborator.disabled=collaboratorEditing;form.elements.scope.disabled=collaboratorEditing;$('#record-dialog .eyebrow').textContent=item?'EDITAR ACOMPANHAMENTO':'NOVO ACOMPANHAMENTO';$('#record-dialog button[type="submit"]').textContent=item?'Salvar alterações':'Adicionar registro';$('#record-dialog').showModal()}
function parseStep(line,index){const parts=line.split(/\s+[—–-]\s+/);const dateText=parts.length>1?parts.shift().trim():'';const match=dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);let due=null;if(match){due=new Date(Number(match[3]),Number(match[2])-1,Number(match[1]),Number(match[4]||12),Number(match[5]||0)).toISOString()}return {title:(parts.join(' — ')||line).trim(),due,sort_order:index}}
async function saveRecord(event){
  event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setBusy(form,true);const editingId=form.dataset.editingId;const existing=editingId?findAction(editingId):null;const collaboratorId=data.get('collaborator')||existing?.collaborator_id;const collaborator=profiles.find(item=>item.id===collaboratorId);const scope=data.get('scope')||(existing?.pillar==='Todos'?'Todos':'pillar');const payload={title:data.get('title').trim(),pillar:scope==='Todos'?'Todos':pillars[activePillar].title,project:form.dataset.projectName,owner:collaborator?.full_name||currentName(),due:new Date(data.get('due')).toISOString(),observation:data.get('observation').trim(),collaborator_id:collaboratorId,manager_id:existing?.manager_id||(profile.role==='manager'?session.user.id:(collaborator?.manager_id||session.user.id))};
  const parsedSteps=data.get('steps').split('\n').map(line=>line.trim()).filter(Boolean).map(parseStep);const note=data.get('update').trim();let actionId=editingId;
  if(demoMode){
    if(editingId){const index=demoActions.findIndex(action=>action.id===editingId);const original=demoActions[index];demoActions[index]={...original,...payload,steps:parsedSteps.map((step,stepIndex)=>({...step,id:original.steps[stepIndex]?.id||crypto.randomUUID()})),updates:[...original.updates,{id:crypto.randomUUID(),note:`Ação editada por ${titleCase(currentName())}.`,created_by:session.user.id,created_at:new Date().toISOString()},...(note?[{id:crypto.randomUUID(),note,created_by:session.user.id,created_at:new Date().toISOString()}]:[])]}}else{actionId=crypto.randomUUID();demoActions.push({...payload,id:actionId,status:'Não iniciada',progress:0,impact:0,created_by:session.user.id,steps:parsedSteps.map(step=>({...step,id:crypto.randomUUID()})),updates:note?[{id:crypto.randomUUID(),note,created_by:session.user.id,created_at:new Date().toISOString()}]:[]})}
  }else{
    if(editingId){const {error:updateError}=await supabase.from('actions').update(payload).eq('id',editingId);if(updateError){setBusy(form,false);error('Não foi possível editar a ação.');return}await supabase.from('action_steps').delete().eq('action_id',editingId);await supabase.from('action_updates').insert({action_id:editingId,note:`Ação editada por ${titleCase(currentName())}.`,created_by:session.user.id})}else{const {data:created,error:insertError}=await supabase.from('actions').insert({...payload,status:'Não iniciada',progress:0,impact:0,created_by:session.user.id}).select().single();if(insertError){setBusy(form,false);error('Não foi possível criar a ação.');return}actionId=created.id}
    const steps=parsedSteps.map(step=>({...step,action_id:actionId}));if(steps.length){const {error:stepsError}=await supabase.from('action_steps').insert(steps);if(stepsError)error('A ação foi salva, mas houve falha ao salvar algumas etapas.')}if(note)await supabase.from('action_updates').insert({action_id:actionId,note,created_by:session.user.id});
  }
  setBusy(form,false);form.elements.collaborator.disabled=false;form.elements.scope.disabled=false;$('#record-dialog').close();await loadData();flash(editingId?'Ação atualizada.':'Ação criada.')
}
async function deleteAction(actionId){const item=findAction(actionId);if(!item||!userCanDelete(item)||!confirm('Excluir esta ação e todo o seu acompanhamento?'))return;if(demoMode){demoActions=demoActions.filter(action=>action.id!==actionId)}else{const {error:deleteError}=await supabase.from('actions').delete().eq('id',actionId);if(deleteError){error('Não foi possível excluir a ação.');return}}await loadData();flash('Ação excluída.')}

function renderPermissions(){if(!isSiteOwner())return;const managers=profiles.filter(item=>item.role==='manager'&&item.active);$('#users-count').textContent=`${profiles.length} usuários`;$('#users-table').innerHTML=profiles.map(user=>{const display=titleCase(user.full_name||user.email);return `<tr><td><div class="user-cell"><span>${safe(display.split(' ').map(part=>part[0]).slice(0,2).join(''))}</span><div><strong>${safe(display)}</strong><small>${safe(user.email)}</small></div></div></td><td><select class="permission-select role-control" data-user-id="${user.id}" ${user.id===session.user.id?'disabled':''}><option value="admin" ${user.role==='admin'?'selected':''}>Administrador</option><option value="manager" ${user.role==='manager'?'selected':''}>Gestor</option><option value="collaborator" ${user.role==='collaborator'?'selected':''}>Colaborador</option></select></td><td><select class="permission-select manager-control" data-user-id="${user.id}" ${user.role!=='collaborator'?'disabled':''}><option value="">Sem vínculo</option>${managers.map(manager=>`<option value="${manager.id}" ${user.manager_id===manager.id?'selected':''}>${safe(titleCase(manager.full_name))}</option>`).join('')}</select></td><td><label class="access-toggle"><input class="active-control" data-user-id="${user.id}" type="checkbox" ${user.active?'checked':''} ${user.id===session.user.id?'disabled':''}><span></span><b>${user.active?'Ativo':'Suspenso'}</b></label></td></tr>`}).join('');bindPermissionEvents()}
function bindPermissionEvents(){$$('.role-control').forEach(control=>control.addEventListener('change',()=>updateProfile(control.dataset.userId,{role:control.value,manager_id:null})));$$('.manager-control').forEach(control=>control.addEventListener('change',()=>updateProfile(control.dataset.userId,{manager_id:control.value||null})));$$('.active-control').forEach(control=>control.addEventListener('change',()=>updateProfile(control.dataset.userId,{active:control.checked})))}
async function updateProfile(userId,changes){if(!isSiteOwner())return;if(demoMode){Object.assign(profiles.find(user=>user.id===userId),changes)}else{const {error:updateError}=await supabase.from('profiles').update(changes).eq('id',userId);if(updateError){error('Não foi possível atualizar a permissão.');return}}await loadData();renderPermissions();flash('Permissão atualizada.')}
function showPermissions(){if(!isSiteOwner())return;activeView='permissions';showOnly('permissions-view');$('#access-nav').classList.add('active');$('#page-title').textContent='Usuários e acessos';renderPermissions();$('#sidebar').classList.remove('open')}
function showDashboard(){renderPillar(activePillar)}

function openProjectDialog(){if(profile.role!=='admin')return;$('#project-form').reset();$('#project-pillar').textContent=pillars[activePillar].title;$('#project-dialog').showModal()}
async function saveProject(event){event.preventDefault();if(profile.role!=='admin')return;const form=event.currentTarget;const data=new FormData(form);const project={id:crypto.randomUUID(),pillar:pillars[activePillar].title,name:data.get('name').trim(),description:data.get('description').trim(),icon:(data.get('icon').trim()||data.get('name').trim().slice(0,2)).toUpperCase(),observation:data.get('observation').trim(),sort_order:pillars[activePillar].projects.length,active:true,created_by:session.user.id};setBusy(form,true);if(demoMode){customProjects.push(project)}else{const {error:insertError}=await supabase.from('projects').insert(project);if(insertError){setBusy(form,false);error('Não foi possível adicionar o projeto.');return}}setBusy(form,false);$('#project-dialog').close();await loadData();flash('Projeto adicionado.')}
async function deleteProject(projectId){const project=customProjects.find(item=>item.id===projectId);if(profile.role!=='admin'||!project||project.created_by!==session.user.id)return;const rendered=pillars[activePillar].projects.find(item=>item.id===projectId);const actionCount=rendered?.actions.length||0;const warning=actionCount?`Este projeto possui ${actionCount} ${actionCount===1?'ação':'ações'}. Ao continuar, o projeto, suas ações, etapas e todo o histórico serão excluídos. Deseja continuar?`:`Excluir o projeto "${project.name}"?`;if(!confirm(warning))return;if(demoMode){demoActions=demoActions.filter(action=>!(action.pillar===project.pillar&&action.project===project.name));customProjects=customProjects.filter(item=>item.id!==projectId)}else{const {error:deleteError}=await supabase.rpc('delete_owned_project',{target:projectId});if(deleteError){error('Não foi possível excluir o projeto. Somente o administrador que o criou pode realizar esta exclusão.');return}}await loadData();flash('Projeto e registros vinculados excluídos.')}

function bindStaticEvents(){
  $('#login-form').addEventListener('submit',async event=>{event.preventDefault();if(demoMode)return;setBusy(event.currentTarget,true);const {error:loginError}=await supabase.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});setBusy(event.currentTarget,false);if(loginError)error('E-mail ou senha inválidos.')});
  $('#forgot-password').addEventListener('click',async()=>{if(demoMode)return;const email=$('#login-email').value.trim();if(!email){error('Digite seu e-mail para redefinir a senha.');return}const {error:resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});resetError?error('Não foi possível enviar o e-mail de recuperação.'):flash('Confira seu e-mail para criar uma nova senha.')});
  $('#new-password-form').addEventListener('submit',async event=>{event.preventDefault();if(demoMode)return;setBusy(event.currentTarget,true);inviteFlow=false;const {error:updateError}=await supabase.auth.updateUser({password:$('#new-password').value});setBusy(event.currentTarget,false);if(updateError){error('Não foi possível salvar a senha.');return}history.replaceState({},document.title,location.pathname);flash('Senha criada.');hide('new-password-form');await renderAuthState()});
  $$('.password-toggle').forEach(button=>button.addEventListener('click',()=>{const input=$(`#${button.dataset.passwordTarget}`);input.type=input.type==='password'?'text':'password';button.setAttribute('aria-label',input.type==='password'?'Mostrar senha':'Ocultar senha')}));
  $('#logout-button').addEventListener('click',()=>demoMode?flash('Na prévia, a sessão demonstrativa permanece ativa.'):supabase.auth.signOut());$('#record-form').addEventListener('submit',saveRecord);$('#project-form').addEventListener('submit',saveProject);$('#access-nav').addEventListener('click',showPermissions);$('#back-dashboard').addEventListener('click',showDashboard);$('#hero-new').addEventListener('click',()=>openRecordDialog(0));$('#new-project').addEventListener('click',openProjectDialog);$('.icon-close').addEventListener('click',()=>$('#record-dialog').close());$('.cancel-record').addEventListener('click',()=>$('#record-dialog').close());$('.close-project').addEventListener('click',()=>$('#project-dialog').close());$('.cancel-project').addEventListener('click',()=>$('#project-dialog').close());$$('[data-pillar]').forEach(button=>button.addEventListener('click',()=>renderPillar(button.dataset.pillar)));$$('[data-view]').forEach(button=>button.addEventListener('click',()=>button.dataset.view==='overview'?showOverview():showSchedule()));$('#calendar-prev').addEventListener('click',()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1);renderSchedule()});$('#calendar-next').addEventListener('click',()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1);renderSchedule()});$('#menu-button').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
}

resetPillars();init();
