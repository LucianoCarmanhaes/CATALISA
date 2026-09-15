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
let inviteFlow=location.hash.includes('type=invite')||new URLSearchParams(location.search).get('type')==='invite';

function resetPillars(){
  pillars=Object.fromEntries(Object.entries(pillarTemplates).map(([key,pillar])=>[key,{...pillar,projects:pillar.projects.map(([name,icon,description])=>({name,icon,description,actions:[]}))}]));
}
function flash(message){const toast=$('#toast');toast.textContent=`✓ ${message}`;toast.classList.add('show');clearTimeout(flash.timer);flash.timer=setTimeout(()=>toast.classList.remove('show'),3200)}
function error(message){const banner=$('#error-banner');banner.textContent=message;banner.classList.remove('hidden');clearTimeout(error.timer);error.timer=setTimeout(()=>banner.classList.add('hidden'),6000)}
function setBusy(form,busy){$$('button,input,select,textarea',form).forEach(element=>element.disabled=busy)}
function dateBR(value){if(!value)return 'Sem data';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)).replace('.','')}
function datetimeInput(value){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function dateEdit(value){if(!value)return 'A definir';const date=new Date(value);const pad=number=>String(number).padStart(2,'0');return `${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`}
function currentName(){return profile?.full_name||session?.user?.email||'Usuário'}
function canManage(){return ['admin','manager'].includes(profile?.role)}

async function init(){
  hide('loading-view');
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY){show('setup-view');return}
  supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  bindStaticEvents();
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
  const [profilesResult,actionsResult,stepsResult,updatesResult]=await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('actions').select('*').order('due'),
    supabase.from('action_steps').select('*').order('sort_order'),
    supabase.from('action_updates').select('*').order('created_at')
  ]);
  const firstError=[profilesResult,actionsResult,stepsResult,updatesResult].find(result=>result.error)?.error;
  if(firstError){error(`Não foi possível carregar o painel: ${firstError.message}`);return}
  profiles=profilesResult.data||[];resetPillars();
  const stepsByAction=(stepsResult.data||[]).reduce((groups,step)=>{(groups[step.action_id]??=[]).push(step);return groups},{});
  const updatesByAction=(updatesResult.data||[]).reduce((groups,update)=>{(groups[update.action_id]??=[]).push(update);return groups},{});
  for(const row of actionsResult.data||[]){
    const manager=profiles.find(item=>item.id===row.manager_id);
    const collaborator=profiles.find(item=>item.id===row.collaborator_id);
    const action={...row,dueLabel:dateBR(row.due),manager:manager?.full_name||row.owner,collaborator:collaborator?.full_name||row.owner,steps:(stepsByAction[row.id]||[]).map(step=>({...step,dateLabel:dateBR(step.due)})),updates:(updatesByAction[row.id]||[]).map(update=>({...update,dateLabel:dateBR(update.created_at),text:update.note})),status:statusKeys[row.status]||'todo',label:row.status==='Não iniciada'?'Planejada':row.status};
    const targetKeys=row.pillar==='Todos'?Object.keys(pillars):[Object.keys(pillars).find(key=>pillars[key].title===row.pillar)].filter(Boolean);
    for(const key of targetKeys){
      let project=pillars[key].projects.find(item=>item.name===row.project);
      if(!project){project={name:row.pillar==='Todos'?'Todos os pilares':row.project||'Geral',icon:'+',description:'Ações de abrangência geral.',actions:[]};pillars[key].projects.push(project)}
      project.actions.push(action);
    }
  }
  updateProfileHeader();renderPillar(activePillar);
}

