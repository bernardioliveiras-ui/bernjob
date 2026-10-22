import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countryFromLocation,evaluateInternational,normalizeJobs,sourceUrl} from '../src/jobbot.js';
test('detecta localidades dos tres paises sem confundir remoto',()=>{
 assert.equal(countryFromLocation('Lisboa, Portugal'),'PT');
 assert.equal(countryFromLocation('Berlin, Deutschland'),'DE');
 assert.equal(countryFromLocation('Dublin, Ireland'),'IE');
 assert.equal(countryFromLocation('IE'),'IE');
 assert.equal(countryFromLocation('Remote, Worldwide'),null);
 assert.equal(countryFromLocation('São Paulo, Brasil'),null);
});
test('restricao expressa sempre prevalece sobre patrocinio',()=>{
 assert.equal(evaluateInternational('Relocation support available. No visa sponsorship.').status,'not_confirmed');
 assert.equal(evaluateInternational('We provide visa sponsorship for qualified applicants').status,'confirmed');
 assert.equal(evaluateInternational('Great benefits and health insurance').status,'unknown');
});
test('Greenhouse: so vagas de pais permitido e URL HTTPS',()=>{
 const source={id:'src',provider:'greenhouse',employer:'Empresa Exemplo'};
 const data={jobs:[{id:1,title:'Engenheiro',location:{name:'Berlin, Germany'},absolute_url:'https://boards.greenhouse.io/example/jobs/1',content:'Visa sponsorship available'},{id:2,title:'Vendedor',location:{name:'New York, USA'},absolute_url:'https://boards.greenhouse.io/example/jobs/2'}]};
 const jobs=normalizeJobs('greenhouse',data,source);assert.equal(jobs.length,1);assert.equal(jobs[0].internationalStatus,'confirmed');
});
test('Lever: deve usar link de candidatura e conservar decisao de elegibilidade',()=>{
 const data=[{id:'abc',text:'Técnico',categories:{location:'Lisbon, Portugal'},hostedUrl:'https://jobs.lever.co/acme/abc',applyUrl:'https://jobs.lever.co/acme/abc/apply',descriptionPlain:'Must already have the right to work'}];
 const jobs=normalizeJobs('lever',data,{id:'l',employer:'Acme'});assert.equal(jobs.length,1);assert.equal(jobs[0].internationalStatus,'not_confirmed');
});
test('Ashby: ignora vagas nao listadas',()=>{
 const data={jobs:[{title:'Engineer',location:'Dublin, Ireland',jobUrl:'https://jobs.ashbyhq.com/co/1',applyUrl:'https://jobs.ashbyhq.com/co/1/application-form',isListed:true},{title:'Hidden',location:'Berlin',jobUrl:'https://jobs.ashbyhq.com/co/2',applyUrl:'https://jobs.ashbyhq.com/co/2/apply',isListed:false}]};
 assert.equal(normalizeJobs('ashby',data,{id:'a',employer:'Acme'}).length,1);
});
test('nao permite slug de URL arbitraria no coletor',()=>{
 assert.throws(()=>sourceUrl({provider:'greenhouse',board_slug:'../../token'}));
 assert.match(sourceUrl({provider:'ashby',board_slug:'empresa'}),/^https:\/\/api\.ashbyhq\.com/);
});
test('Ashby usa codigo de pais quando cidade nao informa pais',()=>{
 const data={jobs:[{title:'Developer',location:'Remote / hybrid',address:{postalAddress:{addressCountry:'DE'}},jobUrl:'https://jobs.ashbyhq.com/company/abc',applyUrl:'https://jobs.ashbyhq.com/company/abc/apply',isListed:true}]};
 assert.equal(normalizeJobs('ashby',data,{id:'a',employer:'Empresa'}).at(0).country,'DE');
});
test('coletor pagina as vagas Lever sem eliminar resultados anteriores', async ()=>{
 const {collectSource}=await import('../src/jobbot.js');
 const calls=[],statements=[];
 const fakeDB={prepare(sql){const entry={sql,params:[],bind(...args){entry.params=args;return entry;},async run(){statements.push(entry);return {meta:{changes:1}};}};return entry;},async batch(commands){for(const c of commands)statements.push(c);return []}};
 const mockFetch=async url=>{calls.push(url);const skip=Number(new URL(url).searchParams.get('skip')||0);const count=skip===0?100:3;
  const jobs=Array.from({length:count},(_,i)=>({id:`p${skip+i}`,text:'Engineer',categories:{location:'Dublin, Ireland'},hostedUrl:`https://jobs.lever.co/company/p${skip+i}`,descriptionPlain:'Visa sponsorship is available'}));
  return {ok:true,async json(){return jobs;}};
 };
 const result=await collectSource(fakeDB,{id:'s',provider:'lever',board_slug:'company',employer:'Empresa',enabled:1,terms_reviewed:1},mockFetch);
 assert.equal(result.fetched,103);assert.equal(result.imported,103);assert.equal(calls.length,2);assert.ok(statements.some(x=>x.sql.startsWith('UPDATE jobs SET is_active=0')));
});
