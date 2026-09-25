import { getActiveOrganizationId } from "./project-chapet";
import { normalizeQuoteMetaMap, QUOTE_META_STORAGE_KEY, type QuoteInternalMeta } from "./mobile-quote-preview";
import { supabase } from "./supabase";

export async function loadPrivateQuoteMeta(storage: Pick<Storage, "getItem" | "setItem">) {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase.from("quote_private_meta")
    .select("quote_number, internal_notes, discount_percent")
    .eq("organization_id", organizationId);
  if (error) throw error;
  let existing: Record<string, QuoteInternalMeta> = {};
  try { existing = normalizeQuoteMetaMap(JSON.parse(storage.getItem(QUOTE_META_STORAGE_KEY) || "{}")); }
  catch { /* Une copie locale endommagée ne bloque pas le chargement du cloud. */ }
  const cloud = Object.fromEntries((data ?? []).map((row) => [String(row.quote_number), {
    internalNotes: String(row.internal_notes ?? ""), discountPercent: Number(row.discount_percent ?? 0),
  }]));
  storage.setItem(QUOTE_META_STORAGE_KEY, JSON.stringify({ ...existing, ...cloud }));
  return cloud as Record<string, QuoteInternalMeta>;
}

export async function savePrivateQuoteMeta(number: string, meta: QuoteInternalMeta) {
  if (!number.trim()) return;
  const organizationId = await getActiveOrganizationId();
  const { error } = await supabase.from("quote_private_meta").upsert({
    organization_id: organizationId,
    quote_number: number.trim().slice(0, 80),
    internal_notes: meta.internalNotes.slice(0, 5000),
    discount_percent: meta.discountPercent,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,quote_number" });
  if (error) throw error;
}