function visibleProjects(pillar){return profile.role==='collaborator'?pillar.projects.filter(project=>project.actions.length):pillar.projects}
function stepMarkup(step,index,item){return `<label class="subaction"><input type="checkbox" data-step-action="${item.id}" data-step-index="${index}" ${step.done?'checked':''} ${canManage()?'':'disabled'}><span><strong>${safe(step.title)}</strong><small>${safe(step.dateLabel)}</small></span></label>`}
function updateMarkup(update){return `<div class="update-entry"><span>${safe(update.dateLabel)}</span><p>${safe(update.text)}</p></div>`}
function actionMarkup(item,columnIndex){const completed=item.steps.filter(step=>step.done).length;return `<article class="kanban-card" data-action-id="${item.id}" ${canManage()?'draggable="true"':''}><div class="card-grip" aria-hidden="true">⋮⋮</div><span class="status ${item.status}">${safe(item.label)}</span><h5>${safe(item.title)}</h5><div class="card-person"><span>${safe(item.collaborator.split(' ').map(part=>part[0]).slice(0,2).join(''))}</span><div><small>Colaborador</small><strong>${safe(item.collaborator)}</strong></div></div><div class="card-facts"><span>Prazo <b>${safe(item.dueLabel)}</b></span><span>Etapas <b>${completed}/${item.steps.length}</b></span></div><details class="kanban-details"><summary>Ver acompanhamento</summary><div class="card-details">${item.observation?`<p class="card-observation">${safe(item.observation)}</p>`:''}<h6>Ações previstas e datas</h6><div class="subactions">${item.steps.map((step,index)=>stepMarkup(step,index,item)).join('')||'<p class="no-update">Nenhuma etapa registrada.</p>'}</div><div class="journal"><h6>O que está ocorrendo</h6><div class="update-list">${item.updates.map(updateMarkup).join('')||'<p class="no-update">Nenhuma atualização registrada.</p>'}</div>${canManage()?`<form class="update-form" data-action-id="${item.id}"><input aria-label="Nova atualização" placeholder="Escreva o que ocorreu…" required><button type="submit">Registrar</button></form>`:''}</div>${canManage()?`<div class="card-admin-actions"><button type="button" data-edit-action="${item.id}">Editar</button><button type="button" data-delete-action="${item.id}">Excluir</button></div>`:''}</div></details>${canManage()?`<div class="move-actions"><button type="button" data-move="prev" data-action-id="${item.id}" ${columnIndex===0?'disabled':''}>←</button><small>Mover</small><button type="button" data-move="next" data-action-id="${item.id}" ${columnIndex===kanbanColumns.length-1?'disabled':''}>→</button></div>`:''}</article>`}
function boardMarkup(project){return `<div class="kanban-board">${kanbanColumns.map((column,columnIndex)=>{const items=project.actions.filter(item=>item.status===column.key);return `<section class="kanban-column ${column.key}" data-drop-status="${column.key}"><header><span></span><strong>${column.title}</strong><b>${items.length}</b></header><div class="kanban-list">${items.map(item=>actionMarkup(item,columnIndex)).join('')||'<p class="column-empty">Solte uma ação aqui</p>'}</div></section>`}).join('')}</div>`}
function updateProfileHeader(){const name=currentName();$('#user-initials').textContent=name.split(' ').map(part=>part[0]).slice(0,2).join('').toUpperCase();$('#user-name').textContent=name;$('#user-role').textContent=roleLabels[profile.role];const messages={admin:'Você está visualizando e administrando todos os pilares, projetos e ações.',manager:'Você visualiza as ações iniciadas por você com seus colaboradores.',collaborator:'Você acompanha somente as ações vinculadas ao seu perfil.'};$('#access-summary').innerHTML=`<span>${roleLabels[profile.role]}</span><p>${messages[profile.role]}</p>`;$('#access-nav').hidden=profile.role!=='admin'}
function renderPillar(key){
  activePillar=key;const pillar=pillars[key];const projects=visibleProjects(pillar);const actionMap=new Map();projects.forEach(project=>project.actions.forEach(action=>actionMap.set(action.id,action)));const actions=[...actionMap.values()];const steps=actions.reduce((total,action)=>total+action.steps.length,0);const progress=actions.length?Math.round(actions.reduce((total,action)=>total+(action.status==='done'?100:action.status==='attention'?25:action.status==='progress'?55:0),0)/actions.length):0;
  $('#pillar-kicker').textContent=pillar.number;$('#pillar-title').textContent=pillar.title;$('#page-title').textContent=`Pilar ${pillar.title}`;$('#pillar-description').textContent=pillar.description;$('#metric-projects').textContent=projects.length;$('#metric-actions').textContent=actions.length;$('#metric-subactions').textContent=steps;$('#metric-progress').textContent=`${progress}%`;$('#metric-bar').style.width=`${progress}%`;$('#hero-new').hidden=!canManage()||!projects.length;
  $('#projects').innerHTML=projects.length?projects.map((project,index)=>`<article class="project-card"><header class="project-head"><div class="project-title"><span class="project-icon">${project.icon}</span><div><h4>${safe(project.name)}</h4><p>${safe(project.description)}</p></div></div><div class="project-summary"><span>${project.actions.length} ${project.actions.length===1?'acompanhamento':'acompanhamentos'}</span><strong>${project.actions.reduce((total,action)=>total+action.steps.length,0)} atuações</strong>${canManage()?`<button class="secondary new-record" data-project-index="${index}">+ Registro</button>`:''}</div></header><div class="project-body">${boardMarkup(project)}</div></article>`).join(''):'<div class="profile-empty"><strong>Nenhuma ação disponível neste pilar</strong><p>Este perfil não possui acompanhamentos vinculados aqui.</p></div>';
  $$('[data-pillar]').forEach(button=>{button.classList.toggle('active',button.dataset.pillar===key);if(button.getAttribute('role')==='tab')button.setAttribute('aria-selected',String(button.dataset.pillar===key))});bindDynamicEvents();$('#sidebar').classList.remove('open');
}

