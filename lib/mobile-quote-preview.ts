import type { LineItem, MobileQuote, MobileWorkspace } from "./mobile-prototype";

export const QUOTE_META_STORAGE_KEY = "projetchapet-mobile-quote-meta-v1";

export type QuoteInternalMeta = {
  discountPercent: number;
  internalNotes: string;
};

export type QuotePreviewTotals = {
  grossSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  subtotal: number;
  taxTotal: number;
  total: number;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function normalizeDiscountPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, round(parsed)));
}

export function calculateQuotePreviewTotals(
  items: LineItem[],
  discountPercent: number,
): QuotePreviewTotals {
  const normalizedDiscount = normalizeDiscountPercent(discountPercent);
  const multiplier = 1 - normalizedDiscount / 100;
  const grossSubtotal = round(
    items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0,
    ),
  );
  const grossTax = round(
    items.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity || 0) *
          Number(item.unitPrice || 0) *
          (Number(item.taxRate || 0) / 100),
      0,
    ),
  );
  const discountAmount = round(grossSubtotal * (normalizedDiscount / 100));
  const subtotal = round(grossSubtotal - discountAmount);
  const taxTotal = round(grossTax * multiplier);

  return {
    grossSubtotal,
    discountPercent: normalizedDiscount,
    discountAmount,
    subtotal,
    taxTotal,
    total: round(subtotal + taxTotal),
  };
}

function parseMetaMap(raw: string | null): Record<string, QuoteInternalMeta> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<QuoteInternalMeta>>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([number, value]) => [
        number,
        {
          discountPercent: normalizeDiscountPercent(value?.discountPercent),
          internalNotes:
            typeof value?.internalNotes === "string" ? value.internalNotes : "",
        },
      ]),
    );
  } catch {
    return {};
  }
}

export function readQuoteInternalMeta(
  storage: StorageReader,
  quoteNumber: string,
): QuoteInternalMeta {
  const map = parseMetaMap(storage.getItem(QUOTE_META_STORAGE_KEY));
  return (
    map[quoteNumber] ?? {
      discountPercent: 0,
      internalNotes: "",
    }
  );
}

export function writeQuoteInternalMeta(
  storage: StorageWriter,
  quoteNumber: string,
  meta: QuoteInternalMeta,
) {
  const key = quoteNumber.trim();
  if (!key) return;
  const map = parseMetaMap(storage.getItem(QUOTE_META_STORAGE_KEY));
  map[key] = {
    discountPercent: normalizeDiscountPercent(meta.discountPercent),
    internalNotes: meta.internalNotes.trimStart(),
  };
  storage.setItem(QUOTE_META_STORAGE_KEY, JSON.stringify(map));
}

export function parseMobileWorkspace(raw: string | null): MobileWorkspace | null {
  if (!raw) return null;
  try {
    const workspace = JSON.parse(raw) as MobileWorkspace;
    if (
      !workspace ||
      !Array.isArray(workspace.customers) ||
      !Array.isArray(workspace.quotes) ||
      !Array.isArray(workspace.invoices) ||
      !Array.isArray(workspace.agenda)
    ) {
      return null;
    }
    return workspace;
  } catch {
    return null;
  }
}

export function findQuoteByNumber(
  workspace: MobileWorkspace | null,
  quoteNumber: string,
): MobileQuote | null {
  return workspace?.quotes.find((quote) => quote.number === quoteNumber) ?? null;
}
