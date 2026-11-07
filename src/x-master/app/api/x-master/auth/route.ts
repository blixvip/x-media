import { xMasterRuntime,readBoundedObject,xMasterJson,isD1Database } from '@/x-master/lib/x-master-api';
import { appAuthConfigured,resolveAppSession,requestAppCode,verifyAppCode,clearAppCookie,authRateLimit } from '@/x-master/lib/x-app-auth';
import { sameOriginRequest } from '@/x-master/lib/x-user-auth';
import { localWorkspaceUser } from '@/x-master/lib/local-workspace';
export async function GET(request:Request){const runtime=await xMasterRuntime();const session=await resolveAppSession(request,runtime);const localUser=localWorkspaceUser(request,runtime);return xMasterJson(request,{configured:appAuthConfigured(runtime),local:Boolean(localUser),user:session?.user??localUser,storage:isD1Database(runtime.DB),media:Boolean(runtime.MEDIA&&runtime.X_REFERENCE_WORKER_TOKEN)},200,session?.cookie);}
export async function POST(request:Request){
 if(!sameOriginRequest(request))return xMasterJson(request,{error:'Trusted origin required.'},403);
 const runtime=await xMasterRuntime();if(!runtime.DB||!appAuthConfigured(runtime))return xMasterJson(request,{error:'Email sign-in is not configured.'},503);
 try{const body=await readBoundedObject(request,2000);
  await authRateLimit(runtime.DB,`ip:${request.headers.get('cf-connecting-ip')??'local'}`,20,900);
  if(body.action==='send'){await requestAppCode(runtime.DB,body.email,runtime);return xMasterJson(request,{message:'If this email is invited, a code is on its way.'},200);}
  if(body.action!=='verify')return xMasterJson(request,{error:'Unsupported sign-in action.'},400);
  await authRateLimit(runtime.DB,`verify:${String(body.email).toLowerCase()}`,10,900);
  const result=await verifyAppCode(body.email,body.code,runtime,new URL(request.url).protocol==='https:');return xMasterJson(request,{user:result.user},200,result.cookie);
 }catch(error){return xMasterJson(request,{error:error instanceof Error?error.message:'Sign-in failed.'},400);}
}
export async function DELETE(request:Request){if(!sameOriginRequest(request))return xMasterJson(request,{error:'Trusted origin required.'},403);return xMasterJson(request,{ok:true},200,clearAppCookie(new URL(request.url).protocol==='https:'));}
