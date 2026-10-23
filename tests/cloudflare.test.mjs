import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import worker from '../src/index.mjs';

class FakeD1Statement {
 constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args}
 bind(...args){return new FakeD1Statement(this.db,this.sql,args)}
 first(){return this.db.db.prepare(this.sql).get(...this.args)||null}
 all(){return {results:this.db.db.prepare(this.sql).all(...this.args)}}
 run(){const r=this.db.db.prepare(this.sql).run(...this.args);return {meta:{last_row_id:Number(r.lastInsertRowid),changes:Number(r.changes)},success:true}}
}
class FakeD1{
 constructor(migrate=true){this.db=new DatabaseSync(':memory:');if(migrate)this.db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'))}
 prepare(sql){return new FakeD1Statement(this,sql)}
 batch(stmts){this.db.exec('BEGIN');try{const out=stmts.map(x=>x.run());this.db.exec('COMMIT');return out}catch(e){this.db.exec('ROLLBACK');throw e}}
}
const db=new FakeD1();
const env={DB:db,APP_ENV:'staging',PUBLIC_APPLICATIONS_ENABLED:'false',ASSETS:{fetch:()=>new Response('<h1>Ramon</h1>')}};
async function user(name,email,role,pass){
 const salt=randomBytes(16).toString('hex');const h=pbkdf2Sync(pass,Buffer.from(salt,'hex'),310000,32,'sha256').toString('hex');
 db.prepare('INSERT INTO users(name,email,role,password_hash) VALUES(?,?,?,?)').bind(name,email,role,`pbkdf2$310000$${salt}$${h}`).run();
}
const root='https://ramon.example';
const invoke=(path,{method='GET',body,cookie}={})=>worker.fetch(new Request(root+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json','X-Ramon-Client':'1'}:{}),...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
let adminCookie='',recruitCookie='',jobId;
async function login(email){const r=await invoke('/api/login',{method:'POST',body:{email,password:'AReallySecurePassword2026!'}});assert.equal(r.status,200,r.status!==200?await r.text():'Esperado HTTP 200');return r.headers.get('set-cookie').split(';')[0];}

test('D1 schema, auth, role-based jobs, chatbot and privacy gate',async()=>{
 await user('Ramon Admin','ramon@exemplo.com','admin','AReallySecurePassword2026!');
 await user('Equipe Recrutamento','recrutador@exemplo.com','recruiter','AReallySecurePassword2026!');
 adminCookie=await login('ramon@exemplo.com');recruitCookie=await login('recrutador@exemplo.com');
 let r=await invoke('/api/jobs',{method:'POST',cookie:recruitCookie,body:{title:'Encanador',country:'Portugal',status:'published'}});
 assert.equal(r.status,403);
 r=await invoke('/api/jobs',{method:'POST',cookie:adminCookie,body:{title:'Encanador',country:'Portugal',skills:['Tubulação'],status:'published'}});
 assert.equal(r.status,201);jobId=(await r.json()).job_id;
 r=await invoke(`/api/jobs/${jobId}`,{method:'PATCH',cookie:recruitCookie,body:{title:'Alterado'}});assert.equal(r.status,403);
 r=await invoke('/api/public/jobs');assert.equal((await r.json()).jobs.length,1);
 r=await invoke('/api/public/chat/start',{method:'POST',body:{job_id:jobId,consent:true}});assert.equal(r.status,503);
 // In production, activate only after anti-abuse and RGPD checks. Test flows by switching gate in test env.
 env.PUBLIC_APPLICATIONS_ENABLED='true';
 r=await invoke('/api/screening/questions',{method:'POST',cookie:recruitCookie,body:{job_id:jobId,prompt_pt:'Qual ferramenta?',options:['Chave','Estetoscópio'],correct_index:0}});assert.equal(r.status,403);
 r=await invoke('/api/screening/questions',{method:'POST',cookie:adminCookie,body:{job_id:jobId,prompt_pt:'Qual ferramenta você usa?',options:['Chave','Estetoscópio'],correct_index:0}});assert.equal(r.status,201);
 r=await invoke('/api/public/chat/start',{method:'POST',body:{job_id:jobId,consent:true,language:'pt',utm_source:'meta',utm_campaign:'portugal'}});
 assert.equal(r.status,201);const chatCookie=r.headers.get('set-cookie').split(';')[0];
 for(const ans of ['José da Silva','jose@exemplo.com','Portugal','5','Tubulação','0']){
  r=await invoke('/api/public/chat/message',{method:'POST',cookie:chatCookie,body:{answer:ans}});
  assert.equal(r.status,200,r.status!==200?await r.text():'Esperado HTTP 200');
 }
 const session=(await r.json()).session;assert.equal(session.completed,true);
 r=await invoke('/api/stats',{cookie:adminCookie});const stats=await r.json();assert.equal(stats.candidates,1);assert.equal(stats.applications,1);
 r=await invoke('/api/candidates',{cookie:recruitCookie});assert.equal((await r.json()).candidates[0].status,'screening');
 r=await invoke('/api/matches?job_id='+jobId,{cookie:recruitCookie});assert.equal((await r.json()).matches[0].score,100);
 r=await invoke('/api/candidates');assert.equal(r.status,401);
 r=await invoke('/api/me',{cookie:adminCookie});assert.equal((await r.json()).user.role,'admin');
 r=await invoke('/api/logout',{method:'POST',cookie:adminCookie,body:{}});assert.equal(r.status,200);
 r=await invoke('/api/me',{cookie:adminCookie});assert.equal(r.status,401);
});

test('diagnostico detecta D1 sem migracoes e explica falha de API',async()=>{
 const emptyDb=new FakeD1(false);
 const brokenEnv={...env,DB:emptyDb};
 const call=(path,method='GET',body)=>worker.fetch(new Request(root+path,{method,headers:body?{'Content-Type':'application/json','X-Ramon-Client':'1'}:{},...(body?{body:JSON.stringify(body)}:{})}),brokenEnv);
 let r=await call('/api/health');assert.equal(r.status,503);
 assert.equal((await r.json()).database,'migration_pending');
 r=await call('/api/public/jobs');assert.equal(r.status,503);
 assert.match((await r.json()).error,/Banco nao inicializado/);
 r=await call('/api/login','POST',{email:'ramon@example.com',password:'invalid'});assert.equal(r.status,503);
});

test('health confirma tabelas quando D1 ja foi migrado',async()=>{
 const r=await invoke('/api/health');assert.equal(r.status,200);
 assert.equal((await r.json()).database,'ready');
});
