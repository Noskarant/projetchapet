import { customerDisplayName, type MobileCustomer } from "./mobile-prototype";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type PersonIdentity = {
  base: string;
  title: string | null;
  titled: string;
};

const SINGLE_TITLES: Record<string, string> = {
  m: "monsieur",
  mr: "monsieur",
  monsieur: "monsieur",
  mme: "madame",
  madame: "madame",
  mlle: "mademoiselle",
  melle: "mademoiselle",
  mademoiselle: "mademoiselle",
  dr: "docteur",
  docteur: "docteur",
  me: "maitre",
  maitre: "maitre",
};

const COUPLE_TITLES = new Set([
  "m et mme",
  "mme et m",
  "mr et mme",
  "mme et mr",
  "monsieur et madame",
  "madame et monsieur",
]);

function personIdentity(value: string): PersonIdentity {
  const tokens = normalize(value).split(" ").filter(Boolean);

  if ((tokens[0] === "le" || tokens[0] === "la") && /^client/.test(tokens[1] ?? "")) {
    tokens.splice(0, 2);
  } else if (/^client/.test(tokens[0] ?? "")) {
    tokens.shift();
  }

  let title: string | null = null;
  const firstThree = tokens.slice(0, 3).join(" ");
  if (COUPLE_TITLES.has(firstThree)) {
    title = "couple";
    tokens.splice(0, 3);
  } else {
    const canonicalTitle = SINGLE_TITLES[tokens[0] ?? ""];
    if (canonicalTitle) {
      title = canonicalTitle;
      tokens.shift();
    }
  }

  const base = tokens.join(" ").trim();
  return {
    base,
    title,
    titled: [title, base].filter(Boolean).join(" "),
  };
}

function customerIdentity(customer: MobileCustomer): PersonIdentity {
  const displayName = customerDisplayName(customer);
  if (customer.kind === "Particulier") return personIdentity(displayName);
  const base = normalize(displayName);
  return { base, title: null, titled: base };
}

function titlesAreCompatible(hint: PersonIdentity, customer: PersonIdentity) {
  return !hint.title || !customer.title || hint.title === customer.title;
}

export type CustomerMatchResult =
  | { status: "missing"; matches: [] }
  | { status: "not_found"; matches: [] }
  | { status: "ambiguous"; matches: MobileCustomer[] }
  | { status: "matched"; matches: [MobileCustomer] };

export function matchMobileCustomer(customers: MobileCustomer[], hint: string | null | undefined): CustomerMatchResult {
  const normalizedHint = normalize(hint ?? "");
  if (!normalizedHint) return { status: "missing", matches: [] };

  const rawExact = customers.filter((customer) => normalize(customerDisplayName(customer)) === normalizedHint);
  if (rawExact.length === 1) return { status: "matched", matches: [rawExact[0]] };
  if (rawExact.length > 1) return { status: "ambiguous", matches: rawExact };

  const hintIdentity = personIdentity(hint ?? "");
  if (!hintIdentity.base) return { status: "missing", matches: [] };

  if (hintIdentity.title) {
    const titledExact = customers.filter((customer) => {
      const identity = customerIdentity(customer);
      return identity.titled === hintIdentity.titled;
    });
    if (titledExact.length === 1) return { status: "matched", matches: [titledExact[0]] };
    if (titledExact.length > 1) return { status: "ambiguous", matches: titledExact };
  }

  const exact = customers.filter((customer) => {
    const identity = customerIdentity(customer);
    return identity.base === hintIdentity.base && titlesAreCompatible(hintIdentity, identity);
  });
  if (exact.length === 1) return { status: "matched", matches: [exact[0]] };
  if (exact.length > 1) return { status: "ambiguous", matches: exact };

  const partial = customers.filter((customer) => {
    const identity = customerIdentity(customer);
    if (!titlesAreCompatible(hintIdentity, identity)) return false;
    return identity.base.includes(hintIdentity.base) || hintIdentity.base.includes(identity.base);
  });

  if (partial.length === 1) return { status: "matched", matches: [partial[0]] };
  if (partial.length > 1) return { status: "ambiguous", matches: partial };
  return { status: "not_found", matches: [] };
}
