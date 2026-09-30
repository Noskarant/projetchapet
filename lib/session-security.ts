import { createClient } from '@supabase/supabase-js';
import { supabasePublicConfig } from './supabase-config';
import { ApiInputError } from './api-guard';
/** The signature/user has already been verified by Supabase before this check. */
export async function assertActiveSession(token:string,userId:string){
 const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!serviceKey)return;
 let sessionId:string;
 try{const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));sessionId=claims.session_id;if(typeof sessionId!=='string'||!/^[0-9a-f-]{36}$/i.test(sessionId))throw new Error();}catch{throw new ApiInputError('Session invalide. Reconnectez-vous.',401);}
 const admin=createClient(supabasePublicConfig.url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await admin.rpc('manufeo_session_active',{p_session_id:sessionId,p_user_id:userId});
 if(result.error)throw new ApiInputError('Vérification de session indisponible.',503);
 if(result.data!==true)throw new ApiInputError('Cette session a été révoquée. Reconnectez-vous.',401);
}
