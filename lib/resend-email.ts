export const MANUFEO_DEFAULT_SENDER = "MANUFEO <noreply@manufeo.fr>";

export function resolveManufeoSender(value: string | null | undefined) {
  const normalized = (value ?? "")
    .trim()
    .replace(/^\s*FORGEO\s*(?=<)/i, "MANUFEO ")
    .replace(/^\s*Projet Chapet\s*(?=<)/i, "MANUFEO ");

  // resend.dev est uniquement prévu pour les tests vers l'adresse propriétaire
  // du compte Resend. MANUFEO possède un domaine vérifié : on ne doit jamais
  // utiliser l'expéditeur sandbox pour les documents clients.
  if (!normalized || /@resend\.dev\b/i.test(normalized)) {
    return MANUFEO_DEFAULT_SENDER;
  }

  return normalized;
}

export function resendProviderErrorMessage(status: number, payload: unknown) {
  const message =
    payload && typeof payload === "object" && "message" in payload
      ? String((payload as { message?: unknown }).message ?? "")
      : "";

  if (
    status === 403 &&
    /testing emails|verify a domain|resend\.dev|own email address/i.test(message)
  ) {
    return "Le service e-mail MANUFEO utilise encore un expéditeur de test. Réessayez dans quelques instants ou contactez le support MANUFEO.";
  }

  if (status === 429) {
    return "Le service e-mail reçoit trop de demandes. Réessayez dans quelques instants.";
  }

  return null;
}