function findAction(actionId){for(const pillar of Object.values(pillars)){for(const project of pillar.projects){const action=project.actions.find(item=>item.id===actionId);if(action)return action}}}
async function moveAction(actionId,directionOrStatus){const item=findAction(actionId);if(!item||!canManage())return;const current=kanbanColumns.findIndex(column=>column.key===item.status);const direct=kanbanColumns.findIndex(column=>column.key===directionOrStatus);const next=direct>=0?direct:directionOrStatus==='next'?current+1:current-1;if(next<0||next>=kanbanColumns.length)return;const key=kanbanColumns[next].key;const {error:updateError}=await supabase.from('actions').update({status:statusDatabase[key],progress:key==='done'?100:key==='progress'?50:key==='attention'?25:0}).eq('id',item.id);if(updateError){error('Não foi possível mover a ação.');return}await loadData();flash(`Ação movida para ${statusLabels[key]}.`)}
function bindDynamicEvents(){
  $$('.new-record').forEach(button=>button.addEventListener('click',()=>openRecordDialog(Number(button.dataset.projectIndex))));
  $$('.kanban-card[draggable="true"]').forEach(card=>{card.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',card.dataset.actionId);card.classList.add('dragging')});card.addEventListener('dragend',()=>{$$('.kanban-column').forEach(column=>column.classList.remove('drag-over'));card.classList.remove('dragging')})});
  $$('.kanban-column').forEach(column=>{column.addEventListener('dragover',event=>{event.preventDefault();column.classList.add('drag-over')});column.addEventListener('dragleave',event=>{if(!column.contains(event.relatedTarget))column.classList.remove('drag-over')});column.addEventListener('drop',event=>{event.preventDefault();moveAction(event.dataTransfer.getData('text/plain'),column.dataset.dropStatus)})});
  $$('[data-move]').forEach(button=>button.addEventListener('click',()=>moveAction(button.dataset.actionId,button.dataset.move)));
  $$('[data-step-action]').forEach(input=>input.addEventListener('change',async()=>{const item=findAction(input.dataset.stepAction);const step=item?.steps[Number(input.dataset.stepIndex)];if(!step)return;const {error:updateError}=await supabase.from('action_steps').update({done:input.checked}).eq('id',step.id);if(updateError){input.checked=!input.checked;error('Não foi possível atualizar a etapa.');return}flash('Etapa atualizada.')}));
  $$('.update-form').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const input=form.querySelector('input');const {error:insertError}=await supabase.from('action_updates').insert({action_id:form.dataset.actionId,note:input.value.trim(),created_by:session.user.id});if(insertError){error('Não foi possível registrar a atualização.');return}await loadData();flash('Atualização registrada.')}));
  $$('[data-edit-action]').forEach(button=>button.addEventListener('click',()=>openRecordDialog(null,findAction(button.dataset.editAction))));
  $$('[data-delete-action]').forEach(button=>button.addEventListener('click',()=>deleteAction(button.dataset.deleteAction)));
}

