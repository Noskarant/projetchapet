/** User-facing guidance; never expose raw device or speech-service errors. */
export function microphoneErrorMessage(error: unknown, userAgent = ''): string | null {
  const name = typeof error === 'string' ? error
    : error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' ? error.name : '';
  const windows = /Windows/i.test(userAgent);
  const inputHelp = windows ? ' Sous Windows : Paramètres → Système → Son → Entrée, choisissez votre micro.' : '';
  const permissionHelp = windows ? ' Vérifiez aussi les autorisations du microphone dans les paramètres de confidentialité Windows.' : '';
  switch (name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return `Aucun microphone détecté. Branchez un micro ou un casque avec micro, puis réessayez.${inputHelp} Vous pouvez aussi écrire votre demande.`;
    case 'NotAllowedError':
    case 'SecurityError':
    case 'not-allowed':
      return `Micro refusé. Autorisez le microphone pour MANUFEO dans les réglages de votre navigateur.${permissionHelp} Vous pouvez aussi écrire votre demande.`;
    case 'NotReadableError':
    case 'TrackStartError':
    case 'audio-capture':
      return `Le micro n’est pas accessible. Vérifiez son branchement et fermez les applications qui pourraient l’utiliser, puis réessayez.${inputHelp} Vous pouvez aussi écrire votre demande.`;
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return `Le micro sélectionné n’est pas compatible avec la dictée. Choisissez un autre micro dans les réglages de votre navigateur, puis réessayez.${inputHelp} Vous pouvez aussi écrire votre demande.`;
    case 'service-not-allowed':
      return 'La dictée du navigateur n’est pas autorisée. Vérifiez ses réglages ou écrivez votre demande.';
    case 'network':
      return 'La dictée du navigateur ne répond pas. Vérifiez votre connexion ou écrivez votre demande.';
    case 'no-speech':
      return 'Aucune voix détectée. Rapprochez-vous du micro puis réessayez, ou écrivez votre demande.';
    case 'AbortError':
    case 'aborted':
      return 'L’ouverture du micro a été interrompue. Réessayez ou écrivez votre demande.';
    default:
      return null;
  }
}
