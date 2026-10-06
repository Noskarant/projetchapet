import { requireOrganization, requireRole, OrganizationAuthError, organizationErrorResponse } from '@/lib/server-organization';
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from '@/lib/api-guard';
async function workerContext(request:Request){
 const context=await requireOrganization(request);requireRole(context.role,['worker','owner','admin']);
 const {data:contacts,error}=await context.admin.from('artisan_workflow_records').select('id,payload').eq('organization_id',context.organizationId).eq('kind','collaborator_contact');
 if(error)throw new Error('Équipe indisponible.');
 const ids=(contacts||[]).filter(row=>String(row.payload.email||'').trim().toLowerCase()===context.user.email?.toLowerCase()).map(row=>row.id);
 const links=ids.length?await context.admin.from('commercial_project_members').select('project_id').eq('organization_id',context.organizationId).in('collaborator_id',ids):{data:[],error:null};
 if(links.error)throw new Error('Affectations indisponibles.');
 return {...context,projectIds:[...new Set((links.data||[]).map(row=>String(row.project_id)))]};
}
export async function GET(request:Request){try{
 const context=await workerContext(request);
 if(!context.projectIds.length)return Response.json({projects:[],steps:[],photos:[]});
 const [projects,steps,photos]=await Promise.all([
 context.admin.from('commercial_projects').select('id,name,subtitle,address,status,start_date,next_visit').eq('organization_id',context.organizationId).in('id',context.projectIds),
 context.admin.from('commercial_project_steps').select('project_id,id,label,due_date,done').eq('organization_id',context.organizationId).in('project_id',context.projectIds),
 context.admin.from('commercial_project_photos').select('project_id,id,name,caption,storage_path').eq('organization_id',context.organizationId).in('project_id',context.projectIds)]);
 if(projects.error||steps.error||photos.error)throw new Error('Chantiers indisponibles.');
 const images=[];for(const photo of photos.data||[]){const signed=await context.admin.storage.from('commercial-project-photos').createSignedUrl(photo.storage_path,600);if(signed.data)images.push({project_id:photo.project_id,id:photo.id,caption:photo.caption,url:signed.data.signedUrl});}
 return Response.json({projects:projects.data,steps:steps.data,photos:images});
}catch(error){return error instanceof OrganizationAuthError ? organizationErrorResponse(error) : errorResponse(error,'Chargement des chantiers indisponible. Réessayez dans un instant.');}}
export async function POST(request:Request){const limited=rateLimit(request,'worker-update',40);if(limited)return limited;try{
 const context=await workerContext(request);const body=await readJsonBody<{projectId?:unknown;stepId?:unknown;done?:unknown;photo?:unknown;name?:unknown}>(request,6000000);
 if(typeof body.projectId!=='string'||!context.projectIds.includes(body.projectId))throw new ApiInputError('Ce chantier ne vous est pas affecté.',403);
 if(typeof body.stepId==='string'&&typeof body.done==='boolean'){
 const result=await context.admin.from('commercial_project_steps').update({done:body.done}).eq('organization_id',context.organizationId).eq('project_id',body.projectId).eq('id',body.stepId).select('id').maybeSingle();if(result.error||!result.data)throw new ApiInputError('Tâche introuvable.',404);
 }else if(typeof body.photo==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo)){
 const match=body.photo.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)!;const bytes=Buffer.from(match[2],'base64');if(bytes.length>4000000)throw new ApiInputError('Photo trop volumineuse.');const id=crypto.randomUUID(),path=`${context.organizationId}/${body.projectId}/${id}.${match[1]}`;
 const upload=await context.admin.storage.from('commercial-project-photos').upload(path,bytes,{contentType:`image/${match[1]}`,upsert:false});if(upload.error)throw new Error('Photo non sauvegardée.');
 const count=await context.admin.from('commercial_project_photos').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId).eq('project_id',body.projectId);
 const saved=await context.admin.from('commercial_project_photos').insert({organization_id:context.organizationId,project_id:body.projectId,id,position:count.count||0,name:typeof body.name==='string'?body.name.slice(0,180):'Photo chantier',caption:'Photo terrain',storage_path:path});if(saved.error){await context.admin.storage.from('commercial-project-photos').remove([path]);throw new Error('Photo non sauvegardée.');}
 }else throw new ApiInputError('Modification invalide.');
 const bumped=await context.admin.rpc("manufeo_bump_commercial_revision",{p_organization_id:context.organizationId});if(bumped.error)throw new Error("Modification sauvegardée, synchronisation à vérifier.");
 return Response.json({saved:true});
}catch(error){return error instanceof OrganizationAuthError ? organizationErrorResponse(error) : errorResponse(error,'Mise à jour terrain impossible.');}}
