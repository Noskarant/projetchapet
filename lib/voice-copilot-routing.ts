export function isStandaloneTradeAnalysis(text: string) {
  const request = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const asksForAnalysis = /\b(?:analyse|analyser|chiffrage|chiffre|chiffrer|estime|estimer)\b/.test(request);
  const refersToWork = /\b(?:chantier|travaux|prestation|renovation)\b/.test(request);
  const alsoCreatesRecords = /\b(?:cree|creer|ajoute|ajouter|planifie|planifier|facture|client|rendez-vous|devis)\b/.test(request);
  return asksForAnalysis && refersToWork && !alsoCreatesRecords;
}
