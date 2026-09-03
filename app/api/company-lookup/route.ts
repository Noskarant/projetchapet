import { NextResponse } from "next/server";
import { selectGovernmentCompany } from "@/lib/company-lookup";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siret = (url.searchParams.get("siret") ?? "").replace(/\D/g, "");
  if (siret.length !== 14) {
    return NextResponse.json({ error: "Le SIRET doit contenir 14 chiffres." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(siret)}&per_page=5`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 86_400 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Le registre des entreprises est temporairement indisponible." }, { status: 502 });
    }
    const payload = await response.json() as { results?: unknown };
    const company = selectGovernmentCompany(payload.results, siret);
    if (!company) return NextResponse.json({ error: "Aucune entreprise active trouvée pour ce SIRET." }, { status: 404 });
    return NextResponse.json({ company, source: "recherche-entreprises.api.gouv.fr" });
  } catch {
    return NextResponse.json({ error: "La recherche SIRET n’a pas pu aboutir." }, { status: 502 });
  }
}
