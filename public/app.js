const $=sel=>document.querySelector(sel);
const data={user:null,legalRequests:false,mode:'login',offset:0,country:'',preview:true,more:false};
function el(tag,cls,text) {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
function clear(node) {node.replaceChildren();}
function showToast(message) {const t=$('#toast');t.textContent=message;t.classList.add('visible');setTimeout(()=>t.classList.remove('visible'),5500);}
async function api(path,method='GET',payload) {
  const options={method,credentials:'same-origin',headers:{}};
  if(payload!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(payload);}
  const resp=await fetch(path,options);const body=await resp.json().catch(()=>({}));
  if(!resp.ok) throw Error(body.error||`HTTP ${resp.status}`);
  return body;
}
function openAuth(mode='login',role='candidate') {
  data.mode=mode;$('#authPanel').hidden=false;$('#authTitle').textContent=mode==='signup'?'Criar conta':'Entrar na conta';
  $('#nameField').hidden=mode!=='signup';$('#roleField').hidden=mode!=='signup';$('#passwordHint').hidden=mode!=='signup';
  $('#authPass').setAttribute('autocomplete',mode==='signup'?'new-password':'current-password');$('#authSubmit').textContent=mode==='signup'?'Criar conta':'Entrar';
  $('#authNote').textContent=mode==='signup'?'Após criar a conta, você poderá iniciar o checkout InfinitePay. Não liberamos acessos sem confirmação do pagamento.':'Se sua conta foi criada pelo administrador, use a senha provisória e altere-a no painel.';
  $('#authRole').value=role;$('#authPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function countryName(id){return {PT:'Portugal',DE:'Alemanha',IE:'Irlanda'}[id]||id;}
function flag(id){return {PT:'🇵🇹',DE:'🇩🇪',IE:'🇮🇪'}[id]||'🌍';}
function badge(status){return status==='confirmed'?['tag','Internacional indicada no anúncio']:status==='not_confirmed'?['tag bad','Restrição de autorização sinalizada']:['tag warn','Apoio internacional não confirmado'];}
function loginState(me) {
  data.user=me?.user||null;data.legalRequests=!!me?.legal_requests_enabled;
  $('#dashboard').hidden=!data.user;
  if(data.user){
    $('#welcome').textContent=`Olá, ${data.user.name.split(' ')[0]}!`;
    $('#accountInfo').textContent=`${data.user.email} · ${data.user.role==='lawyer'?'Profissional jurídico':data.user.role==='candidate'?'Candidato':'Administrador'}`;
    $('#passwordBox').hidden=false;
    $('#accessArea').replaceChildren();
    if(data.user.must_change_password){$('#accessArea').append(el('div','status','Você precisa trocar a senha provisória para continuar.'));}
    else if(!data.user.active){const msg=el('div','status',`Seu acesso não está ativo. Adquira ${data.user.role==='lawyer'?'o plano jurídico (R$ 29,90)':'o plano candidato (R$ 9,90)'} para liberar seu painel.`);$('#accessArea').append(msg);}
    else {$('#accessArea').append(el('div','status green',`Acesso ativo até: ${new Date(data.user.access_until.replace(' ','T')+'Z').toLocaleDateString('pt-BR')}`));}
    if(data.user.role!=='admin'&&!data.user.must_change_password){const b=el('button','btn accent',data.user.active?'Renovar plano (mais 30 dias)':'Comprar acesso (30 dias)');b.onclick=buy;$('#accessArea').append(b);}
    $('#loginToggle').textContent='Meu painel';$('#userPanel').replaceChildren();
    if(data.user.role==='lawyer'&&data.user.active&&!data.user.must_change_password) showLawyerPanel();
  } else {$('#loginToggle').textContent='Entrar';$('#userPanel').replaceChildren();}
}
async function refreshMe() {try{loginState(await api('/api/me'));}catch{loginState(null);} await loadJobs(true);}
async function buy(){if(!data.user){openAuth('signup');return;}if(data.user.must_change_password){showToast('Altere sua senha provisória antes de pagar.');return;}
  try{const x=await api('/api/checkout','POST',{});window.location.assign(x.checkout_url);}catch(err){showToast(err.message);}}
async function loadJobs(reset=false){
  if(reset){data.offset=0;clear($('#jobList'));}
  try{const qs=new URLSearchParams();if(data.country)qs.set('country',data.country);qs.set('offset',data.offset);qs.set('limit','20');
    const result=await api(`/api/jobs?${qs}`);data.preview=result.preview;
    for(const j of result.jobs){const card=el('article','job');const head=el('div','job-head');const left=el('div');left.append(el('div','muted',j.employer),el('h3','',j.title));head.append(left,el('div','flag',flag(j.country)));card.append(head);
      card.append(el('div','job-meta',`${countryName(j.country)} · ${j.location}`));const [cls,btext]=badge(j.international_status);card.append(el('div',cls,btext));
      if(j.summary)card.append(el('p','',j.summary.slice(0,240)));card.append(el('p','muted',j.status_evidence));
      if(j.salary)card.append(el('p','',`Remuneração informada: ${j.salary}`));
      if(!data.preview){const row=el('div','job-actions');for(const [txt,href] of [['Ver anúncio original',j.job_url],['Candidatar-se',j.apply_url]]){const link=el('a','btn outline',txt);link.href=href;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}card.append(row);}
      $('#jobList').append(card);}
    if(data.preview)$('#jobList').append(el('div','status','Prévia pública: entre e ative seu plano para abrir os links de candidatura e ver o catálogo completo.'));
    if(data.offset===0&&result.jobs.length===0)$('#jobList').append(el('div','status','Nenhuma vaga importada para este filtro. A coleta inicia após o cadastro de fontes autorizadas.'));
    data.offset+=result.jobs.length;$('#pagination').hidden=data.preview||result.jobs.length<20;
  }catch(err){showToast('Falha ao consultar vagas: '+err.message);}
}
async function loadLegal(){try{const response=await api('/api/legal');const cards=$('#legalCards');clear(cards);
  for(const [id,item] of Object.entries(response)){const c=el('div','legal-card');c.append(el('h3','',`${flag(id)} ${item.country}`),el('p','',item.note));for(const link of item.links){const a=el('a','',link.label+' ↗');a.href=link.url;a.rel='noopener noreferrer';a.target='_blank';c.append(a);}cards.append(c);} }catch(err){showToast(err.message);}}
async function loadLawyers(){try{const country=$('#lawyerCountry').value;const q=country?'?country='+country:'';const response=await api('/api/lawyers'+q);clear($('#lawyerCards'));
  for(const l of response.lawyers){const card=el('article','lawyer-card');card.append(el('h3','',l.name),el('div','muted',`${countryName(l.country)} · ${l.bar_name||'Órgão profissional'} · Registro: ${l.registration||'verificado'}`));card.append(el('p','',`Idiomas: ${l.languages||'Não informado'}`));if(l.description)card.append(el('p','',l.description));
    if(data.user?.role==='candidate'&&data.user.active){const b=el('button','btn outline','Solicitar contato');b.onclick=()=>contactForm(card,l);card.append(b);}$('#lawyerCards').append(card);}
  }catch(err){showToast(err.message);}}
function contactForm(parent,lawyer){if(!data.legalRequests){showToast('Solicitações temporariamente desativadas até validação jurídica.');return;}const f=el('form','mini');f.append(el('h3','',`Solicitar contato a ${lawyer.name}`));const phone=el('input');phone.placeholder='Telefone/WhatsApp (opcional)';phone.type='tel';phone.maxLength=40;const message=el('textarea');message.required=true;message.minLength=10;message.placeholder='Explique brevemente sua dúvida sobre documentação';const row=el('label');row.style.display='flex';row.style.gap='9px';const cb=el('input');cb.type='checkbox';cb.required=true;cb.style.width='18px';cb.style.minHeight='18px';row.append(cb,el('span','',`Autorizo compartilhar meu nome, e-mail, telefone informado e mensagem apenas com ${lawyer.name}, para que ele me contate diretamente.`));const submit=el('button','btn accent','Enviar ao profissional escolhido');submit.type='submit';f.append(phone,message,row,submit);f.onsubmit=async e=>{e.preventDefault();try{await api('/api/requests','POST',{lawyer_id:lawyer.id,phone:phone.value,message:message.value,consent:cb.checked});showToast('Solicitação enviada ao profissional.');f.remove();}catch(err){showToast(err.message);}};parent.append(f);f.scrollIntoView({behavior:'smooth',block:'nearest'});}
async function showLawyerPanel(){const p=$('#userPanel');p.append(el('h3','','Painel do profissional'));const note=el('p','muted',data.legalRequests?'Abaixo estão exclusivamente as solicitações enviadas a você com autorização do candidato.':'Solicitações desativadas enquanto a estrutura jurídica é revisada. Você pode preparar seu perfil.');p.append(note);const f=el('form','mini');const lang=el('input');lang.placeholder='Idiomas de atendimento';lang.maxLength=100;const desc=el('textarea');desc.placeholder='Descrição factual da sua área de atuação (sem promessas de resultado)';desc.maxLength=450;const b=el('button','btn outline','Salvar perfil');b.type='submit';f.append(el('h3','','Perfil profissional'),lang,desc,b);f.onsubmit=async e=>{e.preventDefault();try{await api('/api/lawyer/profile','POST',{languages:lang.value,description:desc.value});showToast('Perfil atualizado; a publicação requer verificação de registro.');}catch(err){showToast(err.message);}};p.append(f);
  if(!data.legalRequests)return;
  try{const r=await api('/api/requests');p.append(el('h3','',`Solicitações recebidas (${r.requests.length})`));for(const item of r.requests){const c=el('div','request');c.append(el('strong','',item.contact_name),el('p','',item.message),el('div','muted',`E-mail: ${item.contact_email} · Telefone: ${item.contact_phone||'Não informado'} · Status: ${item.status}`));const a=el('a','btn outline','Responder por e-mail');a.href=`mailto:${encodeURIComponent(item.contact_email)}`;c.append(a);const btn=el('button','btn outline','Marcar como contatado');btn.onclick=async()=>{try{await api('/api/requests/status','POST',{request_id:item.id,status:'contacted'});btn.disabled=true;showToast('Solicitação atualizada');}catch(err){showToast(err.message);}};c.append(btn);p.append(c);}}catch(err){showToast(err.message);}}
$('#loginToggle').onclick=()=>data.user?$('#dashboard').scrollIntoView({behavior:'smooth'}):openAuth('login');
$('#signupToggle').onclick=()=>openAuth('signup');$('#heroStart').onclick=()=>$('#vagas').scrollIntoView({behavior:'smooth'});$('#authClose').onclick=()=>$('#authPanel').hidden=true;
$('#authForm').onsubmit=async e=>{e.preventDefault();try{const payload={email:$('#authEmail').value,password:$('#authPass').value};
  const r=data.mode==='signup'?await api('/api/signup','POST',{...payload,name:$('#authName').value,role:$('#authRole').value}):await api('/api/login','POST',payload);
  $('#authPanel').hidden=true;$('#authForm').reset();await refreshMe();$('#dashboard').scrollIntoView({behavior:'smooth'});showToast(data.mode==='signup'?'Conta criada. Adquira seu plano para ativar.':'Login realizado.');
  }catch(err){showToast(err.message);}};
$('#passwordForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/change-password','POST',{current_password:$('#oldPass').value,new_password:$('#newPass').value});showToast('Senha alterada! Entre novamente.');$('#passwordForm').reset();await refreshMe();openAuth('login');}catch(err){showToast(err.message);}};
$('#logout').onclick=async()=>{try{await api('/api/logout','POST',{});await refreshMe();showToast('Você saiu da sua conta.');}catch(err){showToast(err.message);}};
$('#countryFilter').onchange=e=>{data.country=e.target.value;loadJobs(true);};$('#lawyerCountry').onchange=loadLawyers;$('#refreshJobs').onclick=()=>loadJobs(true);$('#moreJobs').onclick=()=>loadJobs(false);
document.querySelectorAll('[data-plan]').forEach(btn=>btn.onclick=()=>{if(!data.user){openAuth('signup',btn.dataset.plan);return;}if(data.user.role!==btn.dataset.plan){showToast('Este plano não corresponde ao tipo da sua conta.');return;}buy();});
(async function init(){await refreshMe();await loadLegal();await loadLawyers();const params=new URLSearchParams(location.search);if(params.get('payment_return')){
  // Nunca ativar só pelo retorno do navegador; consultar InfinitePay através do servidor.
  if(!data.user){showToast('Faça login para verificar seu pagamento com segurança.');openAuth('login');return;}
  if(params.get('transaction_nsu')&&params.get('slug')&&params.get('order_nsu')){
    try{await api('/api/confirm-payment','POST',{order_nsu:params.get('order_nsu'),transaction_nsu:params.get('transaction_nsu'),slug:params.get('slug')});showToast('Pagamento confirmado! Painel liberado.');await refreshMe();$('#dashboard').scrollIntoView();}catch(err){showToast('Pagamento pendente de confirmação: '+err.message);}
  }else showToast('Retorno sem dados suficientes. Consulte o suporte com o número do pedido.');
  history.replaceState({},'',location.pathname);
}})();
