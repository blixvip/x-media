import { sealData, unsealData } from 'iron-session';
import type { D1DatabaseLike } from './x-automation-store.ts';

export type AppAuthEnvironment={SUPABASE_URL?:string;SUPABASE_ANON_KEY?:string;X_MASTER_AUTH_SECRET?:string;X_MASTER_ALLOWED_EMAILS?:string};
type User={id:string;email:string};
type AuthResponse={user?:{id?:string;email?:string;email_confirmed_at?:string};access_token?:string;refresh_token?:string;expires_in?:number};
type Session={subject:'reference_user';user:User;access_token:string;refresh_token:string;expires_at:number};
const COOKIE='x_master_app';
export function appAuthConfigured(env:AppAuthEnvironment){try{return Boolean(env.SUPABASE_ANON_KEY&&env.X_MASTER_AUTH_SECRET&&env.X_MASTER_AUTH_SECRET.length>=32&&env.X_MASTER_ALLOWED_EMAILS&&new URL(env.SUPABASE_URL!).protocol==='https:');}catch{return false;}}
const emailAddress=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase().slice(0,254):'';
const invited=(email:string,env:AppAuthEnvironment)=>(env.X_MASTER_ALLOWED_EMAILS??'').split(',').map(emailAddress).includes(email)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export async function authRateLimit(db:D1DatabaseLike,key:string,limit:number,seconds:number){
  await db.prepare('CREATE TABLE IF NOT EXISTS x_app_auth_limits (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL)').run();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const now=Date.now();await db.prepare('DELETE FROM x_app_auth_limits WHERE expires<?').bind(now).run();
  const row=await db.prepare('INSERT INTO x_app_auth_limits(id,attempts,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(hash,now+seconds*1000).first<{attempts:number}>();
  if(!row||row.attempts>limit)throw new Error('Please wait before trying again.');
}
async function authFetch(env:AppAuthEnvironment,path:string,body:unknown,fetcher:typeof fetch){
  if(!appAuthConfigured(env))throw new Error('Email sign-in is not configured.');
  const response=await fetcher(new URL(`/auth/v1/${path}`,env.SUPABASE_URL!),{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY!,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Email sign-in failed. Check your code or request a new one.');
  return response.json() as Promise<AuthResponse>;
}
export async function requestAppCode(db:D1DatabaseLike,value:unknown,env:AppAuthEnvironment,fetcher:typeof fetch=fetch){
  if(!appAuthConfigured(env))throw new Error('Email sign-in is not configured.');
  const email=emailAddress(value);await authRateLimit(db,`send:${email}`,1,60);
  if(invited(email,env))await authFetch(env,'otp',{email,create_user:false},fetcher);
}
function sessionCookie(value:string,secure:boolean){return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure?'; Secure':''}`;}
export function clearAppCookie(secure:boolean){return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;}
export async function verifyAppCode(value:unknown,code:unknown,env:AppAuthEnvironment,secure:boolean,fetcher:typeof fetch=fetch){
  const email=emailAddress(value);
  if(!invited(email,env)||typeof code!=='string'||!/^\d{6}$/.test(code))throw new Error('Email sign-in failed. Check your code or request a new one.');
  const data=await authFetch(env,'verify',{email,token:code,type:'email'},fetcher);
  if(!data.user?.id||emailAddress(data.user.email)!==email||!data.user.email_confirmed_at||!data.access_token||!data.refresh_token)throw new Error('Email verification failed.');
  const session:Session={subject:'reference_user',user:{id:data.user.id,email},access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+Math.min(Number(data.expires_in)||3600,86400)*1000};
  const sealed=await sealData(session,{password:env.X_MASTER_AUTH_SECRET!,ttl:30*86400});
  return {user:session.user,cookie:sessionCookie(sealed,secure)};
}
export async function resolveAppSession(request:Request,env:AppAuthEnvironment,fetcher:typeof fetch=fetch):Promise<{user:User;cookie?:string}|null>{
  if(!appAuthConfigured(env))return null;
  const raw=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  if(!raw)return null;
  try{
    const session=await unsealData<Session>(raw,{password:env.X_MASTER_AUTH_SECRET!,ttl:30*86400});
    if(session.subject!=='reference_user'||!session.user?.id||!invited(session.user.email,env))return null;
    let cookie:string|undefined;
    if(session.expires_at<Date.now()+30000){
      const data=await authFetch(env,'token?grant_type=refresh_token',{refresh_token:session.refresh_token},fetcher);
      if(data.user?.id!==session.user.id||!data.access_token||!data.refresh_token)return null;
      session.access_token=data.access_token;session.refresh_token=data.refresh_token;session.expires_at=Date.now()+(Number(data.expires_in)||3600)*1000;
      cookie=sessionCookie(await sealData(session,{password:env.X_MASTER_AUTH_SECRET!,ttl:30*86400}),new URL(request.url).protocol==='https:');
    }
    const response=await fetcher(new URL('/auth/v1/user',env.SUPABASE_URL!),{headers:{apikey:env.SUPABASE_ANON_KEY!,authorization:`Bearer ${session.access_token}`},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return null;
    const user=await response.json() as {id?:string;email?:string;email_confirmed_at?:string};
    if(user.id!==session.user.id||emailAddress(user.email)!==session.user.email||!user.email_confirmed_at)return null;
    return {user:session.user,cookie};
  }catch{return null;}
}
