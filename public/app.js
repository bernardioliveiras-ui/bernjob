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
    $('#accountInfo').textContent=`${data.user.email} · ${data.user.role==='lawyer'?'Profissional jurídico':data.user.role==='candidate'?'Candidato':data.user.role==='company'?'Empresa':'Administrador'}`;
    $('#passwordBox').hidden=false;
    $('#accessArea').replaceChildren();
    if(data.user.must_change_password){$('#accessArea').append(el('div','status','Você precisa trocar a senha provisória para continuar.'));}
    else if(!data.user.active){const msg=el('div','status',`Seu acesso não está ativo. Adquira ${data.user.role==='lawyer'?'o plano jurídico (R$ 29,90)':data.user.role==='company'?'o plano empresa (R$ 129,90)':'o plano candidato (R$ 9,90)'} para liberar seu painel.`);$('#accessArea').append(msg);}
    else {$('#accessArea').append(el('div','status green',`Acesso ativo até: ${new Date(data.user.access_until.replace(' ','T')+'Z').toLocaleDateString('pt-BR')}`));}
    if(data.user.role!=='admin'&&!data.user.must_change_password){const b=el('button','btn accent',data.user.active?'Renovar plano (mais 30 dias)':'Comprar acesso (30 dias)');b.onclick=buy;$('#accessArea').append(b);}
    $('#loginToggle').textContent='Meu painel';$('#userPanel').replaceChildren();
    if(data.user.role==='lawyer'&&data.user.active&&!data.user.must_change_password) showLawyerPanel();
    if(data.user.role==='company'&&data.user.active&&!data.user.must_change_password) showCompanyPanel();
    if(data.user.role==='candidate'&&!data.user.must_change_password) showCandidateApplications();
  } else {$('#loginToggle').textContent='Entrar';$('#userPanel').replaceChildren();}
}
async function refreshMe() {try{loginState(await api('/api/me'));}catch{loginState(null);} await loadJobs(true);}
async function buy(){if(!data.user){openAuth('signup');return;}if(data.user.must_change_password){showToast('Altere sua senha provisória antes de pagar.');return;}
  try{const x=await api('/api/checkout','POST',{});window.location.assign(x.checkout_url);}catch(err){showToast(err.message);}}
