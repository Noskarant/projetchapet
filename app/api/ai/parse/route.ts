import { NextResponse } from "next/server";

type ParseKind = "customer" | "document";
type PriceType = "ht" | "ttc" | "unknown";

type RawLine = {
  label?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  tax_rate?: unknown;
  price_type?: unknown;
  confidence?: unknown;
};

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/\s/g, "").replace(",", "."))
        : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function cleanTax(value: unknown) {
  const parsed = cleanNumber(value);
  return [0, 5.5, 10, 20].includes(parsed) ? parsed : 0;
}

function cleanPriceType(value: unknown): PriceType {
  return value === "ht" || value === "ttc" ? value : "unknown";
}

function uniqueWarnings(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => cleanText(value, 240)).filter(Boolean))].slice(0, 20);
}

function normalizeCustomer(data: Record<string, unknown>) {
  const kind = data.kind === "individual" ? "individual" : "business";
  const companyName = cleanText(data.company_name, 160);
  const lastName = cleanText(data.last_name, 100);
  const warnings = uniqueWarnings(data.warnings);

  if (kind === "business" && !companyName) {
    warnings.push("La raison sociale n’a pas été clairement dictée.");
  }
  if (kind === "individual" && !lastName) {
    warnings.push("Le nom du particulier n’a pas été clairement dicté.");
  }

  return {
    kind,
    company_name: companyName,
    civility: ["M.", "Mme", "M. et Mme"].includes(cleanText(data.civility))
      ? cleanText(data.civility)
      : "M.",
    last_name: lastName,
    first_name: cleanText(data.first_name, 100),
    siret: cleanText(data.siret, 20).replace(/\D/g, ""),
    vat_number: cleanText(data.vat_number, 24).replace(/\s/g, "").toUpperCase(),
    email1: cleanText(data.email1, 160),
    email2: cleanText(data.email2, 160),
    phone1: cleanText(data.phone1, 40),
    phone2: cleanText(data.phone2, 40),
    line1: cleanText(data.line1, 220),
    postal_code: cleanText(data.postal_code, 10),
    city: cleanText(data.city, 120),
    notes: cleanText(data.notes, 1200),
    warnings: [...new Set(warnings)],
  };
}

function normalizeLine(value: unknown, index: number) {
  const line = (value && typeof value === "object" ? value : {}) as RawLine;
  const taxRate = cleanTax(line.tax_rate);
  const priceType = cleanPriceType(line.price_type);
  const spokenPrice = cleanNumber(line.unit_price);
  const warnings: string[] = [];

  let unitPrice = spokenPrice;
  if (priceType === "ttc") {
    if (taxRate > 0) {
      unitPrice = Math.round((spokenPrice / (1 + taxRate / 100)) * 100) / 100;
    } else {
      warnings.push(
        `Ligne ${index + 1} : prix TTC détecté mais taux de TVA absent, conversion HT impossible.`,
      );
    }
  }

  const label = cleanText(line.label, 240);
  const quantity = cleanNumber(line.quantity);
  if (!label) warnings.push(`Ligne ${index + 1} : désignation manquante.`);
  if (quantity === 0) warnings.push(`Ligne ${index + 1} : quantité absente ou nulle.`);
  if (spokenPrice === 0) warnings.push(`Ligne ${index + 1} : prix unitaire absent ou nul.`);
  if (taxRate === 0 && cleanNumber(line.tax_rate) !== 0) {
    warnings.push(`Ligne ${index + 1} : taux de TVA non reconnu, remis à 0 %.`);
  }

  return {
    item: {
      label,
      description: cleanText(line.description, 500),
      quantity,
      unit: cleanText(line.unit, 30) || "u",
      unit_price: unitPrice,
      tax_rate: taxRate,
      price_type: priceType,
      confidence: Math.min(1, cleanNumber(line.confidence) || 0),
    },
    warnings,
  };
}

function normalizeDocument(data: Record<string, unknown>) {
  const rawItems = Array.isArray(data.items) ? data.items.slice(0, 50) : [];
  const normalized = rawItems.map(normalizeLine);
  const warnings = [
    ...uniqueWarnings(data.warnings),
    ...normalized.flatMap((entry) => entry.warnings),
  ];

  if (normalized.length === 0) {
    warnings.push("Aucune prestation exploitable n’a été détectée.");
  }

  return {
    customer_hint: cleanText(data.customer_hint, 180),
    title: cleanText(data.title, 240),
    notes: cleanText(data.notes, 1800),
    site_address: cleanText(data.site_address, 300),
    items: normalized.map((entry) => entry.item),
    warnings: [...new Set(warnings)].slice(0, 30),
  };
}

