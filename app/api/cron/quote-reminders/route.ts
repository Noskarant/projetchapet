import { runAutomaticQuoteReminders } from '@/lib/automatic-quote-reminders';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({error:'Non autorisé'},{status:401});
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) return Response.json({error:'Relance non configurée'},{status:503});
  try { return Response.json(await runAutomaticQuoteReminders({dryRun:new URL(request.url).searchParams.get('dryRun')==='1'})); }
  catch { return Response.json({error:'Traitement des relances impossible'},{status:500}); }
}
