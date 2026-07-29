import { NextResponse } from "next/server";

type ParseKind = "customer" | "document";

function fallbackCustomer(text: string) {
  const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? "";
  const phone = text.match(/(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}/)?.[0] ?? "";
  const siret = text.match(/\b\d{3}[ .]?\d{3}[ .]?\d{3}[ .]?\d{5}\b/)?.[0]?.replace(/\D/g, "") ?? "";
  const postalCode = text.match(/\b\d{5}\b/)?.[0] ?? "";
  const isBusiness = /soci[eé]t[eé]|entreprise|sarl|sas|sasu|eurl|siret|raison sociale/i.test(text);
  const company = text.match(/(?:soci[eé]t[eé]|entreprise|raison sociale)\s+([^,.;]+)/i)?.[1]?.trim() ?? "";
  const lastName = text.match(/(?:nom)\s+([^,.;]+)/i)?.[1]?.trim().split(/\s+/)[0] ?? "";
  const firstName = text.match(/(?:pr[eé]nom)\s+([^,.;]+)/i)?.[1]?.trim().split(/\s+/)[0] ?? "";
  return {
    kind: isBusiness ? "business" : "individual",
    company_name: company,
    civility: /madame|mme/i.test(text) ? "Mme" : /monsieur et madame|m\. et mme/i.test(text) ? "M. et Mme" : "M.",
    last_name: lastName,
    first_name: firstName,
    siret,
    vat_number: text.match(/FR\s?\d{2}\s?\d{9}/i)?.[0]?.replace(/\s/g, "") ?? "",
    email1: email,
    email2: "",
    phone1: phone,
    phone2: "",
    line1: text.match(/(?:adresse)\s+([^,.;]+)/i)?.[1]?.trim() ?? "",
    postal_code: postalCode,
    city: text.match(new RegExp(`${postalCode}\\s+([^,.;]+)`, "i"))?.[1]?.trim() ?? "",
    notes: "",
    warnings: ["Analyse locale simplifiée : vérifiez chaque champ avant l’enregistrement."],
  };
}

function fallbackDocument(text: string) {
  const amounts = [...text.matchAll(/(\d+(?:[,.]\d+)?)\s*(?:€|euros?)/gi)].map((match) => Number(match[1].replace(",", ".")));
  const quantity = Number(text.match(/(\d+(?:[,.]\d+)?)\s*(m2|m²|ml|mètre|mètres|unités?)/i)?.[1]?.replace(",", ".") ?? 1);
  const tax = Number(text.match(/TVA\s*(?:à|de)?\s*(\d+(?:[,.]\d+)?)\s*%/i)?.[1]?.replace(",", ".") ?? 20);
  return {
    customer_hint: text.match(/client\s+([^,.;]+)/i)?.[1]?.trim() ?? "",
    title: text.match(/(?:objet|chantier|travaux)\s+([^,.;]+)/i)?.[1]?.trim() ?? "Travaux à préciser",
    notes: text,
    items: [{
      label: text.match(/(?:ajoute|ligne|prestation)\s+([^,.;]+)/i)?.[1]?.trim() ?? "Prestation dictée",
      description: "",
      quantity,
      unit: /m2|m²/i.test(text) ? "m²" : /ml/i.test(text) ? "ml" : "u",
      unit_price: amounts.at(-1) ?? 0,
      tax_rate: tax,
    }],
    warnings: ["Analyse locale simplifiée : contrôlez la désignation, la quantité, le prix et la TVA."],
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { kind?: ParseKind; transcript?: string };
    const kind = body.kind === "customer" ? "customer" : "document";
    const transcript = String(body.transcript ?? "").trim();
    if (!transcript) return NextResponse.json({ error: "La dictée est vide." }, { status: 400 });

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ provider: "local-fallback", data: kind === "customer" ? fallbackCustomer(transcript) : fallbackDocument(transcript) });
    }

    const customerSchema = `{
      "kind":"business|individual", "company_name":"", "civility":"M.|Mme|M. et Mme",
      "last_name":"", "first_name":"", "siret":"", "vat_number":"", "email1":"", "email2":"",
      "phone1":"", "phone2":"", "line1":"", "postal_code":"", "city":"", "notes":"",
      "warnings":["champ incertain ou manquant"]
    }`;
    const documentSchema = `{
      "customer_hint":"", "title":"", "notes":"",
      "items":[{"label":"", "description":"", "quantity":1, "unit":"u|m²|ml|h|forfait", "unit_price":0, "tax_rate":20}],
      "warnings":["valeur incertaine ou information à confirmer"]
    }`;

    const system = kind === "customer"
      ? `Tu extrais les coordonnées d'un client français à partir d'une dictée d'artisan. Réponds uniquement en JSON valide conforme à ce schéma : ${customerSchema}. N'invente aucune donnée. Laisse une chaîne vide et ajoute un warning si une information n'est pas explicitement dictée.`
      : `Tu structures un devis de bâtiment français depuis une dictée. Tu dois comprendre le vocabulaire des plâtriers-peintres et artisans : ratissage, impression, sous-couche, deux passes, m², mètre linéaire, forfait, préparation des supports, protection, fourniture et pose, franchise, RSE, TVA 5,5/10/20. Réponds uniquement en JSON valide conforme à ce schéma : ${documentSchema}. Ne crée jamais un prix, une quantité ou un taux non prononcé. Une valeur absente doit être 0 ou vide avec un warning. Les prix sont HT sauf mention explicite TTC ; si un prix TTC est dicté, indique-le dans description et calcule le prix HT uniquement si le taux de TVA est explicite.`;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Dictée à analyser en JSON : ${transcript}` },
        ],
      }),
    });

    if (!response.ok) throw new Error(`DeepSeek API : ${response.status}`);
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek n’a retourné aucune donnée.");
    return NextResponse.json({ provider: "deepseek-v4-flash", data: JSON.parse(content) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analyse impossible." }, { status: 500 });
  }
}