function fallbackCustomer(text: string) {
  const emailMatches = [...text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)].map(
    (match) => match[0],
  );
  const phoneMatches = [
    ...text.matchAll(/(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}/g),
  ].map((match) => match[0]);
  const siret =
    text.match(/\b\d{3}[ .]?\d{3}[ .]?\d{3}[ .]?\d{5}\b/)?.[0]?.replace(/\D/g, "") ??
    "";
  const postalCode = text.match(/\b\d{5}\b/)?.[0] ?? "";
  const isBusiness =
    /soci[eé]t[eé]|entreprise|sarl|sas|sasu|eurl|siret|raison sociale/i.test(text);
  const company =
    text.match(
      /(?:soci[eé]t[eé]|entreprise|raison sociale)\s+([^,.;]+?)(?=\s+(?:siret|t[eé]l[eé]phone|adresse|email|e-mail)\b|[,.;]|$)/i,
    )?.[1]?.trim() ?? "";
  const name =
    text.match(/(?:nom)\s+([^,.;]+?)(?=\s+(?:pr[eé]nom|t[eé]l[eé]phone|adresse)\b|[,.;]|$)/i)?.[1]?.trim() ??
    "";
  const firstName =
    text.match(/(?:pr[eé]nom)\s+([^,.;]+?)(?=\s+(?:nom|t[eé]l[eé]phone|adresse)\b|[,.;]|$)/i)?.[1]?.trim() ??
    "";

  return normalizeCustomer({
    kind: isBusiness ? "business" : "individual",
    company_name: company,
    civility: /monsieur et madame|m\. et mme/i.test(text)
      ? "M. et Mme"
      : /madame|mme/i.test(text)
        ? "Mme"
        : "M.",
    last_name: name,
    first_name: firstName,
    siret,
    vat_number: text.match(/FR\s?\d{2}\s?\d{9}/i)?.[0] ?? "",
    email1: emailMatches[0] ?? "",
    email2: emailMatches[1] ?? "",
    phone1: phoneMatches[0] ?? "",
    phone2: phoneMatches[1] ?? "",
    line1:
      text.match(
        /(?:adresse)\s+([^,.;]+?)(?=\s+\d{5}\b|[,.;]|$)/i,
      )?.[1]?.trim() ?? "",
    postal_code: postalCode,
    city: postalCode
      ? text.match(new RegExp(`${postalCode}\\s+([^,.;]+)`, "i"))?.[1]?.trim() ?? ""
      : "",
    notes: "",
    warnings: [
      "Analyse locale simplifiée : ajoutez DEEPSEEK_API_KEY pour une extraction plus robuste.",
    ],
  });
}

function fallbackDocument(text: string) {
  const tax =
    Number(
      text.match(/TVA\s*(?:à|de)?\s*(5[,.]5|10|20|0)\s*%/i)?.[1]?.replace(",", ".") ??
        0,
    ) || 0;
  const chunks = text
    .split(/(?:\.\s+|;\s*|\bensuite\b|\bpuis\b)/i)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 8);

  const items = chunks
    .map((chunk) => {
      const quantityMatch = chunk.match(
        /(\d+(?:[,.]\d+)?)\s*(m2|m²|mètres?\s+carrés?|ml|mètres?\s+linéaires?|heures?|h|unités?|u|forfaits?)/i,
      );
      const priceMatch = chunk.match(
        /(?:à|pour|prix)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)\s*(HT|TTC)?/i,
      );
      if (!quantityMatch && !priceMatch) return null;
      const unitText = quantityMatch?.[2]?.toLowerCase() ?? "u";
      const unit = /m2|m²|carr/.test(unitText)
        ? "m²"
        : /ml|lin/.test(unitText)
          ? "ml"
          : /heure|\bh\b/.test(unitText)
            ? "h"
            : /forfait/.test(unitText)
              ? "forfait"
              : "u";
      const label = chunk
        .replace(quantityMatch?.[0] ?? "", "")
        .replace(priceMatch?.[0] ?? "", "")
        .replace(/^(client|chantier|travaux|ajoute|ligne|prestation)\s+/i, "")
        .trim()
        .replace(/^[-,:]\s*/, "")
        .slice(0, 220);
      return {
        label: label || "Prestation dictée",
        description: "",
        quantity: Number(quantityMatch?.[1]?.replace(",", ".") ?? 1),
        unit,
        unit_price: Number(priceMatch?.[1]?.replace(",", ".") ?? 0),
        tax_rate: tax,
        price_type:
          priceMatch?.[2]?.toLowerCase() === "ttc"
            ? "ttc"
            : priceMatch?.[2]?.toLowerCase() === "ht"
              ? "ht"
              : "unknown",
        confidence: 0.45,
      };
    })
    .filter(Boolean);

  return normalizeDocument({
    customer_hint:
      text.match(/client\s+([^,.;]+?)(?=\s+(?:chantier|travaux|ajoute|préparation)\b|[,.;]|$)/i)?.[1]?.trim() ??
      "",
    title:
      text.match(/(?:objet|chantier|travaux)\s+([^,.;]+)/i)?.[1]?.trim() ??
      "Travaux à préciser",
    notes: text,
    items,
    warnings: [
      "Analyse locale simplifiée : ajoutez DEEPSEEK_API_KEY pour comprendre plusieurs lignes et le vocabulaire métier avec plus de fiabilité.",
    ],
  });
}