async function loadJobs(reset=false){
  if(reset){data.offset=0;clear($('#jobList')); await loadCompanyJobs();}
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
async function loadCompanyJobs() {
  const container=$('#companyJobList');clear(container);
  try {const res=await api('/api/company/jobs/public'+(data.country?'?country='+data.country:''));
    if(!res.jobs.length){container.append(el('div','muted','Ainda não há vagas próprias de empresas verificadas neste filtro.'));return;}
    for(const j of res.jobs){const card=el('article','job company-job');card.append(el('div','muted',j.employer),el('h3','',j.title),el('div','job-meta',`${flag(j.country)} ${countryName(j.country)} · ${j.city||'Cidade não informada'}`));
      if(j.image_url){const pic=el('img','job-image');pic.src=j.image_url;pic.alt=`Imagem da vaga ${j.title}`;pic.referrerPolicy='no-referrer';pic.loading='lazy';card.append(pic);}
      card.append(el('p','',j.description),el('strong','','Requisitos'),el('p','',j.requirements));
      if(j.salary)card.append(el('div','muted','Remuneração publicada: '+j.salary));
      if(j.document_support)card.append(el('p','muted','Informação da empresa sobre documentação: '+j.document_support));
      if(data.user?.role==='candidate'&&!data.user.must_change_password){const b=el('button','btn accent','Candidatar-me à empresa');b.onclick=()=>companyApplyForm(card,j);card.append(b);}
      else card.append(el('div','status','Para se candidatar gratuitamente a esta vaga da empresa, crie sua conta de candidato. A assinatura é para ferramentas adicionais.'));
      container.append(card);
    }
  }catch(err){container.append(el('p','muted','Não foi possível carregar as vagas publicadas pelas empresas.'));}
}
function companyApplyForm(card,job){
  if(card.querySelector('.listing-form')) return;
  const f=el('form','mini listing-form');f.append(el('h3','',`Candidatura: ${job.title}`));
  const msg=el('textarea');msg.placeholder='Apresente seu perfil profissional, formação e experiência relevante.';msg.minLength=15;msg.maxLength=1000;msg.required=true;
  const consent=el('label');const check=el('input');check.type='checkbox';check.required=true;consent.append(check,el('span','',' Autorizo enviar meu nome, e-mail e mensagem apenas à empresa anunciante desta vaga para processamento desta candidatura.'));
  const btn=el('button','btn accent','Enviar candidatura');btn.type='submit';
  f.append(msg,consent,btn);f.onsubmit=async e=>{e.preventDefault();try{await api('/api/company/apply','POST',{job_id:job.id,message:msg.value,consent:check.checked});showToast('Candidatura enviada ao empregador.');f.remove();}catch(err){showToast(err.message);}};
  card.append(f);
}
function messageThread(parent,applicationId){
  const old=parent.querySelector('.thread');if(old){old.remove();return;}
  const wrapper=el('div','thread');parent.append(wrapper);const reload=async()=>{
    const resp=await api('/api/company/messages?application_id='+encodeURIComponent(applicationId));
    const old=wrapper.querySelector('.message-items');if(old)old.remove();
    const list=el('div','message-items');for(const m of resp.messages){list.append(el('div','thread-item',`${m.sender_id===data.user.id?'Você':'Outra parte'} · ${m.created_at}
${m.content}`));}wrapper.prepend(list);
  }; const form=el('form','mini');const input=el('textarea');input.maxLength=1500;input.placeholder='Escreva uma mensagem ao candidato ou empregador';const b=el('button','btn outline','Enviar mensagem');b.type='submit';form.append(input,b);form.onsubmit=async e=>{e.preventDefault();try{await api('/api/company/messages','POST',{application_id:applicationId,content:input.value});input.value='';await reload();}catch(err){showToast(err.message);}};wrapper.append(form);reload().catch(err=>showToast(err.message));
}
async function showCandidateApplications(){
  const root=$('#userPanel');root.append(el('h3','','Minhas candidaturas diretas'));
  try{const r=await api('/api/company/my-applications');if(!r.applications.length){root.append(el('p','muted','Você ainda não enviou candidaturas para empresas da plataforma.'));return;}
    for(const a of r.applications){const c=el('div','company-app');c.append(el('strong','',`${a.title} · ${a.employer}`),el('p','muted',`Enviada em ${a.created_at} · ${a.status}`));const b=el('button','btn outline','Mensagens');b.onclick=()=>messageThread(c,a.id);c.append(b);root.append(c);}
  }catch(err){showToast(err.message);}
}
async function showCompanyPanel(){
  const root=$('#userPanel');root.append(el('h3','','Painel da empresa'));
  root.append(el('p','muted','Seu perfil e suas vagas precisam de aprovação. Apenas candidatos que se inscreveram em uma vaga sua aparecerão nas candidaturas.'));
  try{const r=await api('/api/company/profile');const f=el('form','mini listing-form');f.append(el('h3','','Dados da empresa'));
    const legal=el('input');legal.placeholder='Razão social ou nome empresarial';legal.required=true;legal.value=r.profile?.legal_name||'';
    const site=el('input');site.type='url';site.placeholder='https://site-da-empresa.com';site.value=r.profile?.website||'';
    const logo=el('input');logo.type='url';logo.placeholder='https://site-da-empresa.com/logo.jpg';logo.value=r.profile?.logo_url||'';
    const about=el('textarea');about.placeholder='Descrição da empresa';about.value=r.profile?.description||'';
    const b=el('button','btn outline','Salvar e solicitar verificação');b.type='submit';
    f.append(legal,site,logo,about,b);f.onsubmit=async e=>{e.preventDefault();try{const x=await api('/api/company/profile','POST',{legal_name:legal.value,website:site.value,logo_url:logo.value,description:about.value});showToast(x.notice);}catch(err){showToast(err.message);}};root.append(f);
    root.append(el('div','status',r.profile?.verified?'Empresa verificada. As novas vagas ainda precisam de revisão.':'Empresa aguardando verificação administrativa.'));
  }catch(err){showToast(err.message);}
  const f=el('form','mini listing-form');f.append(el('h3','','Publicar uma vaga'));
  const title=el('input');title.placeholder='Título da vaga';title.required=true;title.maxLength=180;
  const country=el('select');country.required=true;for(const [val,name] of [['PT','Portugal'],['DE','Alemanha'],['IE','Irlanda']]){const option=el('option','',name);option.value=val;country.append(option);}
  const city=el('input');city.placeholder='Cidade';city.maxLength=150;
  const desc=el('textarea');desc.placeholder='Descrição completa da função';desc.required=true;desc.minLength=35;
  const requirements=el('textarea');requirements.placeholder='Formação, requisitos para contratação, experiência e idiomas';requirements.required=true;requirements.minLength=15;
  const pay=el('input');pay.placeholder='Salário, se divulgado';pay.maxLength=130;
  const image=el('input');image.type='url';image.placeholder='Link HTTPS de imagem da vaga (opcional)';image.maxLength=700;
  const documents=el('textarea');documents.placeholder='Documentos que a empresa pode fornecer ao candidato (se confirmado)';documents.maxLength=900;
  const send=el('button','btn accent','Enviar vaga para revisão');send.type='submit';
  f.append(title,country,city,desc,requirements,pay,image,documents,send);
  f.onsubmit=async e=>{e.preventDefault();try{const r=await api('/api/company/jobs','POST',{title:title.value,country:country.value,city:city.value,description:desc.value,requirements:requirements.value,salary:pay.value,image_url:image.value,document_support:documents.value});showToast(r.notice);f.reset();await loadCompanyOwnJobs(root,true);}catch(err){showToast(err.message);}};
  root.append(f);const list=el('section','company-own-jobs');root.append(list);await loadCompanyOwnJobs(root,false);
  root.append(el('h3','','Candidaturas recebidas'));
  try{const res=await api('/api/company/applications');if(!res.applications.length)root.append(el('p','muted','Nenhuma candidatura recebida ainda.'));
    for(const a of res.applications){const c=el('div','company-app');c.append(el('strong','',`${a.job_title} · ${a.contact_name}`),el('p','',a.message),el('p','muted',`E-mail disponibilizado voluntariamente: ${a.contact_email}`));const b=el('button','btn outline','Conversar com candidato');b.onclick=()=>messageThread(c,a.id);c.append(b);root.append(c);}
  }catch(err){showToast(err.message);}
}
async function loadCompanyOwnJobs(root,reset){const list=root.querySelector('.company-own-jobs');if(!list)return;clear(list);
  const result=await api('/api/company/jobs');list.append(el('h3','','Minhas vagas'));
  for(const j of result.jobs)list.append(el('p','muted',`${j.title} · ${countryName(j.country)} · Situação: ${j.status}`));
  if(!result.jobs.length)list.append(el('p','muted','Nenhuma vaga enviada ainda.'));
}
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
