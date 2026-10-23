// Uso interno por Criar-Acesso-Cloudflare.ps1. A senha entra somente por STDIN.
import {pbkdf2Sync,randomBytes} from 'node:crypto';
const a=process.argv.slice(2),pick=k=>a[a.indexOf('--'+k)+1];
const email=String(pick('email')||'').trim().toLowerCase(),name=String(pick('name')||'').trim(),role=String(pick('role')||'');
if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254||name.length<3||name.length>120||!['admin','recruiter','candidate'].includes(role)){
 console.error('Argumentos inválidos: --email --name --role admin|recruiter|candidate');process.exit(2)
}
let input='';for await(const chunk of process.stdin){input+=chunk.toString('utf8');if(input.length>2000)throw Error('Entrada grande demais')}
let password;try{password=JSON.parse(input).password}catch{console.error('Entrada STDIN inválida');process.exit(2)}
if(typeof password!=='string'||password.length<12||password.length>256){console.error('Senha deve ter 12 a 256 caracteres');process.exit(2)}
const salt=randomBytes(16).toString('hex'),hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),310000,32,'sha256').toString('hex');
password='';input='';
const quote=s=>`'${s.replaceAll("'","''")}'`;
process.stdout.write(`INSERT INTO users(email,name,password_hash,role,active) VALUES(${quote(email)},${quote(name)},${quote(`pbkdf2$310000$${salt}$${hash}`)},${quote(role)},1) ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,role=excluded.role,active=1;\n`);
