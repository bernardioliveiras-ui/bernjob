// Conectores de páginas de carreiras públicas. Não confundir vaga publicada com patrocínio de visto.
const allowed = new Set(['PT','DE','IE']);
export function countryFromLocation(value) {
  const s = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (/^(pt|de|ie)$/i.test(s.trim())) return s.trim().toUpperCase();
  if (/\b(portugal|lisboa|lisbon|porto|braga|coimbra|faro)\b/.test(s)) return 'PT';
  if (/\b(germany|deutschland|alemanh[ae]|berlin|munich|munchen|muenchen|hamburg|frankfurt|stuttgart|cologne|koln|köln|dusseldorf|düsseldorf)\b/.test(s)) return 'DE';
  if (/\b(ireland|irlanda|dublin|cork|galway|limerick|waterford)\b/.test(s)) return 'IE';
  return null;
}
const NEGATIVE = [
  /no (?:visa |work permit )?sponsorship/i,
  /(?:cannot|can't|do not|does not|unable to) (?:provide|offer|support|sponsor) (?:visa|work permits?|immigration)/i,
  /must (?:already )?(?:have|possess) (?:the )?(?:right|authorization|authorisation) to work/i,
  /sem (?:apoio|patrocinio|patrocínio) (?:de |para )?(?:visto|imigracao|imigração)/i
];
const POSITIVE = [
  /visa sponsorship (?:is )?(?:available|provided|offered)/i,
  /(?:provide|offer) (?:work )?visa sponsorship/i,
  /(?:we|company|employer) (?:will |can )?sponsor (?:your |a )?(?:work )?visa/i,
  /(?:relocation|immigration|work permit) (?:assistance|support) (?:is )?(?:provided|available|offered)/i,
  /international (?:applicants|candidates) (?:are )?(?:welcome|accepted|encouraged)/i,
  /(?:visumsunterst[uü]tzung|visaunterst[uü]tzung)/i,
  /(?:patroc[ií]nio de visto|apoio (?:ao |para o )?visto de trabalho)/i,
  /(?:candidaturas|candidatos) (?:de |dos )?(?:pa[ií]ses terceiros|n[aã]o residentes)/i
];
export function evaluateInternational(text) {
  const raw = String(text || '').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt);/g,' ');
  const negative = NEGATIVE.find(x=>x.test(raw));
  if (negative) return {status:'not_confirmed',evidence:'Restrição de elegibilidade informada no anúncio; confirmar com empregador'};
  const positive = POSITIVE.find(x=>x.test(raw));
  if (positive) return {status:'confirmed',evidence:'Anúncio menciona apoio ou aceitação internacional; conferir condições individualmente'};
  return {status:'unknown',evidence:'Anúncio sem confirmação explícita de contratação internacional'};
}
function safeHttps(link) {
  try { const u = new URL(link); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
export function normalizeJobs(provider, data, source) {
  let rows;
  if (provider === 'greenhouse') rows = data.jobs ?? [];
  else if (provider === 'lever') rows = Array.isArray(data) ? data : [];
  else if (provider === 'ashby') rows = data.jobs ?? [];
  else throw Error('Provedor não suportado');
  if (!Array.isArray(rows)) throw Error('Formato inválido da API');
  const out = [];
  for (const r of rows) {
    if (provider === 'ashby' && r.isListed === false) continue;
    const location = provider === 'greenhouse' ? r.location?.name : provider === 'lever' ? r.categories?.location : r.location;
    const ashbyCountry = provider === 'ashby' ? String(r.address?.postalAddress?.addressCountry || '').toUpperCase() : '';
    const country = countryFromLocation(location) || (allowed.has(ashbyCountry) ? ashbyCountry : null);
    if (!allowed.has(country)) continue; // Remoto/país incerto não vira oportunidade europeia automaticamente
    const title = String(r.title || r.text || '').trim().slice(0,220);
    const externalId = String(r.id || r.jobUrl || '').slice(0,300);
    const url = safeHttps(provider === 'greenhouse' ? r.absolute_url : provider === 'lever' ? r.hostedUrl : r.jobUrl);
    const apply = safeHttps(provider === 'ashby' ? r.applyUrl : provider === 'lever' ? (r.applyUrl || r.hostedUrl) : r.absolute_url);
    if (!title || !externalId || !url || !apply) continue;
    const description = String(provider === 'greenhouse' ? r.content || '' : provider === 'lever' ? (r.descriptionPlain || r.description || '') : r.descriptionPlain || r.descriptionHtml || '').slice(0,25000);
    const finding = evaluateInternational(`${title} ${description}`);
    out.push({ id:`${source.id}:${externalId}`, externalId, sourceId:source.id, employer:source.employer,
      title, country, location:String(location || country).slice(0,180), jobUrl:url, applyUrl:apply,
      summary:description.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,650),
      salary:provider === 'ashby' ? String(r.compensation?.scrapeableCompensationSalarySummary || '').slice(0,180) || null : null,
      internationalStatus:finding.status, statusEvidence:finding.evidence });
  }
  return out;
}
export function sourceUrl(source) {
  if (!/^[a-zA-Z0-9_-]{1,70}$/.test(source.board_slug)) throw Error('Slug inválido');
  if (source.provider === 'greenhouse') return `https://boards-api.greenhouse.io/v1/boards/${source.board_slug}/jobs?content=true`;
  if (source.provider === 'lever') return `https://api.lever.co/v0/postings/${source.board_slug}?mode=json&limit=100`;
  if (source.provider === 'ashby') return `https://api.ashbyhq.com/posting-api/job-board/${source.board_slug}?includeCompensation=true`;
  throw Error('Provedor inválido');
}
export async function collectSource(db,source,fetcher=fetch) {
  if (!source.enabled || !source.terms_reviewed) throw Error('Fonte sem autorização de coleta');
  const url = sourceUrl(source);
  // Paginação da Lever: sem ela a coleta perderia vagas de empresas com muitas ofertas.
  let allData=null, rawCount=0, listingComplete=true;
  for (let page=0;page<(source.provider==='lever'?5:1);page++) {
    const pageUrl=source.provider==='lever' ? `${url}&skip=${page*100}` : url;
    const response=await fetcher(pageUrl,{headers:{'Accept':'application/json','User-Agent':'BernGlobalJobBot/0.1'},signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error(`Fonte HTTP ${response.status}`);
    const data=await response.json();
    const rows=Array.isArray(data)?data:(Array.isArray(data.jobs)?data.jobs:null);
    if(!rows)throw Error('Resposta inesperada da fonte');
    rawCount+=rows.length;
    if (source.provider==='lever') {
      allData=(allData||[]).concat(rows);
      if(rows.length<100) break;
      if(page===4) listingComplete=false;
    } else { allData=data; break; }
  }
  const jobs = normalizeJobs(source.provider,allData,source);
  // Cada fonte é processada em páginas/rodadas controladas para proteger os limites do Workers e D1.
  const now = new Date().toISOString().replace('T',' ').slice(0,19);
  // Inserts multi-linhas reduzem radicalmente o número de consultas D1 por lote.
  for (let i=0;i<jobs.length;i+=25) {
    const batch=jobs.slice(i,i+25);
    const values=batch.map(()=>'(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)').join(',');
    const args=batch.flatMap(j=>[j.id,j.sourceId,j.employer,j.externalId,j.country,j.title,j.location,
      j.jobUrl,j.applyUrl,j.summary,j.salary,j.internationalStatus,j.statusEvidence,now]);
    await db.prepare(`INSERT INTO jobs
      (id,source_id,employer,external_id,country,title,location,job_url,apply_url,summary,salary,international_status,status_evidence,last_seen_at,is_active)
      VALUES ${values}
      ON CONFLICT(id) DO UPDATE SET employer=excluded.employer,title=excluded.title,location=excluded.location,
      job_url=excluded.job_url,apply_url=excluded.apply_url,summary=excluded.summary,salary=excluded.salary,
      international_status=excluded.international_status,status_evidence=excluded.status_evidence,
      last_seen_at=excluded.last_seen_at,is_active=1`).bind(...args).run();
  }
  // Arquiva vagas que deixaram de aparecer. Só ocorre em coleta completa e bem-sucedida.
  // Lever limita resposta a 100: se vierem 100, não arquivar até paginação estar completa.
  const fullListing = listingComplete;
  if (fullListing) await db.prepare('UPDATE jobs SET is_active=0 WHERE source_id=? AND last_seen_at < ?').bind(source.id,now).run();
  await db.prepare("UPDATE job_sources SET last_fetched_at=datetime('now'),last_success_at=datetime('now'),last_status=? WHERE id=?")
    .bind(`OK: ${jobs.length} vagas dos 3 países`,source.id).run();
  await db.prepare('INSERT INTO job_runs(id,source_id,imported_count,fetched_count,result) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),source.id,jobs.length,rawCount,'ok').run();
  return {source:source.employer,imported:jobs.length,fetched:rawCount,fullListing};
}
export async function runJobBot(env) {
  const batch = Math.min(20,Math.max(1,parseInt(env.JOBBOT_BATCH_SIZE || '8')));
  const sources = await env.DB.prepare(`SELECT * FROM job_sources WHERE enabled=1 AND terms_reviewed=1 ORDER BY COALESCE(last_fetched_at,'1970-01-01') ASC LIMIT ?`).bind(batch).all();
  const results=[];
  for (const source of sources.results) {
    try { results.push(await collectSource(env.DB,source)); }
    catch (err) {
      await env.DB.prepare("UPDATE job_sources SET last_fetched_at=datetime('now'),last_status=? WHERE id=?").bind(String(err.message).slice(0,180),source.id).run();
      await env.DB.prepare('INSERT INTO job_runs(id,source_id,result,error) VALUES(?,?,?,?)')
        .bind(crypto.randomUUID(),source.id,'error',String(err.message).slice(0,300)).run();
      results.push({source:source.employer,error:String(err.message)});
    }
  }
  return results;
}
