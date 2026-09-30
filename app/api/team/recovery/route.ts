import { createClient } from '@supabase/supabase-js';
import { requireOrganization,requireRole,publicSiteUrl } from '@/lib/server-organization';
import { ApiInputError,errorResponse,isEmail,rateLimit,readJsonBody } from '@/lib/api-guard';
import { supabasePublicConfig } from '@/lib/supabase-config';
export async function POST(request:Request){const limited=rateLimit(request,'team-recovery',5);if(limited)return limited;try{
 const context=await requireOrganization(request);requireRole(context.role,['owner','admin']);
 const body=await readJsonBody<{email?:unknown}>(request,2000),email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(!isEmail(email))throw new ApiInputError('E-mail invalide.');
 const members=await context.admin.from('organization_members').select('user_id').eq('organization_id',context.organizationId);
 if(members.error)throw new Error('Équipe indisponible.');
 let target:string|null=null;
 for(const member of members.data||[]){const user=await context.admin.auth.admin.getUserById(member.user_id);if(user.data.user?.email?.toLowerCase()===email){target=member.user_id;break;}}
 if(!target)throw new ApiInputError('Ce collaborateur ne dispose pas encore d’un compte dans votre entreprise.',404);
 if(target===context.user.id)throw new ApiInputError('Utilisez les paramètres de votre compte pour vos propres appareils.');
 const revoked=await context.admin.rpc('manufeo_revoke_sessions',{p_user_id:target});if(revoked.error)throw new Error('Révocation impossible.');
 const client=createClient(supabasePublicConfig.url,supabasePublicConfig.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const reset=await client.auth.resetPasswordForEmail(email,{redirectTo:`${publicSiteUrl(request)}/reset-password`});
 if(reset.error)throw new Error('Anciennes sessions révoquées. Le collaborateur peut demander un lien via « Mot de passe oublié ».');
 return Response.json({revoked:true,recoverySent:true});
}catch(error){return errorResponse(error,'Récupération du compte impossible.');}}
