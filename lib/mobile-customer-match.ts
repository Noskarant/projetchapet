import { customerDisplayName, type MobileCustomer } from "./mobile-prototype";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type CustomerMatchResult =
  | { status: "missing"; matches: [] }
  | { status: "not_found"; matches: [] }
  | { status: "ambiguous"; matches: MobileCustomer[] }
  | { status: "matched"; matches: [MobileCustomer] };

export function matchMobileCustomer(customers: MobileCustomer[], hint: string | null | undefined): CustomerMatchResult {
  const normalizedHint = normalize(hint ?? "");
  if (!normalizedHint) return { status: "missing", matches: [] };

  const exact = customers.filter((customer) => normalize(customerDisplayName(customer)) === normalizedHint);
  if (exact.length === 1) return { status: "matched", matches: [exact[0]] };
  if (exact.length > 1) return { status: "ambiguous", matches: exact };

  const partial = customers.filter((customer) => {
    const name = normalize(customerDisplayName(customer));
    return name.includes(normalizedHint) || normalizedHint.includes(name);
  });

  if (partial.length === 1) return { status: "matched", matches: [partial[0]] };
  if (partial.length > 1) return { status: "ambiguous", matches: partial };
  return { status: "not_found", matches: [] };
}
