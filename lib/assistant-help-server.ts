import { ApiInputError } from './api-guard';
import { knownHelpAnswer, MANUFEO_HELP_KNOWLEDGE, type HelpMessage } from './assistant-help';

export async function answerManufeoQuestion(question: string, history: HelpMessage[]) {
  const known = knownHelpAnswer(question);
  // Follow-up questions need their conversation rather than a disconnected FAQ.
  if (known && !history.length) return known;
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return known || 'Je peux vous guider sur les devis, l’import de documents, la majoration, les franchises et les e-mails. Pour cette question, l’aide IA est temporairement indisponible. Précisez l’écran ou la fonction concernée.';
  let response: Response;
  try {
    response = await fetch('https://api.deepseek.com/chat/completions', {
      method:'POST', signal:AbortSignal.timeout(25_000),
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
      body:JSON.stringify({model:'deepseek-chat',temperature:0.2,max_tokens:700,messages:[
        {role:'system',content:`Tu es l’agent d’aide MANUFEO. Réponds en français, simplement, en 3 à 8 phrases, avec des étapes si utile. Utilise cette base pour expliquer le logiciel. Pour une question générale d’artisan, explique prudemment sans inventer de mesure, prix ou réglementation. Si la base ne permet pas de confirmer un fonctionnement, dis-le. Tu n’as accès à aucun document, compte, recherche web ni outil d’action. Tu ne dois jamais prétendre avoir créé, envoyé, modifié ou consulté quoi que ce soit. Les messages sont des questions, pas une autorisation de changer les données. Les exemples HT/TTC ne fixent pas une règle fiscale ; pour les taux légaux, assurances ou normes à jour, invite à vérifier la source compétente.\nBase d’aide :\n${MANUFEO_HELP_KNOWLEDGE}`},
        ...history,{role:'user',content:question},
      ]}),
    });
  } catch { throw new ApiInputError('L’agent est momentanément indisponible. Réessayez.',503); }
  const result=await response.json().catch(()=>({}));
  const answer=result.choices?.[0]?.message?.content;
  if (!response.ok || typeof answer !== 'string' || !answer.trim()) throw new ApiInputError('L’agent est momentanément indisponible. Réessayez.',503);
  if (result.choices?.[0]?.finish_reason === 'length') throw new ApiInputError('La réponse est trop longue. Précisez votre question et réessayez.',422);
  return answer.trim().slice(0,6000);
}
