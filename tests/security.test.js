import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../src/index.js';
const env={DB:{},ASSETS:{fetch:async ()=>new Response('ok',{status:200,headers:{'Content-Type':'text/plain'}})}};
test('resposta HTML tem cabecalhos defensivos',async()=>{
  const r=await handler.fetch(new Request('https://bern.example/'),env);
  assert.equal(r.status,200);
  assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.equal(r.headers.get('X-Frame-Options'),'DENY');
  assert.match(r.headers.get('Strict-Transport-Security'),/max-age=/);
});
test('requisição cross-origin não faz escrita',async()=>{
  const r=await handler.fetch(new Request('https://bern.example/api/signup',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(r.status,403);
});
test('escrita sem Origin não é permitida ao usuário',async()=>{
  const r=await handler.fetch(new Request('https://bern.example/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(r.status,403);
});
test('dados de candidatos exigem autenticação',async()=>{
  const r=await handler.fetch(new Request('https://bern.example/api/company/applications'),env);
  assert.equal(r.status,401);
});
