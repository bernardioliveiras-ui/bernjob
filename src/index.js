import {runJobBot} from './jobbot.js';

const encoder = new TextEncoder();
const cookieName = 'bern_session';
const prices = {candidate:990,lawyer:2990,company:12990};
const legalInfo = {
  PT: {country:'Portugal',note:'Documentos e visto dependem do contrato, modalidade e consulado; confira sempre o procedimento atualizado.', links:[{label:'IEFP — vagas para cidadãos de países terceiros',url:'https://iefponline.iefp.pt/IEFP/ofertas/emprego/recrutamento-internacional/estados-terceiros.jsp'},{label:'AIMA — imigração e residência',url:'https://aima.gov.pt/'}]},
  DE: {country:'Alemanha',note:'Para determinadas profissões há exigências de qualificação e reconhecimento; oferta de emprego não significa aprovação migratória.',links:[{label:'Make it in Germany — portal oficial',url:'https://www.make-it-in-germany.com/en/'},{label:'Anabin — reconhecimento de diplomas',url:'https://anabin.kmk.org/anabin.html'}]},
  IE: {country:'Irlanda',note:'Verifique se a ocupação e o empregador atendem à categoria de autorização de trabalho; visto e employment permit são etapas distintas.',links:[{label:'Employment Permits — site oficial',url:'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/'},{label:'Immigration Service Delivery',url:'https://www.irishimmigration.ie/'}]}
};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const fail=(msg,status=400)=>json({error:msg},status);
const uid=()=>crypto.randomUUID();
const shaHex=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
const b64=bytes=>btoa(String.fromCharCode(...bytes));
async function passwordHash(password) {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},material,256);
  return `pbkdf2-sha256$210000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function verifyPassword(password,stored) {
  const [alg,iter,salt64,digest64]=String(stored||'').split('$');
  if (alg!=='pbkdf2-sha256'||!iter||!salt64||!digest64) return false;
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const salt=Uint8Array.from(atob(salt64),c=>c.charCodeAt(0));
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:Number(iter),hash:'SHA-256'},material,256));
  const expected=Uint8Array.from(atob(digest64),c=>c.charCodeAt(0));
  if (derived.length!==expected.length) return false;
  let different=0;for (let i=0;i<derived.length;i++) different|=derived[i]^expected[i];
  return different===0;
}
const validPassword = p=>typeof p==='string' && p.length>=12 && p.length<=128;
function cookies(req) {const all=req.headers.get('Cookie')||'';return Object.fromEntries(all.split(';').map(p=>p.trim().split('=').slice(0,2)).filter(p=>p.length===2));}
function sessionCookie(token,request,expire=false) {
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return `${cookieName}=${expire?'':token}; HttpOnly; Path=/; SameSite=Lax${secure}; Max-Age=${expire?0:604800}`;
}
async function createSession(db,userId,request) {
  const token=b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const digest=await shaHex(token);
  await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(digest,userId).run();
  return sessionCookie(token,request);
}
async function currentUser(req,db) {
  const token=cookies(req)[cookieName];
  if (!token) return null;
  const digest=await shaHex(token);
  return await db.prepare("SELECT u.id,u.name,u.email,u.role,u.force_password_change,u.access_until FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')").bind(digest).first();
}
function active(u) {return !!(u && (u.role==='admin'||(u.access_until && Date.parse(u.access_until.replace(' ','T')+'Z')>Date.now())));}
function userResponse(u) {return {id:u.id,name:u.name,email:u.email,role:u.role,access_until:u.access_until,active:active(u),must_change_password:!!u.force_password_change};}
function safeHttps(value) {
  if(!value) return null;
  try {const u=new URL(String(value));if(u.protocol!=='https:'||u.username||u.password||u.href.length>700)return null;return u.href;}catch{return null;}
}
async function allowedApplication(db,me,id) {
  if(me.role==='candidate') return db.prepare('SELECT id FROM company_applications WHERE id=? AND candidate_id=?').bind(id,me.id).first();
  if(me.role==='company') return db.prepare('SELECT a.id FROM company_applications a JOIN company_jobs j ON j.id=a.job_id WHERE a.id=? AND j.company_id=?').bind(id,me.id).first();
  return null;
}
async function body(req) {try{return await req.json();}catch{throw new Error('JSON inválido');}}
function safeString(value,max=200) {return String(value??'').trim().slice(0,max);}
async function requireAdminKey(req,env) {
  const key=req.headers.get('X-Admin-Key');
  if (!env.ADMIN_KEY || !key || key.length!==env.ADMIN_KEY.length) return false;
  const a=encoder.encode(key),b=encoder.encode(env.ADMIN_KEY); let diff=0;for(let i=0;i<a.length;i++) diff|=a[i]^b[i];return diff===0;
}
async function checkoutLink(env,order,user,origin) {
  if (!env.INFINITEPAY_API_KEY) throw new Error('Configure INFINITEPAY_API_KEY como segredo no Worker');
  const payload={order_nsu:order.id,redirect_url:`${origin}/?payment_return=1&order_nsu=${encodeURIComponent(order.id)}`,
    items:[{quantity:1,price:order.expected_amount,description:order.plan==='candidate'?'Bern Global — candidato 30 dias':order.plan==='lawyer'?'Bern Global — profissional jurídico 30 dias':'Bern Global — empresa 30 dias'}],
    customer:{name:user.name,email:user.email},options:{single_payment:true}};
  if (env.INFINITEPAY_HANDLE) payload.handle=env.INFINITEPAY_HANDLE;
  const r=await fetch('https://api.checkout.infinitepay.io/links',{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':env.INFINITEPAY_API_KEY},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw new Error(`Checkout indisponível (${r.status})`);
  const data=await r.json();
  const link=data.url||data.checkout_url||data.link_url||data.link?.url||data.data?.url;
  if(!link||!/^https:\/\//.test(link)) throw new Error('InfinitePay não retornou URL válida de checkout');
  return link;
}
async function verifyOrder(env,order,details) {
  const {slug,transaction_nsu}=details;
  if(!/^[\w-]{1,180}$/.test(String(slug||'')) || !/^[\w-]{1,180}$/.test(String(transaction_nsu||''))) throw new Error('Dados do checkout ausentes');
  if(!env.INFINITEPAY_API_KEY) throw new Error('Checkout ainda não configurado');
  const r=await fetch('https://api.checkout.infinitepay.io/payment_check',{method:'POST',headers:{'X-Api-Key':env.INFINITEPAY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({handle:env.INFINITEPAY_HANDLE||'',order_nsu:order.id,transaction_nsu,slug}),signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw new Error('Pagamento não confirmado pela InfinitePay');
  const result=await r.json();
  // O valor esperado deve bater exatamente. paid_amount pode refletir acréscimos e não substitui amount.
  if(result.paid!==true || result.success===false || Number(result.amount)!==Number(order.expected_amount)) return false;
  return true;
}
async function activatePaidOrder(db,order,details) {
  // O batch é transacional no D1: repetir a confirmação não acrescenta outros 30 dias.
  await db.batch([
    db.prepare("UPDATE orders SET status='paid',transaction_nsu=?,invoice_slug=? WHERE id=? AND status='pending'")
      .bind(details.transaction_nsu,details.slug,order.id),
    db.prepare(`UPDATE users SET access_until=datetime(MAX(COALESCE(access_until,'1970-01-01'),datetime('now')),'+30 days')
      WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='paid' AND activated_at IS NULL)`)
      .bind(order.user_id,order.id),
    db.prepare("UPDATE orders SET activated_at=datetime('now') WHERE id=? AND status='paid' AND activated_at IS NULL").bind(order.id)
  ]);
}
async function handleApi(req,env,url) {
  const db=env.DB;
  if (!db) return fail('Banco D1 não configurado',503);
  const path=url.pathname,method=req.method;
  if (method!=='GET' && method!=='HEAD') {
    const origin=req.headers.get('Origin');
    if (origin && origin!==url.origin) return fail('Origem não permitida',403);
    if (!origin && !path.startsWith('/api/admin/')) return fail('Origem obrigatória em requisições de escrita',403);
  }
  if(path==='/api/health'&&method==='GET') return json({ok:true,service:'bern-global',version:'0.2.0'});
  if(path==='/api/legal'&&method==='GET') return json(legalInfo);
  if(path==='/api/signup'&&method==='POST') {
    const p=await body(req),email=safeString(p.email,240).toLowerCase(),role=p.role;
    if(!/^\S+@\S+\.\S+$/.test(email)||!['candidate','lawyer','company'].includes(role)||!validPassword(p.password)||!safeString(p.name,100)) return fail('Confira nome, e-mail, perfil e senha (mínimo 12 caracteres)');
    const id=uid();
    await db.prepare('INSERT INTO users(id,name,email,role,password_hash) VALUES(?,?,?,?,?)').bind(id,safeString(p.name,100),email,role,await passwordHash(p.password)).run();
    if(role==='lawyer') await db.prepare('INSERT INTO lawyer_profiles(user_id) VALUES(?)').bind(id).run();
    if(role==='company') await db.prepare('INSERT INTO company_profiles(user_id) VALUES(?)').bind(id).run();
    return json({ok:true,message:'Conta criada; contrate o plano para ativar o acesso'},201,{'Set-Cookie':await createSession(db,id,req)});
  }
  if(path==='/api/login'&&method==='POST') {
    const p=await body(req),email=safeString(p.email,240).toLowerCase(),password=String(p.password||'');
    const identity=(req.headers.get('CF-Connecting-IP')||'local').slice(0,70)+':'+email;
    const tries=await db.prepare("SELECT attempts FROM login_attempts WHERE identity=? AND reset_at>datetime('now')").bind(identity).first();
    if(tries?.attempts>=8) return fail('Muitas tentativas. Tente novamente em 15 minutos',429);
    const u=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    const accepted=u && await verifyPassword(password,u.password_hash);
    if(!accepted) {
      await db.prepare("INSERT INTO login_attempts(identity,attempts,reset_at) VALUES(?,1,datetime('now','+15 minutes')) ON CONFLICT(identity) DO UPDATE SET attempts=CASE WHEN reset_at<datetime('now') THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<datetime('now') THEN datetime('now','+15 minutes') ELSE reset_at END").bind(identity).run();
      return fail('Credenciais inválidas',401);
    }
    await db.prepare('DELETE FROM login_attempts WHERE identity=?').bind(identity).run();
    return json({ok:true,user:userResponse(u)},200,{'Set-Cookie':await createSession(db,u.id,req)});
  }
  if(path==='/api/logout'&&method==='POST') {
    const token=cookies(req)[cookieName];
    if(token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await shaHex(token)).run();
    return json({ok:true},200,{'Set-Cookie':sessionCookie('',req,true)});
  }
  if(path.startsWith('/api/admin/')) {
    if(!await requireAdminKey(req,env)) return fail('Chave administrativa inválida',403);
    if(path==='/api/admin/provision'&&method==='POST') {
      const p=await body(req),role=p.role,email=safeString(p.email,240).toLowerCase();
      if(!['candidate','lawyer','company','admin'].includes(role)||!/^\S+@\S+\.\S+$/.test(email)||!validPassword(p.password)) return fail('Dados inválidos (senha com no mínimo 12 caracteres)');
      const existing=await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
      if(existing) return fail('E-mail já cadastrado',409);
      const id=uid();
      await db.prepare('INSERT INTO users(id,name,email,role,password_hash,force_password_change) VALUES(?,?,?,?,?,1)')
        .bind(id,safeString(p.name,100)||email,email,role,await passwordHash(p.password)).run();
      if(role==='lawyer') await db.prepare('INSERT INTO lawyer_profiles(user_id) VALUES(?)').bind(id).run();
    if(role==='company') await db.prepare('INSERT INTO company_profiles(user_id) VALUES(?)').bind(id).run();
      return json({id,email,role,must_change_password:true},201);
    }
    if(path==='/api/admin/reset-password'&&method==='POST') {
      const p=await body(req),email=safeString(p.email,240).toLowerCase();
      if(!/^\S+@\S+\.\S+$/.test(email)||!validPassword(p.password)) return fail('E-mail ou senha inválidos');
      const user=await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
      if(!user) return fail('Usuário não localizado',404);
      await db.batch([
        db.prepare('UPDATE users SET password_hash=?,force_password_change=1 WHERE id=?').bind(await passwordHash(p.password),user.id),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
      ]);
      return json({ok:true,must_change_password:true});
    }
    if(path==='/api/admin/company/verify'&&method==='POST') {
      const p=await body(req);
      const r=await db.prepare('UPDATE company_profiles SET verified=? WHERE user_id=?').bind(p.verified===true?1:0,safeString(p.user_id,70)).run();
      return json({ok:r.meta.changes>0});
    }
    if(path==='/api/admin/company/jobs/moderate'&&method==='POST') {
      const p=await body(req);if(!['published','rejected','closed'].includes(p.status))return fail('Status inválido');
      const r=await db.prepare(`UPDATE company_jobs SET status=?,updated_at=datetime('now') WHERE id=? AND (
        ?!='published' OR EXISTS(SELECT 1 FROM company_profiles cp JOIN users u ON u.id=cp.user_id WHERE cp.user_id=company_jobs.company_id AND cp.verified=1 AND u.access_until>datetime('now'))
      )`).bind(p.status,safeString(p.job_id,70),p.status).run();
      return json({ok:r.meta.changes>0});
    }
    if(path==='/api/admin/add-source'&&method==='POST') {
      const p=await body(req);const slug=safeString(p.board_slug,70),provider=p.provider;
      if(!['greenhouse','lever','ashby'].includes(provider)||!/^[\w-]{1,70}$/.test(slug)||!safeString(p.employer,120)) return fail('Provedor/slug/empresa inválidos');
      if(p.terms_reviewed!==true) return fail('Revise as condições de uso da fonte antes de habilitar');
      await db.prepare('INSERT INTO job_sources(id,provider,board_slug,employer,country_scope,enabled,terms_reviewed) VALUES(?,?,?,?,?,1,1) ON CONFLICT(provider,board_slug) DO UPDATE SET employer=excluded.employer,enabled=1,terms_reviewed=1')
        .bind(uid(),provider,slug,safeString(p.employer,120),'MULTI').run();
      return json({ok:true});
    }
    if(path==='/api/admin/jobbot/run'&&method==='POST') return json({results:await runJobBot(env)});
    if(path==='/api/admin/stats'&&method==='GET') {
      const [jobs,sources,users,requests,runs]=await Promise.all([
        db.prepare('SELECT country,international_status,COUNT(*) AS total FROM jobs WHERE is_active=1 GROUP BY country,international_status').all(),
        db.prepare('SELECT provider,employer,last_fetched_at,last_status FROM job_sources ORDER BY employer LIMIT 50').all(),
        db.prepare('SELECT role,COUNT(*) AS total FROM users GROUP BY role').all(),
        db.prepare('SELECT status,COUNT(*) AS total FROM contact_requests GROUP BY status').all(),
        db.prepare('SELECT source_id,result,error,created_at FROM job_runs ORDER BY created_at DESC LIMIT 20').all()]);
      return json({jobs:jobs.results,sources:sources.results,users:users.results,requests:requests.results,runs:runs.results});
    }
    if(path==='/api/admin/verify-lawyer'&&method==='POST') {
      const p=await body(req);if(!p.user_id||!['PT','DE','IE'].includes(p.country)||!p.registration) return fail('Informe usuário, país e registro');
      await db.prepare('UPDATE lawyer_profiles SET is_verified=1,country=?,registration=?,bar_name=? WHERE user_id=?')
        .bind(p.country,safeString(p.registration,100),safeString(p.bar_name,100),p.user_id).run();
      return json({ok:true});
    }
    return fail('Endpoint administrativo inexistente',404);
  }
  if(path==='/api/jobs'&&method==='GET') {
    const me=await currentUser(req,db),preview=!(me&&active(me)&&me.role==='candidate'&&!me.force_password_change);
    const country=url.searchParams.get('country')||'';
    const where=["j.is_active=1","j.last_seen_at>=datetime('now','-14 days')","NOT EXISTS (SELECT 1 FROM jobs j2 WHERE j2.job_url=j.job_url AND j2.id<j.id AND j2.is_active=1)"];
    const binds=[];
    if(['PT','DE','IE'].includes(country)){where.push('j.country=?');binds.push(country);}
    if(!preview && url.searchParams.get('q')){where.push('(j.title LIKE ? OR j.employer LIKE ?)');const q='%'+safeString(url.searchParams.get('q'),80).replaceAll('%','')+'%';binds.push(q,q);}
    const limit=preview?6:Math.max(1,Math.min(40,Number(url.searchParams.get('limit')||20)||20));
    const offset=preview?0:Math.min(10000,Math.max(0,Number(url.searchParams.get('offset')||0)||0));
    const sql=`SELECT j.id,j.title,j.employer,j.country,j.location,j.international_status,j.status_evidence,j.salary,${preview?'NULL as apply_url,NULL as job_url,':''}j.last_seen_at ${preview?'':',j.apply_url,j.job_url,j.summary'} FROM jobs j WHERE ${where.join(' AND ')} ORDER BY CASE j.international_status WHEN 'confirmed' THEN 0 ELSE 1 END,j.last_seen_at DESC LIMIT ? OFFSET ?`;
    const result=await db.prepare(sql).bind(...binds,limit,offset).all();
    return json({preview,jobs:result.results});
  }
  if(path==='/api/lawyers'&&method==='GET') {
    // Apenas perfis habilitados, com conta ativa. Não há acesso ao catálogo de candidatos.
    const country=url.searchParams.get('country');const where="p.is_verified=1 AND u.access_until>datetime('now')";
    const sql=`SELECT u.id,u.name,p.country,p.bar_name,p.registration,p.languages,p.description FROM lawyer_profiles p JOIN users u ON u.id=p.user_id WHERE ${where}${['PT','DE','IE'].includes(country)?' AND p.country=?':''} ORDER BY u.name LIMIT 100`;
    return json({lawyers:(await db.prepare(sql).bind(...(['PT','DE','IE'].includes(country)?[country]:[])).all()).results});
  }
  if(path==='/api/company/jobs/public'&&method==='GET') {
    const country=url.searchParams.get('country'),where=["j.status='published'","u.access_until>datetime('now')","p.verified=1"];
    const args=[];if(['PT','DE','IE'].includes(country)){where.push('j.country=?');args.push(country);}
    const rows=await db.prepare(`SELECT j.id,j.title,j.country,j.city,j.description,j.requirements,j.salary,j.image_url,j.document_support,j.created_at,p.legal_name AS employer
      FROM company_jobs j JOIN company_profiles p ON p.user_id=j.company_id JOIN users u ON u.id=j.company_id
      WHERE ${where.join(' AND ')} ORDER BY j.created_at DESC LIMIT 50`).bind(...args).all();
    return json({jobs:rows.results});
  }
  const me=await currentUser(req,db);
  if(!me) return fail('Entre com sua conta',401);
  if(path==='/api/me'&&method==='GET') return json({user:userResponse(me),legal_requests_enabled:env.ENABLE_LEGAL_REQUESTS==='true'});
  if(path==='/api/change-password'&&method==='POST') {
    const p=await body(req);
    if(!validPassword(p.new_password)) return fail('A nova senha deve ter 12 a 128 caracteres');
    const full=await db.prepare('SELECT password_hash FROM users WHERE id=?').bind(me.id).first();
    if(!await verifyPassword(String(p.current_password||''),full.password_hash)) return fail('Senha atual incorreta',403);
    await db.batch([
      db.prepare('UPDATE users SET password_hash=?,force_password_change=0 WHERE id=?').bind(await passwordHash(p.new_password),me.id),
      db.prepare('DELETE FROM sessions WHERE user_id=?').bind(me.id)
    ]);
    return json({ok:true,message:'Senha atualizada. Faça login novamente'},200,{'Set-Cookie':sessionCookie('',req,true)});
  }
  if(me.force_password_change) return fail('Altere a senha provisória antes de continuar',403);
  if(path==='/api/checkout'&&method==='POST') {
    if(me.role==='admin') return fail('Administradores não compram planos');
    const order={id:uid(),user_id:me.id,plan:me.role,expected_amount:prices[me.role]};
    await db.prepare('INSERT INTO orders(id,user_id,plan,expected_amount) VALUES(?,?,?,?)').bind(order.id,order.user_id,order.plan,order.expected_amount).run();
    const checkout_url=await checkoutLink(env,order,me,url.origin);
    await db.prepare('UPDATE orders SET checkout_url=? WHERE id=?').bind(checkout_url,order.id).run();
    return json({checkout_url,order_nsu:order.id});
  }
  if(path==='/api/confirm-payment'&&method==='POST') {
    const p=await body(req);
    const order=await db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(safeString(p.order_nsu,100),me.id).first();
    if(!order) return fail('Pedido não encontrado',404);
    if(order.status==='paid') return json({ok:true,already_confirmed:true});
    if(order.status!=='pending') return fail('Pedido não está pendente');
    const details={slug:p.slug,transaction_nsu:p.transaction_nsu};
    if(!await verifyOrder(env,order,details)) return fail('Pagamento ainda não confirmado',402);
    await activatePaidOrder(db,order,details);
    return json({ok:true,active:true});
  }
  if(path==='/api/lawyer/profile'&&method==='POST') {
    if(me.role!=='lawyer') return fail('Somente profissional jurídico',403);
    const p=await body(req);
    await db.prepare('UPDATE lawyer_profiles SET languages=?,description=? WHERE user_id=?')
      .bind(safeString(p.languages,100),safeString(p.description,450),me.id).run();
    return json({ok:true});
  }
  if(path==='/api/requests'&&method==='POST') {
    if(env.ENABLE_LEGAL_REQUESTS!=='true') return fail('Solicitações jurídicas desativadas até revisão regulatória',503);
    if(me.role!=='candidate'||!active(me)) return fail('É necessário plano candidato ativo',403);
    const p=await body(req);
    if(p.consent!==true) return fail('Autorize o compartilhamento diretamente com o advogado escolhido');
    const message=safeString(p.message,1000),phone=safeString(p.phone,40);
    if(message.length<10) return fail('Descreva sua solicitação (mínimo de 10 caracteres)');
    const lawyer=await db.prepare("SELECT u.id FROM users u JOIN lawyer_profiles p ON u.id=p.user_id WHERE u.id=? AND p.is_verified=1 AND u.role='lawyer' AND u.access_until>datetime('now')")
      .bind(safeString(p.lawyer_id,70)).first();
    if(!lawyer) return fail('Advogado indisponível',404);
    await db.prepare('INSERT INTO contact_requests(id,candidate_id,lawyer_id,job_id,contact_name,contact_email,contact_phone,message,consent_at) VALUES(?,?,?,?,?,?,?,?,datetime(\'now\'))')
      .bind(uid(),me.id,lawyer.id,null,me.name,me.email,phone||null,message).run();
    return json({ok:true,message:'Solicitação enviada somente ao profissional escolhido'},201);
  }
  if(path==='/api/requests'&&method==='GET') {
    if(me.role!=='lawyer'||!active(me)||env.ENABLE_LEGAL_REQUESTS!=='true') return fail('Sem acesso às solicitações',403);
    const reqs=await db.prepare('SELECT id,contact_name,contact_email,contact_phone,message,status,consent_at,created_at FROM contact_requests WHERE lawyer_id=? ORDER BY created_at DESC LIMIT 100').bind(me.id).all();
    return json({requests:reqs.results});
  }
  if(path==='/api/requests/status'&&method==='POST') {
    if(me.role!=='lawyer'||!active(me)||env.ENABLE_LEGAL_REQUESTS!=='true') return fail('Sem autorização',403);
    const p=await body(req);if(!['contacted','closed'].includes(p.status))return fail('Status inválido');
    const r=await db.prepare('UPDATE contact_requests SET status=? WHERE id=? AND lawyer_id=?').bind(p.status,safeString(p.request_id,70),me.id).run();
    return json({ok:r.meta.changes>0});
  }
  if(path==='/api/company/profile'&&method==='GET') {
    if(me.role!=='company') return fail('Acesso exclusivo de empresas',403);
    return json({profile:await db.prepare('SELECT legal_name,website,description,verified,logo_url FROM company_profiles WHERE user_id=?').bind(me.id).first()});
  }
  if(path==='/api/company/profile'&&method==='POST') {
    if(me.role!=='company'||!active(me)) return fail('Plano empresa ativo necessário',403);
    const p=await body(req);
    if(safeString(p.legal_name,150).length<3) return fail('Informe razão social ou nome empresarial');
    const website=safeHttps(p.website),logo=safeHttps(p.logo_url);
    if(p.website && !website) return fail('Site institucional deve usar HTTPS');
    if(p.logo_url && !logo) return fail('Logo deve usar HTTPS');
    await db.prepare("UPDATE company_profiles SET legal_name=?,website=?,description=?,logo_url=?,verified=0,updated_at=datetime('now') WHERE user_id=?")
      .bind(safeString(p.legal_name,150),website,safeString(p.description,700),logo,me.id).run();
    return json({ok:true,notice:'Cadastro enviado para verificação. O perfil não aparece publicamente até aprovação.'});
  }
  if(path==='/api/company/jobs'&&method==='GET') {
    if(me.role!=='company') return fail('Acesso exclusivo de empresas',403);
    const rows=await db.prepare('SELECT id,title,country,city,status,created_at,updated_at FROM company_jobs WHERE company_id=? ORDER BY created_at DESC LIMIT 100').bind(me.id).all();
    return json({jobs:rows.results});
  }
  if(path==='/api/company/jobs'&&method==='POST') {
    if(me.role!=='company'||!active(me)) return fail('Assinatura da empresa não está ativa',403);
    const p=await body(req),title=safeString(p.title,180),description=safeString(p.description,4000),requirements=safeString(p.requirements,4000),country=p.country;
    if(title.length<6||description.length<35||requirements.length<15||!['PT','DE','IE'].includes(country)) return fail('Informe título, país, descrição e requisitos completos');
    const img=safeHttps(p.image_url);if(p.image_url&&!img)return fail('Imagem precisa ser um link HTTPS válido');
    const lastHour=await db.prepare("SELECT COUNT(*) as count FROM company_jobs WHERE company_id=? AND created_at>datetime('now','-1 hour')").bind(me.id).first();
    if(lastHour.count>=10) return fail('Limite antiabuso temporário. Tente mais tarde',429);
    const id=uid();await db.prepare(`INSERT INTO company_jobs(id,company_id,title,country,city,description,requirements,salary,image_url,document_support)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,me.id,title,country,safeString(p.city,150),description,requirements,safeString(p.salary,130),img,safeString(p.document_support,900)).run();
    return json({ok:true,id,status:'pending',notice:'Vaga enviada à revisão. Não ficará pública até aprovação.'},201);
  }
  if(path==='/api/company/apply'&&method==='POST') {
    if(me.role!=='candidate') return fail('Cadastro de candidato necessário',403);
    const p=await body(req),message=safeString(p.message,1000);
    if(p.consent!==true||message.length<15)return fail('Preencha a mensagem e autorize o envio ao empregador');
    const job=await db.prepare(`SELECT j.id FROM company_jobs j JOIN company_profiles cp ON cp.user_id=j.company_id JOIN users u ON u.id=j.company_id
      WHERE j.id=? AND j.status='published' AND cp.verified=1 AND u.access_until>datetime('now')`).bind(safeString(p.job_id,70)).first();
    if(!job)return fail('Vaga não disponível',404);
    const id=uid();await db.prepare('INSERT INTO company_applications(id,job_id,candidate_id,contact_name,contact_email,message) VALUES(?,?,?,?,?,?)').bind(id,job.id,me.id,me.name,me.email,message).run();
    return json({ok:true,application_id:id},201);
  }
  if(path==='/api/company/my-applications'&&method==='GET') {
    if(me.role!=='candidate') return fail('Acesso exclusivo de candidatos',403);
    const rows=await db.prepare(`SELECT a.id,a.status,a.created_at,j.title,cp.legal_name AS employer FROM company_applications a JOIN company_jobs j ON j.id=a.job_id JOIN company_profiles cp ON cp.user_id=j.company_id WHERE a.candidate_id=? ORDER BY a.created_at DESC LIMIT 100`).bind(me.id).all();
    return json({applications:rows.results});
  }
  if(path==='/api/company/applications'&&method==='GET') {
    if(me.role!=='company'||!active(me)) return fail('Acesso exclusivo de empresas com plano ativo',403);
    const rows=await db.prepare(`SELECT a.id,a.contact_name,a.contact_email,a.message,a.status,a.created_at,j.title AS job_title FROM company_applications a JOIN company_jobs j ON j.id=a.job_id WHERE j.company_id=? ORDER BY a.created_at DESC LIMIT 100`).bind(me.id).all();
    return json({applications:rows.results});
  }
  if(path==='/api/company/messages'&&method==='GET') {
    if(!['candidate','company'].includes(me.role) || (me.role==='company'&&!active(me)))return fail('Acesso não permitido',403);
    const app=await allowedApplication(db,me,safeString(url.searchParams.get('application_id'),70));
    if(!app)return fail('Candidatura não encontrada',404);
    const rows=await db.prepare('SELECT sender_id,content,created_at FROM company_messages WHERE application_id=? ORDER BY created_at LIMIT 100').bind(app.id).all();
    return json({messages:rows.results,application_id:app.id});
  }
  if(path==='/api/company/messages'&&method==='POST') {
    if(!['candidate','company'].includes(me.role) || (me.role==='company'&&!active(me)))return fail('Acesso não permitido',403);
    const p=await body(req),app=await allowedApplication(db,me,safeString(p.application_id,70)),content=safeString(p.content,1500);
    if(!app)return fail('Candidatura não encontrada',404);
    if(content.length<2)return fail('Mensagem não pode estar vazia');
    const count=await db.prepare("SELECT COUNT(*) as total FROM company_messages WHERE application_id=? AND sender_id=? AND created_at>datetime('now','-1 hour')").bind(app.id,me.id).first();
    if(count.total>=30)return fail('Limite temporário de mensagens atingido',429);
    await db.prepare('INSERT INTO company_messages(id,application_id,sender_id,content) VALUES(?,?,?,?)').bind(uid(),app.id,me.id,content).run();
    return json({ok:true},201);
  }
  return fail('Endpoint não encontrado',404);
}
export default {
  async fetch(req,env) {
    const url=new URL(req.url);
    let response;
    if(url.pathname.startsWith('/api/')) {
      try{response=await handleApi(req,env,url);}
      catch(err){console.error('API failure',url.pathname,err.message);response=/UNIQUE constraint/.test(err.message)?fail('Já existe um registro com esses dados',409):fail('Falha interna no processamento. Verifique a configuração ou contate o suporte.',500);}
    } else response=await env.ASSETS.fetch(req);
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    headers.set('X-Frame-Options','DENY');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
    headers.set('Content-Security-Policy',"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; upgrade-insecure-requests");
    if(url.protocol==='https:') headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
  async scheduled(controller,env,ctx) {ctx.waitUntil((async()=>{
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<datetime('now')"),
      env.DB.prepare("DELETE FROM login_attempts WHERE reset_at<datetime('now')")
    ]);
    await runJobBot(env);
  })());}
};
