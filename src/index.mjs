import {normalizeEmail,randomToken,hashToken,verifyPassword,getCookie,getUser,sessionCookie,clearSessionCookie,chatCookie} from './security.mjs';

const secureHeaders={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; form-action 'self'",
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-store'
};
const reply=(code,obj,headers={})=>new Response(JSON.stringify(obj),{status:code,headers:{...secureHeaders,'Content-Type':'application/json; charset=utf-8',...headers}});
const error=(code,msg)=>reply(code,{error:msg});
const clean=(v,max=180)=>String(v??'').trim().slice(0,max);
const validEmail=s=>/^\S+@\S+\.\S+$/.test(s)&&s.length<=254;
const staff=u=>u&&['admin','recruiter'].includes(u.role),admin=u=>u?.role==='admin';
const parseSkills=x=>{try{const v=typeof x==='string'?JSON.parse(x||'[]'):x;return Array.isArray(v)?v:[]}catch{return []}};
const cleanSkills=x=>(Array.isArray(x)?x:String(x||'').split(',')).map(v=>clean(v,80)).filter(Boolean).slice(0,30);
const jobRow=j=>({...j,skills:parseSkills(j.skills_json),skills_json:undefined});
const candidateRow=c=>({...c,skills:parseSkills(c.skills_json),skills_json:undefined});
const docRow=d=>({...d,flags:parseSkills(d.flags_json),flags_json:undefined});
const prepared=(db,sql,args)=>args.length?db.prepare(sql).bind(...args):db.prepare(sql);
const rows=async(db,sql,...args)=>(await prepared(db,sql,args).all()).results||[];
const one=async(db,sql,...args)=>prepared(db,sql,args).first();
const run=(db,sql,...args)=>prepared(db,sql,args).run();
const audit=(db,who,what,entity,id)=>run(db,'INSERT INTO audit(actor_id,action,entity,entity_id) VALUES(?,?,?,?)',who||null,what,entity,id||null);
const enabled=e=>e.PUBLIC_APPLICATIONS_ENABLED==='true';
function match(job,c){
 const requested=cleanSkills(parseSkills(job.skills_json)).map(x=>x.toLowerCase());
 const got=new Set(cleanSkills(parseSkills(c.skills_json)).map(x=>x.toLowerCase()));
 const matched=requested.filter(x=>got.has(x)),missing=requested.filter(x=>!got.has(x));
 const score=Math.min(100,(requested.length?Math.round(70*matched.length/requested.length):35)+(Number(c.years)>=Number(job.years_min)?20:Math.round(20*Math.max(0,Number(c.years))/Math.max(1,Number(job.years_min))))+(c.country===job.country||c.country==='Todos'?10:0));
 return {candidate_id:c.id,candidate_name:c.name,score,matched,missing,eligible_for_review:true,explanation:'Pontuação orientativa por regras; requer decisão humana. Não verifica autorização de trabalho.'};
}
async function throttle(db,key,cap,seconds){
 const now=Math.floor(Date.now()/1000),until=now+seconds;
 await run(db,`INSERT INTO request_limits(rate_key,count,window_end) VALUES(?,1,?) ON CONFLICT(rate_key) DO UPDATE SET count=CASE WHEN window_end<? THEN 1 ELSE count+1 END,window_end=CASE WHEN window_end<? THEN excluded.window_end ELSE window_end END`,key,until,now,now);
 const rec=await one(db,'SELECT count FROM request_limits WHERE rate_key=?',key);
 return rec.count<=cap;
}
async function publicLimit(req,db,key,count,seconds){
 const ip=(req.headers.get('CF-Connecting-IP')||'unknown').slice(0,60);
 return throttle(db,`${key}:${await hashToken(ip)}`,count,seconds);
}
const questions=(db,jobId)=>rows(db,'SELECT id,job_id,prompt_pt,prompt_en,prompt_es,options_json,correct_index FROM screening_questions WHERE job_id=? AND active=1 ORDER BY id LIMIT 10',jobId);
const prompts={
 pt:{name:'Olá! Sou o assistente virtual de recrutamento, não uma pessoa. Qual é seu nome completo?',email:'Obrigado! Qual é seu e-mail?',country:'Em qual país você reside?',years:'Quantos anos de experiência profissional? (0 a 70)',skills:'Quais são suas competências? Separe por vírgulas.',done:'Candidatura registrada para revisão humana. Nenhuma decisão final é automática.'},
 en:{name:'Hello! I am an automated recruitment assistant. What is your full name?',email:'What is your email address?',country:'Which country do you live in?',years:'How many years of work experience? (0 to 70)',skills:'List your key skills separated by commas.',done:'Application received for human review. Final decisions are not automated.'},
 es:{name:'¡Hola! Soy un asistente automatizado de reclutamiento. ¿Cuál es tu nombre completo?',email:'¿Cuál es tu correo electrónico?',country:'¿En qué país resides?',years:'¿Cuántos años de experiencia laboral? (0 a 70)',skills:'Indica tus habilidades separadas por comas.',done:'Candidatura recibida para revisión humana. No hay decisiones finales automáticas.'}
};
async function snap(db,s){
 const job=await one(db,'SELECT title,city,country FROM jobs WHERE id=?',s.job_id);
 const lang=prompts[s.language]?s.language:'pt', t=prompts[lang],qs=await questions(db,s.job_id);
 let prompt=t[s.step]||t.done,options=[],input='text';
 if(s.step==='email')input='email';if(s.step==='years')input='number';
 if(s.step==='quiz'){
  const q=qs[s.question_index];if(q){prompt=q[`prompt_${lang}`]||q.prompt_pt;options=parseSkills(q.options_json);input='choice'}else{prompt=t.done;input='none'}
 }
 if(s.step==='completed')input='none';
 return {step:s.step,prompt,options,input,language:lang,job:{title:job?.title||'',country:job?.country||'',city:job?.city||''},position:s.question_index,total_questions:qs.length,completed:s.step==='completed',human_review:true};
}
async function currentChat(req,db){
 const token=getCookie(req,'ramon_chat');if(!/^[0-9a-f]{64}$/.test(token))return null;
 return one(db,"SELECT * FROM chat_sessions WHERE token_hash=? AND updated_at>=datetime('now','-7 days')",await hashToken(token));
}
async function chatbot(req,env,db,u,b,p,url){
 const m=req.method;
 if(m==='POST'&&p==='/api/public/chat/start'){
  if(!enabled(env))return error(503,'Inscrições desativadas neste ambiente');
  if(!await publicLimit(req,db,'chat',100,3600))return error(429,'Limite temporário de requisições');
  const jobId=Number(b.job_id),job=await one(db,"SELECT id FROM jobs WHERE id=? AND status='published'",jobId);
  if(!job)return error(404,'Vaga indisponível');if(b.consent!==true)return error(400,'Aceite do aviso de privacidade obrigatório');
  const lang=['pt','en','es'].includes(b.language)?b.language:'pt';
  const raw=randomToken(),id=crypto.randomUUID();
  await run(db,'INSERT INTO chat_sessions(id,token_hash,job_id,language,step,utm_source,utm_medium,utm_campaign,consent_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',id,await hashToken(raw),jobId,lang,'name',clean(b.utm_source||'organic',70),clean(b.utm_medium||'direct',70),clean(b.utm_campaign||'',120));
  return reply(201,{session:await snap(db,await one(db,'SELECT * FROM chat_sessions WHERE id=?',id))},{'Set-Cookie':chatCookie(raw,7*24*3600)});
 }
 if(m==='GET'&&p==='/api/public/chat/current'){
  const s=await currentChat(req,db);return s?reply(200,{session:await snap(db,s)}):error(404,'Entrevista não encontrada ou expirada');
 }
 if(m==='POST'&&p==='/api/public/chat/message'){
  if(!enabled(env))return error(503,'Inscrições desativadas');
  if(!await publicLimit(req,db,'chat',100,3600))return error(429,'Limite temporário de requisições');
  const s=await currentChat(req,db);if(!s)return error(401,'Sessão expirada');
  if(s.step==='completed')return reply(200,{session:await snap(db,s)});
  const answer=clean(b.answer,700),qs=await questions(db,s.job_id);
  let next=s.step,field='',value=null,extra=null;
  if(s.step==='name'){if(answer.length<3||answer.length>120)return error(400,'Informe o nome completo');field='name';value=answer;next='email'}
  else if(s.step==='email'){value=normalizeEmail(answer);if(!validEmail(value))return error(400,'E-mail inválido');field='email';next='country'}
  else if(s.step==='country'){if(answer.length<2||answer.length>90)return error(400,'Informe seu país');field='country';value=answer;next='years'}
  else if(s.step==='years'){value=Number(answer);if(!Number.isInteger(value)||value<0||value>70)return error(400,'Experiência inválida');field='years';next='skills'}
  else if(s.step==='skills'){
   const skills=cleanSkills(answer.split(','));if(!skills.length)return error(400,'Informe competências');field='skills_json';value=JSON.stringify(skills);next=qs.length?'quiz':'completed';
  }else if(s.step==='quiz'){
   const q=qs[s.question_index];if(!q)return error(409,'Teste foi modificado; contate a equipe');
   const selected=Number(answer),opts=parseSkills(q.options_json);
   if(!Number.isInteger(selected)||selected<0||selected>=opts.length)return error(400,'Opção inválida');
   extra={qid:q.id,selected,correct:selected===q.correct_index?1:0};next=s.question_index+1>=qs.length?'completed':'quiz';
  }else return error(409,'Etapa não reconhecida');
  const updates=[];
  if(field)updates.push(db.prepare(`UPDATE chat_sessions SET ${field}=?,step=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND step=?`).bind(value,next,s.id,s.step));
  else updates.push(db.prepare('INSERT INTO chat_answers(chat_id,question_id,selected_index,is_correct) VALUES(?,?,?,?)').bind(s.id,extra.qid,extra.selected,extra.correct));
  if(extra)updates.push(db.prepare('UPDATE chat_sessions SET question_index=question_index+1,correct_count=correct_count+?,step=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND step=?').bind(extra.correct,next,s.id,s.step));
  // Chat completion creates candidate and application together in a D1 transaction.
  if(next==='completed'){
   const job=await one(db,'SELECT title FROM jobs WHERE id=?',s.job_id);
   const latest={...s,...(field?{[field]:value}:{}),correct_count:s.correct_count+(extra?.correct||0)};
   const review=qs.length&&Math.round(100*latest.correct_count/qs.length)<60?'manual_review':'screening';
   // Transaction: D1 batch commits all or rolls all back on error.
   const token=(await one(db,'SELECT candidate_id FROM chat_sessions WHERE id=?',s.id))?.candidate_id;
   if(token)return reply(200,{session:await snap(db,await one(db,'SELECT * FROM chat_sessions WHERE id=?',s.id))});
   const candidateInsert=db.prepare('INSERT INTO candidates(name,email,phone,target_role,country,years,skills_json,status,source,consent_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(latest.name,latest.email,'',job.title,latest.country,latest.years,latest.skills_json,review,`chat:${s.utm_source}`.slice(0,150),s.consent_at);
   // Instead of relying on mutable last_insert_rowid between requests, a single batch uses SQLite last_insert_rowid() inside transaction.
   const appInsert=db.prepare('INSERT INTO applications(job_id,candidate_id) VALUES(?,last_insert_rowid())').bind(s.job_id);
   // The previous INSERT created an application; this reads its candidate_id atomically.
   const sessionLink=db.prepare("UPDATE chat_sessions SET candidate_id=(SELECT candidate_id FROM applications WHERE id=last_insert_rowid()),step='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND candidate_id IS NULL").bind(s.id);
   await db.batch([...updates,candidateInsert,appInsert,sessionLink]);
  }else await db.batch(updates);
  return reply(200,{session:await snap(db,await one(db,'SELECT * FROM chat_sessions WHERE id=?',s.id))});
 }
 if(m==='GET'&&p==='/api/screening/questions'){
  if(!staff(u))return error(403,'Acesso de equipe necessário');
  const jobId=Number(url.searchParams.get('job_id'));
  if(!await one(db,'SELECT id FROM jobs WHERE id=?',jobId))return error(404,'Vaga não encontrada');
  const items=(await questions(db,jobId)).map(q=>({...q,options:parseSkills(q.options_json),correct_index:admin(u)?q.correct_index:undefined,options_json:undefined}));
  return reply(200,{questions:items});
 }
 if(m==='POST'&&p==='/api/screening/questions'){
  if(!admin(u))return error(403,'Somente admin configura testes técnicos');
  const jobId=Number(b.job_id);if(!await one(db,'SELECT id FROM jobs WHERE id=?',jobId))return error(404,'Vaga não encontrada');
  if((await questions(db,jobId)).length>=10)return error(409,'Limite de 10 perguntas por vaga');
  const pt=clean(b.prompt_pt,400),en=clean(b.prompt_en,400),es=clean(b.prompt_es,400),opts=Array.isArray(b.options)?b.options.map(x=>clean(x,130)):[],correct=Number(b.correct_index);
  if(pt.length<8||opts.length<2||opts.length>5||opts.some(x=>!x)||!Number.isInteger(correct)||correct<0||correct>=opts.length)return error(400,'Teste inválido');
  const r=await run(db,'INSERT INTO screening_questions(job_id,prompt_pt,prompt_en,prompt_es,options_json,correct_index) VALUES(?,?,?,?,?,?)',jobId,pt,en,es,JSON.stringify(opts),correct);
  await audit(db,u.id,'screening_question_created','jobs',jobId);return reply(201,{question_id:r.meta.last_row_id});
 }
 if(m==='GET'&&p==='/api/screening/sessions'){
  if(!staff(u))return error(403,'Acesso de equipe necessário');
  const sessions=await rows(db,`SELECT s.id,s.job_id,s.language,s.step,s.correct_count,s.question_index,s.utm_source,s.utm_campaign,
  s.started_at,s.completed_at,s.candidate_id,j.title job_title,c.name candidate_name,
  (SELECT COUNT(*) FROM chat_answers a WHERE a.chat_id=s.id) answered
  FROM chat_sessions s JOIN jobs j ON j.id=s.job_id LEFT JOIN candidates c ON c.id=s.candidate_id ORDER BY s.started_at DESC LIMIT 100`);
  return reply(200,{sessions});
 }
 return null;
}
async function route(req,env){
 const db=env.DB, url=new URL(req.url),p=url.pathname,m=req.method;
 if(!db)return error(503,'D1 não vinculado. Configure o binding DB.');
 if(m==='GET'&&p==='/api/health'){
  // A static home page works even when D1 has not been migrated. Check the actual schema.
  if(!db?.prepare)return reply(503,{ok:false,service:'Ramon Recruit Cloudflare',database:'binding_missing',message:'Banco de dados nao vinculado'});
  const required=['users','sessions','jobs','candidates','request_limits'];
  try{
   const present=new Set((await rows(db,`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','jobs','candidates','request_limits')`)).map(r=>r.name));
   if(required.some(t=>!present.has(t)))return reply(503,{ok:false,service:'Ramon Recruit Cloudflare',database:'migration_pending',message:'Tabelas do banco ainda nao foram inicializadas'});
   return reply(200,{ok:true,service:'Ramon Recruit Cloudflare',version:'0.4.3',database:'ready',environment:env.APP_ENV||'staging',applications_enabled:enabled(env)});
  }catch(e){console.error('D1 healthcheck failed',e?.name||'Error');return reply(503,{ok:false,service:'Ramon Recruit Cloudflare',database:'unavailable',message:'Banco de dados indisponivel'});}
 }
 if(!['GET','POST','PATCH'].includes(m))return error(405,'Método não permitido');
 let b={};
 if(['POST','PATCH'].includes(m)){
  const origin=req.headers.get('origin');if(origin&&new URL(origin).origin!==url.origin)return error(403,'Origem não permitida');
  if(req.headers.get('x-ramon-client')!=='1')return error(403,'Cabeçalho necessário');
  if(!(req.headers.get('content-type')||'').startsWith('application/json'))return error(415,'Envie JSON');
  if(Number(req.headers.get('content-length')||0)>50000)return error(413,'Corpo muito grande');
  const raw=await req.text();if(raw.length>50000)return error(413,'Corpo muito grande');
  try{b=JSON.parse(raw)}catch{return error(400,'JSON inválido')}
  if(!b||typeof b!=='object'||Array.isArray(b))return error(400,'Objeto JSON obrigatório');
 }
 if(m==='POST'&&p==='/api/login'){
  const email=normalizeEmail(b.email),password=String(b.password||'');
  const key=`login:${await hashToken((req.headers.get('CF-Connecting-IP')||'unknown')+'|'+email)}`;
  if(!await throttle(db,key,8,900))return error(429,'Muitas tentativas de login');
  const user=validEmail(email)?await one(db,'SELECT * FROM users WHERE email=? AND active=1',email):null;
  if(!user||!await verifyPassword(password,user.password_hash))return error(401,'E-mail ou senha inválidos');
  const token=randomToken();await run(db,'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',await hashToken(token),user.id,Date.now()+12*60*60*1000);
  await audit(db,user.id,'logged_in','users',user.id);
  return reply(200,{ok:true,user:{id:user.id,email:user.email,name:user.name,role:user.role}},{'Set-Cookie':sessionCookie(token)});
 }
 const u=await getUser(req,db);
 if(m==='GET'&&p==='/api/me')return u?reply(200,{user:u}):error(401,'Login necessário');
 if(m==='POST'&&p==='/api/logout'){
  const raw=getCookie(req,'ramon_session');if(/^[0-9a-f]{64}$/.test(raw))await run(db,'DELETE FROM sessions WHERE token_hash=?',await hashToken(raw));
  return reply(200,{ok:true},{'Set-Cookie':clearSessionCookie()});
 }
 if(m==='GET'&&p==='/api/public/jobs')return reply(200,{jobs:(await rows(db,"SELECT id,title,country,city,slots,years_min,skills_json,description,status,created_at FROM jobs WHERE status='published' ORDER BY id DESC LIMIT 200")).map(jobRow)});
 if(m==='POST'&&p==='/api/public/apply'){
  if(!enabled(env))return error(503,'Inscrições desativadas neste ambiente');
  if(!await publicLimit(req,db,'apply',20,3600))return error(429,'Limite temporário de inscrições');
  const jobId=Number(b.job_id),job=await one(db,"SELECT id FROM jobs WHERE id=? AND status='published'",jobId);
  if(!job)return error(404,'Vaga indisponível');
  const name=clean(b.name,120),email=normalizeEmail(b.email),target=clean(b.target_role,120),country=clean(b.country,90),years=Number(b.years)||0;
  if(name.length<3||!validEmail(email)||target.length<2||country.length<2||!Number.isInteger(years)||years<0||years>70||b.consent!==true)return error(400,'Verifique os campos e o aceite');
  const r=await db.batch([
   db.prepare('INSERT INTO candidates(name,email,phone,target_role,country,years,skills_json,source,consent_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').bind(name,email,clean(b.phone,35),target,country,years,JSON.stringify(cleanSkills(b.skills)),'portal'),
   db.prepare('INSERT INTO applications(job_id,candidate_id) VALUES(?,last_insert_rowid())').bind(jobId)
  ]);
  await audit(db,null,'candidate_applied','jobs',jobId);
  return reply(201,{ok:true,message:'Candidatura registrada para análise humana.'});
 }
 const chatResponse=await chatbot(req,env,db,u,b,p,url);if(chatResponse)return chatResponse;
 if(!u)return error(401,'Login necessário');
 if(m==='GET'&&p==='/api/jobs'&&staff(u))return reply(200,{jobs:(await rows(db,'SELECT * FROM jobs ORDER BY id DESC LIMIT 1000')).map(jobRow)});
 if(m==='POST'&&p==='/api/jobs'){
  if(!admin(u))return error(403,'Somente o administrador pode cadastrar vagas');
  const title=clean(b.title,150),country=clean(b.country,90),city=clean(b.city,90),desc=clean(b.description,5000),slots=Number(b.slots)||1,years=Number(b.years_min)||0;
  if(title.length<3||country.length<2||!Number.isInteger(slots)||slots<1||slots>100000||!Number.isInteger(years)||years<0||years>60)return error(400,'Dados inválidos');
  const status=['draft','published'].includes(b.status)?b.status:'draft';
  const result=await run(db,'INSERT INTO jobs(title,country,city,slots,years_min,skills_json,description,status,created_by) VALUES(?,?,?,?,?,?,?,?,?)',title,country,city,slots,years,JSON.stringify(cleanSkills(b.skills)),desc,status,u.id);
  await audit(db,u.id,'job_created','jobs',result.meta.last_row_id);return reply(201,{job_id:result.meta.last_row_id});
 }
 const jobMatch=p.match(/^\/api\/jobs\/(\d+)$/);
 if(m==='PATCH'&&jobMatch){
  if(!admin(u))return error(403,'Somente administrador pode editar vagas');
  const id=Number(jobMatch[1]),old=await one(db,'SELECT * FROM jobs WHERE id=?',id);if(!old)return error(404,'Vaga não encontrada');
  const title=clean(b.title??old.title,150),country=clean(b.country??old.country,90),city=clean(b.city??old.city,90),desc=clean(b.description??old.description,5000),slots=Number(b.slots??old.slots),years=Number(b.years_min??old.years_min),status=b.status??old.status;
  if(title.length<3||country.length<2||!['draft','published','closed'].includes(status)||!Number.isInteger(slots)||slots<1||slots>100000||!Number.isInteger(years)||years<0||years>60)return error(400,'Dados inválidos');
  await run(db,'UPDATE jobs SET title=?,country=?,city=?,description=?,slots=?,years_min=?,skills_json=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',title,country,city,desc,slots,years,JSON.stringify(b.skills===undefined?parseSkills(old.skills_json):cleanSkills(b.skills)),status,id);
  await audit(db,u.id,'job_updated','jobs',id);return reply(200,{ok:true});
 }
 if(m==='GET'&&p==='/api/candidates'&&staff(u))return reply(200,{candidates:(await rows(db,'SELECT * FROM candidates ORDER BY id DESC LIMIT 2000')).map(candidateRow)});
 if(m==='POST'&&p==='/api/candidates'&&staff(u)){
  const name=clean(b.name,120),target=clean(b.target_role,120),country=clean(b.country,90),email=normalizeEmail(b.email),years=Number(b.years)||0;
  if(name.length<3||target.length<2||country.length<2||(email&&!validEmail(email))||!Number.isInteger(years)||years<0||years>70)return error(400,'Dados inválidos');
  const r=await run(db,'INSERT INTO candidates(name,email,phone,target_role,country,years,skills_json,source) VALUES(?,?,?,?,?,?,?,?)',name,email,clean(b.phone,35),target,country,years,JSON.stringify(cleanSkills(b.skills)),'manual');
  await audit(db,u.id,'candidate_created','candidates',r.meta.last_row_id);return reply(201,{candidate_id:r.meta.last_row_id});
 }
 const candMatch=p.match(/^\/api\/candidates\/(\d+)$/);
 if(m==='PATCH'&&candMatch&&staff(u)){
  const id=Number(candMatch[1]),old=await one(db,'SELECT id FROM candidates WHERE id=?',id);if(!old)return error(404,'Candidato não encontrado');
  const status=b.status;if(!['new','screening','qualified','interview','manual_review','hired','archived'].includes(status))return error(400,'Status inválido');
  await run(db,'UPDATE candidates SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',status,id);await audit(db,u.id,'candidate_status','candidates',id);return reply(200,{ok:true});
 }
 if(m==='GET'&&p==='/api/matches'&&staff(u)){
  const id=Number(url.searchParams.get('job_id')),job=await one(db,'SELECT * FROM jobs WHERE id=?',id);if(!job)return error(404,'Vaga não encontrada');
  const results=(await rows(db,"SELECT * FROM candidates WHERE status NOT IN ('archived') ORDER BY id DESC LIMIT 2000")).map(c=>match(job,c)).sort((a,b)=>b.score-a.score).slice(0,100);
  return reply(200,{job:jobRow(job),matches:results,method:'rules-v0.4',disclaimer:'Compatibilidade orientativa; decisão humana e verificação legal continuam necessárias.'});
 }
 if(m==='GET'&&p==='/api/documents'&&staff(u))return reply(200,{documents:(await rows(db,'SELECT d.*,c.name candidate_name FROM documents d JOIN candidates c ON c.id=d.candidate_id ORDER BY d.id DESC LIMIT 1000')).map(docRow)});
 if(m==='POST'&&p==='/api/documents'&&staff(u)){
  const cid=Number(b.candidate_id);if(!await one(db,'SELECT id FROM candidates WHERE id=?',cid))return error(404,'Candidato não encontrado');
  const typ=b.doc_type,expires=b.expires_on?String(b.expires_on):null;if(!['passport','id','other'].includes(typ)||(expires&&!/^\d{4}-\d{2}-\d{2}$/.test(expires)))return error(400,'Documento inválido');
  const flags=[];if(expires&&expires<new Date().toISOString().slice(0,10))flags.push('Validade expirada (revisão humana)');
  const result=await run(db,'INSERT INTO documents(candidate_id,doc_type,expires_on,flags_json) VALUES(?,?,?,?)',cid,typ,expires,JSON.stringify(flags));
  await audit(db,u.id,'document_metadata_created','documents',result.meta.last_row_id);return reply(201,{document_id:result.meta.last_row_id,flags});
 }
 const docMatch=p.match(/^\/api\/documents\/(\d+)$/);
 if(m==='PATCH'&&docMatch&&staff(u)){
  const id=Number(docMatch[1]);if(!await one(db,'SELECT id FROM documents WHERE id=?',id))return error(404,'Documento inexistente');
  if(!['pending','review','verified','rejected'].includes(b.review_status))return error(400,'Status inválido');
  await run(db,'UPDATE documents SET review_status=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',b.review_status,clean(b.review_note,600),id);await audit(db,u.id,'document_reviewed','documents',id);return reply(200,{ok:true});
 }
 if(m==='GET'&&p==='/api/stats'&&staff(u)){
  const count=async sql=>Number((await one(db,sql))?.total||0);
  const stages=await rows(db,'SELECT status,COUNT(*) count FROM candidates GROUP BY status');
  return reply(200,{candidates:await count('SELECT COUNT(*) total FROM candidates'),active_jobs:await count("SELECT COUNT(*) total FROM jobs WHERE status='published'"),documents_to_review:await count("SELECT COUNT(*) total FROM documents WHERE review_status IN ('pending','review')"),applications:await count('SELECT COUNT(*) total FROM applications'),stages});
 }
 if(m==='GET'&&p==='/api/whatsapp/status'&&staff(u))return reply(200,{connected:false,provider:'WhatsApp Cloud API',status:'not_configured',detail:'Canal opcional, ainda não integrado.'});
 if(m==='GET'&&p==='/api/users'&&admin(u))return reply(200,{users:await rows(db,'SELECT id,name,email,role,active,created_at FROM users ORDER BY id')});
 if(m==='GET'&&p==='/api/audit'&&admin(u))return reply(200,{events:await rows(db,'SELECT id,actor_id,action,entity,entity_id,at FROM audit ORDER BY id DESC LIMIT 100')});
 return error(404,'Recurso inexistente ou acesso não permitido');
}
export default {
 async fetch(req,env){
  try{
   const path=new URL(req.url).pathname;
   if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
   return await route(req,env);
  }catch(e){
   // A missing migration is a setup issue, not a bad password; report this safely.
   console.error('Ramon Worker error',e?.name||'Error');
   if(/no such table|SQLITE_ERROR.*table/i.test(String(e?.message||'')))return error(503,'Banco nao inicializado. Administrador: aplique as migracoes D1 remotas.');
   return error(500,'Erro interno');
  }
 }
};