function systemPrompt(kind: ParseKind, target: string) {
  if (kind === "customer") {
    return `Tu es un extracteur de données pour un logiciel français de devis et facturation destiné aux artisans.
Transforme une dictée orale en un objet JSON strict. N'invente aucune donnée. Une donnée non prononcée doit rester vide et être signalée dans warnings.
Schéma exact :
{
  "kind":"business|individual",
  "company_name":"",
  "civility":"M.|Mme|M. et Mme",
  "last_name":"",
  "first_name":"",
  "siret":"",
  "vat_number":"",
  "email1":"",
  "email2":"",
  "phone1":"",
  "phone2":"",
  "line1":"",
  "postal_code":"",
  "city":"",
  "notes":"",
  "warnings":[""]
}
Les nombres dictés chiffre par chiffre doivent être réunis sans inventer de chiffre. Réponds uniquement avec le JSON.`;
  }

  return `Tu structures une dictée d'artisan français pour créer un ${target === "invoice" ? "brouillon de facture" : "brouillon de devis"}.
Comprends le vocabulaire BTP et les formulations orales, notamment plâtrerie-peinture, plomberie, électricité, carrelage, menuiserie, couverture, isolation et rénovation : ratissage, rebouchage, ponçage, impression, sous-couche, deux passes, protection, fourniture et pose, dépose, évacuation, m², mètre linéaire, heure, forfait, acompte, franchise, RSE.
N'invente jamais un client, une désignation, une quantité, une unité, un prix ou une TVA. Conserve les termes métier prononcés. Les prix sont HT uniquement si "HT" est explicite ou si aucun type n'est précisé. Si "TTC" est prononcé, mets price_type à "ttc"; la conversion HT sera faite côté serveur seulement si la TVA est explicite.
Chaque prestation distincte doit devenir une ligne séparée.
Schéma exact :
{
  "customer_hint":"",
  "title":"",
  "site_address":"",
  "notes":"",
  "items":[{
    "label":"",
    "description":"",
    "quantity":0,
    "unit":"u|m²|ml|h|forfait",
    "unit_price":0,
    "tax_rate":0,
    "price_type":"ht|ttc|unknown",
    "confidence":0
  }],
  "warnings":[""]
}
confidence est entre 0 et 1. Signale toute ambiguïté dans warnings. Réponds uniquement avec le JSON.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      kind?: ParseKind;
      transcript?: string;
      target?: string;
    };
    const kind = body.kind === "customer" ? "customer" : "document";
    const target = ["customer", "quote", "invoice", "current"].includes(String(body.target))
      ? String(body.target)
      : "quote";
    const transcript = String(body.transcript ?? "").trim().slice(0, 14000);

    if (!transcript) {
      return NextResponse.json({ error: "La dictée est vide." }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        provider: "local-fallback",
        data: kind === "customer" ? fallbackCustomer(transcript) : fallbackDocument(transcript),
      });
    }

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        temperature: 0,
        max_tokens: 3200,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: systemPrompt(kind, target) },
          {
            role: "user",
            content: `Voici la dictée à convertir. Ne tiens compte que des informations explicitement présentes :\n\n${transcript}`,
          },
        ],
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error?.message ?? `DeepSeek API : ${response.status}`);
    }

    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek n’a retourné aucune donnée.");

    const raw = JSON.parse(content) as Record<string, unknown>;
    const data = kind === "customer" ? normalizeCustomer(raw) : normalizeDocument(raw);

    return NextResponse.json({
      provider: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      data,
      usage: result?.usage ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analyse impossible." },
      { status: 500 },
    );
  }
}
