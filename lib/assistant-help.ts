export type HelpMessage = { role: 'user' | 'assistant'; content: string };

export const MANUFEO_HELP_KNOWLEDGE = `MANUFEO aide les artisans à préparer des clients, devis, factures, chantiers, rendez-vous et e-mails.
Questions à l’agent : le bouton avec la mascotte est dans la barre du haut, à gauche de la cloche, sur Accueil, Devis, Factures, Clients et Agenda. Il reste disponible après avoir masqué la mascotte flottante. Cliquer dessus, écrire sa question puis Poser la question ; Fermer ou Échap ramène à l’écran précédent.
Créer un devis : ouvrir Créer, puis Devis ou la création IA ; préciser le client, les prestations, quantités, prix HT/TTC et TVA. Les informations absentes restent à compléter.
Importer un document : Créer → Photos ou documents. Joindre photo, PDF ou TXT (six photos/pages maximum), ou ouvrir Copier-coller un devis fournisseur et coller son texte. Préciser le client et les consignes dans Demande à MANUFEO. Préparer le devis avec mes sources, relire, puis Valider et exécuter. Une source ne déclenche pas d’envoi automatique.
Majoration commerciale : le champ Majoration sur les prix HT (%) ou la dictée « ajoute 30 % de marge » augmente les prix HT par multiplication par 1,30. Ce n’est pas un objectif de taux de marge sur le prix de vente. La TVA est ensuite recalculée. La franchise fixe n’est pas majorée. Ne pas compter les totaux du fournisseur comme prestations.
Franchise : « franchise 125 euros TTC » avec TVA à 10 % produit une ligne -113,64 euros HT ; « franchise 125 euros HT » produit -125 euros HT. Sans type HT/TTC ou taux nécessaire, préciser les informations manquantes. Ces exemples de calcul ne déterminent pas le taux légal applicable aux travaux.
Notes Apple : copier puis coller une note dans Note ou photo → client, ou joindre une capture/photo. Relire les coordonnées avant de créer. Le partage direct depuis Apple Notes vers MANUFEO nécessite une future extension iOS ; la publication sur App Store seule ne l’ajoute pas.
Facture : convertir un devis en facture depuis ses actions. La facture doit être vérifiée avant émission. Les factures émises suivent les règles d’archivage et de correction du logiciel.
E-mail : ouvrir le document, puis Envoyer, vérifier le destinataire, objet et message. Un autre destinataire peut être renseigné. L’envoi exige l’action explicite de l’utilisateur ; il utilise les données enregistrées du document.
Photos de chantier : ajouter les photos dans le chantier, sélectionner celles du dossier, puis envoyer le dossier photo au client. L’envoi automatique est une option activée pour le chantier choisi.
Cet espace répond aux questions. Il ne consulte pas les documents du compte, ne crée, modifie ou envoie rien. Pour une action, utiliser Créer avec IA ou les écrans concernés. Ne pas inventer d’état d’envoi, de données client ou de chemin d’interface absent de cette base.`;

export function knownHelpAnswer(question: string): string | null {
  const q = question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (/\b(?:copier|coller|copie|copier-coller|importer|importe)\b/.test(q) && /\b(?:devis|fournisseur|document|photo|pdf)\b/.test(q)) {
    return 'Ouvrez Créer → Photos ou documents. Pour un texte, ouvrez « Copier-coller un devis fournisseur » et collez-le ; pour une photo ou un PDF, utilisez « Joindre des fichiers ». Précisez le client dans votre demande, ajoutez éventuellement une majoration HT, puis préparez le devis. Relisez les prestations et les prix avant de valider.';
  }
  if (/\b(?:marge|majoration|majorer)\b/.test(q)) {
    return 'Pendant la création du devis, indiquez le pourcentage dans « Majoration sur les prix HT (%) », ou dictez « ajoute 30 % de marge ». +30 % transforme 100 € HT en 130 € HT ; la TVA est recalculée ensuite. Il s’agit d’une majoration du prix de base. La franchise reste fixe. Relisez les prix de vente avant de valider.';
  }
  if (/\bfranchise\b/.test(q)) return 'La franchise apparaît sur un poste négatif distinct. Exemple : 125 € TTC avec une TVA de 10 % donne −113,64 € HT ; 125 € HT donne −125 € HT. Les totaux HT, TVA et TTC sont réduits. Précisez HT ou TTC et le taux nécessaire s’ils manquent.';
  if (/apple|\bnotes\b/.test(q)) return 'Depuis Apple Notes, copiez le texte puis collez-le dans « Note ou photo → client », ou joignez une capture/photo. Relisez les coordonnées avant de créer le client. Le partage direct Notes → MANUFEO nécessitera une extension iOS dédiée ; l’App Store seul ne l’active pas.';
  if (/\b(?:envoi|envoyer|destinataire|mail|email)\b/.test(q)) return 'Ouvrez le devis ou la facture, puis « Envoyer ». Vous pouvez modifier le destinataire, l’objet et le message. Vérifiez le document et l’adresse, puis confirmez l’envoi. Cet espace de questions n’envoie pas de document et ne peut pas confirmer un envoi passé.';
  return null;
}