function populateCollaborators(selectedId=''){const select=$('#record-form [name="collaborator"]');const available=profiles.filter(item=>item.active&&item.role==='collaborator');select.innerHTML=available.map(item=>`<option value="${item.id}" ${item.id===selectedId?'selected':''}>${safe(item.full_name||item.email)}</option>`).join('')}
function openRecordDialog(projectIndex,item=null){const form=$('#record-form');form.reset();const project=item?pillars[activePillar].projects.find(project=>project.name===item.project):pillars[activePillar].projects[projectIndex??0];form.dataset.projectName=project?.name||'Geral';form.dataset.editingId=item?.id||'';$('#record-project').textContent=project?.name||item?.project||'Geral';populateCollaborators(item?.collaborator_id);if(item){form.elements.title.value=item.title;form.elements.due.value=datetimeInput(item.due);form.elements.scope.value=item.pillar==='Todos'?'Todos':'pillar';form.elements.steps.value=item.steps.map(step=>`${dateEdit(step.due)} — ${step.title}`).join('\n');form.elements.observation.value=item.observation||''}$('#record-dialog .eyebrow').textContent=item?'EDITAR ACOMPANHAMENTO':'NOVO ACOMPANHAMENTO';$('#record-dialog button[type="submit"]').textContent=item?'Salvar alterações':'Adicionar registro';$('#record-dialog').showModal()}
function parseStep(line,index){const parts=line.split(/\s+[—–-]\s+/);const dateText=parts.length>1?parts.shift().trim():'';const match=dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);let due=null;if(match){due=new Date(Number(match[3]),Number(match[2])-1,Number(match[1]),Number(match[4]||12),Number(match[5]||0)).toISOString()}return {title:(parts.join(' — ')||line).trim(),due,sort_order:index}}
async function saveRecord(event){
  event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setBusy(form,true);const editingId=form.dataset.editingId;const collaborator=profiles.find(item=>item.id===data.get('collaborator'));const payload={title:data.get('title').trim(),pillar:data.get('scope')==='Todos'?'Todos':pillars[activePillar].title,project:form.dataset.projectName,owner:collaborator?.full_name||currentName(),due:new Date(data.get('due')).toISOString(),observation:data.get('observation').trim(),collaborator_id:data.get('collaborator'),manager_id:profile.role==='manager'?session.user.id:(collaborator?.manager_id||session.user.id)};
  let actionId=editingId;if(editingId){const {error:updateError}=await supabase.from('actions').update(payload).eq('id',editingId);if(updateError){setBusy(form,false);error('Não foi possível editar a ação.');return}await supabase.from('action_steps').delete().eq('action_id',editingId)}else{const {data:created,error:insertError}=await supabase.from('actions').insert({...payload,status:'Não iniciada',progress:0,impact:0,created_by:session.user.id}).select().single();if(insertError){setBusy(form,false);error('Não foi possível criar a ação.');return}actionId=created.id}
  const steps=data.get('steps').split('\n').map(line=>line.trim()).filter(Boolean).map(parseStep).map(step=>({...step,action_id:actionId}));if(steps.length){const {error:stepsError}=await supabase.from('action_steps').insert(steps);if(stepsError)error('A ação foi salva, mas houve falha ao salvar algumas etapas.')}
  const note=data.get('update').trim();if(note)await supabase.from('action_updates').insert({action_id:actionId,note,created_by:session.user.id});setBusy(form,false);$('#record-dialog').close();await loadData();flash(editingId?'Ação atualizada.':'Ação criada.')
}
async function deleteAction(actionId){if(!confirm('Excluir esta ação e todo o seu acompanhamento?'))return;const {error:deleteError}=await supabase.from('actions').delete().eq('id',actionId);if(deleteError){error('Não foi possível excluir a ação.');return}await loadData();flash('Ação excluída.')}

