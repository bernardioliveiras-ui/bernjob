// Divide a migracao inicial em comandos DDL individuais, sem quebrar texto entre aspas.
// Saida JSON para consumo do PowerShell. Nao executa SQL.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const file = join(root, 'migrations', '0001_initial.sql');
const source = readFileSync(file, 'utf8');
let parts=[], cur='', state='normal';
for (let i=0;i<source.length;i++) {
  let c=source[i], next=source[i+1];
  if (state==='line') {
    if (c==='\n') { state='normal'; cur+='\n'; }
    continue;
  }
  if (state==='block') {
    if (c==='*'&&next==='/'){state='normal';i++;}
    continue;
  }
  if (state==='normal') {
    if(c==='-'&&next==='-'){state='line';i++;continue}
    if(c==='/'&&next==='*'){state='block';i++;continue}
    if(c==="'"){state='single';cur+=c;continue}
    if(c==='"'){state='double';cur+=c;continue}
    if(c===';'){if(cur.trim()) parts.push(cur.trim());cur='';continue}
  } else if (state==='single') {
    if(c==="'"){
      if(next==="'"){cur+="''";i++;continue}
      state='normal';
    }
  } else if (state==='double') {
    if(c==='"'){
      if(next==='"'){cur+='""';i++;continue}
      state='normal';
    }
  }
  cur+=c;
}
if(state!=='normal'||cur.trim()) throw new Error('SQL com instrucao incompleta ou sem ; final');
// PRAGMA vale apenas para a conexao de cada chamada; D1 aplica a integridade na propria base.
parts=parts.filter(x=>!/^PRAGMA\s+foreign_keys\s*=\s*ON\s*$/i.test(x));
if(parts.length<10||parts.some(x=>!/^CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+/i.test(x))) {
  throw new Error('Migracao diferente da v0.4 esperada. Abortando para evitar executar SQL inesperado.');
}
console.log(JSON.stringify(parts));
