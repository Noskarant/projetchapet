import {
  interpretUpholsteryDecoratorDescription,
  normalizeUpholsteryDecoratorAiInterpretation,
} from "./upholstery-decorator";

export function normalizeUpholsteryNaturalPhrasing(description: string) {
  return description
    .replace(/\bje\s+viens\s+(?:les?|la|le|l['’])?\s*chercher\b/gi, "je viens chercher")
    .replace(/\b(?:on|nous)\s+vient\s+(?:les?|la|le|l['’])?\s*chercher\b/gi, "nous récupérons")
    .replace(/\b(tissu|galon|passementerie|passepoil)\s+(?:est\s+)?fourni(?:e)?\s+par\s+(?:moi|nous|l['’]?atelier|l['’]?artisan)\b/gi, "je fournis $1")
    .replace(/\b(tissu|galon|passementerie|passepoil)\s+(?:est\s+)?fourni(?:e)?\s+par\s+(?:le|la)\s+client(?:e)?\b/gi, "$1 fourni par le client")
    .replace(/\bje\s+ramene\s+(?:les?|la|le)\b/gi, "je rapporte")
    .replace(/\bje\s+les\s+ramene\b/gi, "je rapporte");
}

export function interpretUpholsteryForPack(description: string) {
  return interpretUpholsteryDecoratorDescription(normalizeUpholsteryNaturalPhrasing(description));
}

export function normalizeUpholsteryAiForPack(description: string, raw: unknown) {
  return normalizeUpholsteryDecoratorAiInterpretation(normalizeUpholsteryNaturalPhrasing(description), raw);
}
