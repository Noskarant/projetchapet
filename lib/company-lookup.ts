export type CompanyLookupResult = {
  companyName: string;
  siret: string;
  siren: string;
  vatNumber: string;
  address: string;
  postalCode: string;
  city: string;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeGovernmentCompanyResult(value: unknown, establishment?: unknown): CompanyLookupResult | null {
  const company = record(value);
  const siege = record(establishment ?? company.siege);
  const tva = Array.isArray(company.tva) ? company.tva.map(text).find(Boolean) ?? "" : text(company.numero_tva_intracommunautaire);
  const companyName = text(company.nom_raison_sociale) || text(company.nom_complet) || text(company.nom_commercial);
  const siret = text(siege.siret).replace(/\D/g, "");
  if (!companyName || siret.length !== 14) return null;

  return {
    companyName,
    siret,
    siren: text(company.siren).replace(/\D/g, "").slice(0, 9),
    vatNumber: tva.replace(/\s/g, "").toUpperCase(),
    address: text(siege.adresse) || text(siege.adresse_complete),
    postalCode: text(siege.code_postal),
    city: text(siege.libelle_commune) || text(siege.commune) || text(siege.ville),
  };
}

export function selectGovernmentCompany(results: unknown, requestedSiret: string): CompanyLookupResult | null {
  if (!Array.isArray(results)) return null;
  const normalized = results.flatMap(value => {
    const company=record(value);
    const establishments=Array.isArray(company.matching_etablissements)?company.matching_etablissements:[];
    return [normalizeGovernmentCompanyResult(value),...establishments.map(establishment=>normalizeGovernmentCompanyResult(value,establishment))];
  }).filter((item): item is CompanyLookupResult => item !== null);
  return normalized.find((item) => item.siret === requestedSiret) ?? null;
}

export function companyLookupQuery(value: string, mode: 'name'|'siret'|'rcs') {
  const input=value.trim();
  if(mode==='name'){
    if(input.length<2||input.length>180)throw new Error('Indiquez au moins deux caractères du nom de l’entreprise.');
    return input;
  }
  const digits=input.replace(/\D/g,'');
  if(digits.length!==(mode==='siret'?14:9))throw new Error(mode==='siret'?'Le SIRET doit contenir 14 chiffres.':'Le numéro RCS/SIREN doit contenir 9 chiffres.');
  return digits;
}
