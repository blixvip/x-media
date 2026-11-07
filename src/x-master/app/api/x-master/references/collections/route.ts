import {readBoundedObject,xMasterJson,xMasterOptions} from '@/x-master/lib/x-master-api';
import {referenceContext,referenceFailure} from '@/x-master/lib/x-reference-api';
import {createCollection,deleteCollection} from '@/x-master/lib/x-references';
export function OPTIONS(request:Request){return xMasterOptions(request);}
export async function POST(request:Request){const auth=await referenceContext(request,true);if(!auth.ok)return auth.response;try{const body=await readBoundedObject(request,1000);return xMasterJson(request,{collection:await createCollection(auth.context.database,auth.context.ownerId,body.name)},201,auth.context.cookie);}catch(error){return referenceFailure(request,error,auth.context.cookie);}}
export async function DELETE(request:Request){const auth=await referenceContext(request,true);if(!auth.ok)return auth.response;try{const body=await readBoundedObject(request,1000);await deleteCollection(auth.context.database,auth.context.ownerId,String(body.id));return xMasterJson(request,{ok:true},200,auth.context.cookie);}catch(error){return referenceFailure(request,error,auth.context.cookie);}}
