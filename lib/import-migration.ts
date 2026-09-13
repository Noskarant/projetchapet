export type ImportEntityType = "customers" | "catalog";
export type ImportSourceSystem = "generic" | "tolteck" | "obat" | "costructor" | "ebp" | "other";

export type ImportPreviewRow = {
  rowIndex: number;
  sourceId: string | null;
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown>;
  validationErrors: string[];
};

export type ImportPreview = {
  entityType: ImportEntityType;
  delimiter: string;
  headers: string[];
  mapping: Record<string, string>;
  rows: ImportPreviewRow[];
};

const CUSTOMER_ALIASES: Record<string, string[]> = {
  source_id: ["id", "identifiant", "idclient", "clientid", "reference", "ref"],
  company_name: ["raisonsociale", "societe", "entreprise", "nomentreprise", "company", "companyname"],
  last_name: ["nom", "nomclient", "lastname", "surname"],
  first_name: ["prenom", "firstname", "givenname"],
  siret: ["siret", "numsiret", "numerosiret"],
  vat_number: ["tva", "numerotva", "tvaintracommunautaire", "vat", "vatnumber"],
  email: ["email", "mail", "courriel", "emailprincipal", "e-mail"],
  phone: ["telephone", "tel", "mobile", "portable", "phone"],
  line1: ["adresse", "adresse1", "rue", "address", "address1"],
  postal_code: ["codepostal", "cp", "zipcode", "postalcode"],
  city: ["ville", "city", "commune"],
  notes: ["notes", "note", "commentaire", "commentaires", "memo"],
};

const CATALOG_ALIASES: Record<string, string[]> = {
  source_id: ["id", "identifiant", "idarticle", "articleid", "reference", "ref", "code"],
  label: ["designation", "libelle", "article", "prestation", "ouvrage", "label", "nom"],
  description: ["description", "detail", "details"],
  unit: ["unite", "unit", "u"],
  unit_price: ["prixunitaire", "prixvente", "prixht", "puht", "tarif", "unitprice", "price"],
  cost_price: ["prixachat", "cout", "coutunitaire", "cost", "costprice"],
  tax_rate: ["tva", "tauxtva", "vat", "taxrate"],
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

export function detectDelimiter(text: string) {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
  const candidates = [";", ",", "\t"];
  return candidates.sort((a, b) => countDelimiter(firstLine, b) - countDelimiter(firstLine, a))[0] ?? ";";
}

export function parseDelimitedText(text: string, delimiter = detectDelimiter(text)) {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function bestMapping(headers: string[], aliases: Record<string, string[]>) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping: Record<string, string> = {};
  for (const [field, values] of Object.entries(aliases)) {
    const normalizedAliases = values.map(normalizeHeader);
    const index = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
    if (index >= 0) mapping[field] = headers[index];
  }
  return mapping;
}

export function inferImportEntityType(headers: string[]): ImportEntityType {
  const normalized = headers.map(normalizeHeader);
  const customerSignals = ["siret", "email", "telephone", "raisonsociale", "codepostal", "ville"];
  const catalogSignals = ["designation", "libelle", "article", "prestation", "ouvrage", "prixunitaire", "prixvente", "tarif"];
  const customerScore = customerSignals.filter((signal) => normalized.includes(signal)).length;
  const catalogScore = catalogSignals.filter((signal) => normalized.includes(signal)).length;
  return catalogScore > customerScore ? "catalog" : "customers";
}

function finiteNumber(value: string) {
  if (!value.trim()) return null;
  const cleaned = value.replace(/\s/g, "").replace(/€/g, "").replace("%", "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function read(raw: Record<string, string>, mapping: Record<string, string>, field: string) {
  const header = mapping[field];
  return header ? String(raw[header] ?? "").trim() : "";
}

function normalizeCustomer(raw: Record<string, string>, mapping: Record<string, string>) {
  const companyName = read(raw, mapping, "company_name");
  const lastName = read(raw, mapping, "last_name");
  const firstName = read(raw, mapping, "first_name");
  const email = read(raw, mapping, "email").toLowerCase();
  const phone = read(raw, mapping, "phone");
  const siret = read(raw, mapping, "siret").replace(/\D/g, "");
  const errors: string[] = [];
  if (!companyName && !lastName) errors.push("Nom ou raison sociale manquant.");
  if (siret && siret.length !== 14) errors.push("SIRET invalide.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("E-mail invalide.");

  return {
    data: {
      kind: companyName ? "business" : "individual",
      company_name: companyName,
      last_name: lastName,
      first_name: firstName,
      siret,
      vat_number: read(raw, mapping, "vat_number").replace(/\s/g, "").toUpperCase(),
      email,
      phone,
      line1: read(raw, mapping, "line1"),
      postal_code: read(raw, mapping, "postal_code"),
      city: read(raw, mapping, "city"),
      notes: read(raw, mapping, "notes"),
    },
    errors,
  };
}

function normalizeCatalog(raw: Record<string, string>, mapping: Record<string, string>) {
  const label = read(raw, mapping, "label");
  const unitPrice = finiteNumber(read(raw, mapping, "unit_price"));
  const costPrice = finiteNumber(read(raw, mapping, "cost_price"));
  const taxRate = finiteNumber(read(raw, mapping, "tax_rate"));
  const errors: string[] = [];
  if (!label) errors.push("Désignation manquante.");
  if (read(raw, mapping, "unit_price") && unitPrice === null) errors.push("Prix de vente invalide.");
  if (read(raw, mapping, "tax_rate") && taxRate === null) errors.push("TVA invalide.");

  return {
    data: {
      label,
      description: read(raw, mapping, "description"),
      unit: read(raw, mapping, "unit"),
      unit_price: unitPrice,
      cost_price: costPrice,
      tax_rate: taxRate,
    },
    errors,
  };
}

export function buildImportPreview(text: string, requestedType?: ImportEntityType): ImportPreview {
  if (text.length > 2_000_000) throw new Error("Fichier trop volumineux pour la prévisualisation.");
  const delimiter = detectDelimiter(text);
  const table = parseDelimitedText(text, delimiter);
  if (table.length < 2) throw new Error("Le fichier doit contenir une ligne d’en-tête et au moins une donnée.");
  const headers = table[0].map((header, index) => header.trim() || `Colonne ${index + 1}`);
  if (headers.length > 100) throw new Error("Le fichier contient trop de colonnes.");
  if (table.length - 1 > 5_000) throw new Error("La prévisualisation est limitée à 5 000 lignes par import.");

  const entityType = requestedType ?? inferImportEntityType(headers);
  const mapping = bestMapping(headers, entityType === "customers" ? CUSTOMER_ALIASES : CATALOG_ALIASES);
  const rows = table.slice(1).map((cells, rowOffset) => {
    const rawData = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const normalized = entityType === "customers" ? normalizeCustomer(rawData, mapping) : normalizeCatalog(rawData, mapping);
    const sourceId = read(rawData, mapping, "source_id") || null;
    return {
      rowIndex: rowOffset + 1,
      sourceId,
      rawData,
      normalizedData: normalized.data,
      validationErrors: normalized.errors,
    };
  });

  return { entityType, delimiter, headers, mapping, rows };
}