function renderPermissions(){const managers=profiles.filter(item=>item.role==='manager'&&item.active);$('#users-count').textContent=`${profiles.length} usuários`;$('#users-table').innerHTML=profiles.map(user=>`<tr><td><div class="user-cell"><span>${safe((user.full_name||user.email).split(' ').map(part=>part[0]).slice(0,2).join(''))}</span><div><strong>${safe(user.full_name||user.email)}</strong><small>${safe(user.email)}</small></div></div></td><td><select class="permission-select role-control" data-user-id="${user.id}" ${user.id===session.user.id?'disabled':''}><option value="admin" ${user.role==='admin'?'selected':''}>Administrador</option><option value="manager" ${user.role==='manager'?'selected':''}>Gestor</option><option value="collaborator" ${user.role==='collaborator'?'selected':''}>Colaborador</option></select></td><td><select class="permission-select manager-control" data-user-id="${user.id}" ${user.role!=='collaborator'?'disabled':''}><option value="">Sem vínculo</option>${managers.map(manager=>`<option value="${manager.id}" ${user.manager_id===manager.id?'selected':''}>${safe(manager.full_name)}</option>`).join('')}</select></td><td><label class="access-toggle"><input class="active-control" data-user-id="${user.id}" type="checkbox" ${user.active?'checked':''} ${user.id===session.user.id?'disabled':''}><span></span><b>${user.active?'Ativo':'Suspenso'}</b></label></td></tr>`).join('');bindPermissionEvents()}
function bindPermissionEvents(){$$('.role-control').forEach(control=>control.addEventListener('change',()=>updateProfile(control.dataset.userId,{role:control.value,manager_id:null})));$$('.manager-control').forEach(control=>control.addEventListener('change',()=>updateProfile(control.dataset.userId,{manager_id:control.value||null})));$$('.active-control').forEach(control=>control.addEventListener('change',()=>updateProfile(control.dataset.userId,{active:control.checked})))}
async function updateProfile(userId,changes){const {error:updateError}=await supabase.from('profiles').update(changes).eq('id',userId);if(updateError){error('Não foi possível atualizar a permissão.');return}await loadData();renderPermissions();flash('Permissão atualizada.')}
function showPermissions(){if(profile.role!=='admin')return;$('#dashboard-view').classList.add('hidden');$('#permissions-view').classList.remove('hidden');$('#page-title').textContent='Usuários e acessos';renderPermissions()}
function showDashboard(){$('#permissions-view').classList.add('hidden');$('#dashboard-view').classList.remove('hidden');renderPillar(activePillar)}

function bindStaticEvents(){
  $('#login-form').addEventListener('submit',async event=>{event.preventDefault();setBusy(event.currentTarget,true);const {error:loginError}=await supabase.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});setBusy(event.currentTarget,false);if(loginError)error('E-mail ou senha inválidos.')});
  $('#forgot-password').addEventListener('click',async()=>{const email=$('#login-email').value.trim();if(!email){error('Digite seu e-mail para redefinir a senha.');return}const {error:resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});resetError?error('Não foi possível enviar o e-mail de recuperação.'):flash('Confira seu e-mail para criar uma nova senha.')});
  $('#new-password-form').addEventListener('submit',async event=>{event.preventDefault();setBusy(event.currentTarget,true);inviteFlow=false;const {error:updateError}=await supabase.auth.updateUser({password:$('#new-password').value});setBusy(event.currentTarget,false);if(updateError){error('Não foi possível salvar a senha.');return}history.replaceState({},document.title,location.pathname);flash('Senha criada.');hide('new-password-form');await renderAuthState()});
  $$('.password-toggle').forEach(button=>button.addEventListener('click',()=>{const input=$(`#${button.dataset.passwordTarget}`);input.type=input.type==='password'?'text':'password';button.setAttribute('aria-label',input.type==='password'?'Mostrar senha':'Ocultar senha')}));
  $('#logout-button').addEventListener('click',()=>supabase.auth.signOut());$('#record-form').addEventListener('submit',saveRecord);$('#access-nav').addEventListener('click',showPermissions);$('#back-dashboard').addEventListener('click',showDashboard);$('#hero-new').addEventListener('click',()=>openRecordDialog(0));$('.icon-close').addEventListener('click',()=>$('#record-dialog').close());$('.cancel-record').addEventListener('click',()=>$('#record-dialog').close());$$('[data-pillar]').forEach(button=>button.addEventListener('click',()=>{showDashboard();renderPillar(button.dataset.pillar)}));$('#menu-button').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
}

resetPillars();init();
