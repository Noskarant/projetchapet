import { ApiInputError, errorResponse, rateLimit, readJsonBody, requireString } from '@/lib/api-guard';
import { authenticateRequest, requireOrganization } from '@/lib/server-auth';
import { answerManufeoQuestion } from '@/lib/assistant-help-server';
import type { HelpMessage } from '@/lib/assistant-help';

export const runtime='nodejs';
export const maxDuration=35;

export async function POST(request: Request) {
  const limited=rateLimit(request,'manufeo-help',15);
  if (limited) return limited;
  try {
    const context=await authenticateRequest(request);
    const body=await readJsonBody<{organizationId?:unknown;question?:unknown;history?:unknown}>(request,30_000);
    const organizationId=requireString(body.organizationId,'Entreprise',80);
    requireOrganization(context,organizationId);
    const question=requireString(body.question,'Question',2000);
    const history: HelpMessage[]=[];
    if (body.history !== undefined && !Array.isArray(body.history)) throw new ApiInputError('Conversation invalide.');
    for (const raw of (body.history as unknown[] | undefined)?.slice(-8) || []) {
      if (!raw || typeof raw !== 'object') throw new ApiInputError('Conversation invalide.');
      const value=raw as Record<string,unknown>;
      if (value.role !== 'user' && value.role !== 'assistant') throw new ApiInputError('Conversation invalide.');
      history.push({role:value.role,content:requireString(value.content,'Message',6000)});
    }
    if (history.reduce((sum,message)=>sum+message.content.length,0)>12_000) throw new ApiInputError('Conversation trop longue. Ouvrez une nouvelle conversation.',413);
    const answer=await answerManufeoQuestion(question,history);
    return Response.json({answer},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error,'L’agent n’a pas pu répondre. Réessayez.');}
}
