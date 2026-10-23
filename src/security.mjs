// WebCrypto-compatible password and session implementation. Never log credentials.
export const normalizeEmail = x => String(x||'').trim().toLowerCase();
const encoder = new TextEncoder();
export const hex = bytes => [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const fromHex = h => new Uint8Array((h.match(/.{2}/g)||[]).map(x=>parseInt(x,16)));
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const hashToken = async s => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s))));
export async function verifyPassword(password, encoded) {
 try {
  const [name,iterations,salt,expected]=String(encoded||'').split('$');
  if(name!=='pbkdf2'||Number(iterations)!==310000||salt?.length!==32||expected?.length!==64)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromHex(salt),iterations:310000},key,256);
  const actual=new Uint8Array(bits),saved=fromHex(expected);let diff=0;
  for(let i=0;i<actual.length;i++)diff|=actual[i]^saved[i];
  return diff===0;
 }catch{return false}
}
export function getCookie(req,key) {return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(key+'='))?.slice(key.length+1)||'';}
export const sessionCookie = raw => `ramon_session=${raw}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
export const clearSessionCookie = () => 'ramon_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
export const chatCookie = (raw,age) => `ramon_chat=${raw}; Path=/api/public/chat; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export async function getUser(req,db){
 const token=getCookie(req,'ramon_session');if(!/^[0-9a-f]{64}$/.test(token))return null;
 const digest=await hashToken(token);
 return await db.prepare('SELECT u.id,u.email,u.name,u.role,u.active FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(digest,Date.now()).first();
}
