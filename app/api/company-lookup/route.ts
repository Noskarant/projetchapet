import { NextResponse } from "next/server";
import { companyLookupQuery, normalizeGovernmentCompanyResult, selectGovernmentCompany } from "@/lib/company-lookup";
import { rateLimit } from '@/lib/api-guard';

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limited=rateLimit(request,'company-lookup',30);if(limited)return limited;
  const mode=url.searchParams.has('siret')?'siret':url.searchParams.get('mode')||'name';
  if(!['name','siret','rcs'].includes(mode))return NextResponse.json({error:'Type de recherche invalide.'},{status:400});
  let query:string;
  try{query=companyLookupQuery(url.searchParams.get('siret')||url.searchParams.get('q')||'',mode as 'name'|'siret'|'rcs');}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Recherche invalide.'},{status:400});}

  try {
    const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query)}&per_page=8`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 86_400 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Le registre des entreprises est temporairement indisponible." }, { status: 502 });
    }
    const payload = await response.json() as { results?: unknown };
    const companies=mode==='siret'?[selectGovernmentCompany(payload.results,query)].filter(Boolean)
      :(Array.isArray(payload.results)?payload.results:[]).map(value=>normalizeGovernmentCompanyResult(value)).filter(company=>company && (mode!=='rcs'||company.siren===query));
    if (!companies.length) return NextResponse.json({ error: "Aucune entreprise trouvée pour cette recherche." }, { status: 404 });
    return NextResponse.json({ companies, company:companies.length===1?companies[0]:null, source: "recherche-entreprises.api.gouv.fr" });
  } catch {
    return NextResponse.json({ error: "La recherche d’entreprise n’a pas pu aboutir." }, { status: 502 });
  }
}
