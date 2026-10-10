import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentNumberPrefix = "D" | "F" | "A";

export function nextDocumentNumber(existing: ReadonlyArray<{ number: string }>, prefix: DocumentNumberPrefix, year = new Date().getFullYear()) {
  const canonical = prefix === "D" ? "DEV" : prefix === "F" ? "FAC" : "A";
  const pattern = new RegExp(`^(?:${canonical}|${prefix})-${year}-(\\d+)$`);
  const max = existing.reduce((highest, item) => {
    const suffix = item.number.match(pattern)?.[1];
    const value = suffix ? Number(suffix) : 0;
    return Number.isSafeInteger(value) ? Math.max(highest, value) : highest;
  }, 0);
  return `${canonical}-${year}-${String(max + 1).padStart(3, "0")}`;
}

/** Read-only proposal: archived documents count; the save RPC still allocates atomically. */
export async function readNextDocumentNumber(client: SupabaseClient, organizationId: string, prefix: "D" | "F", pending: ReadonlyArray<{ number: string }> = [], year = new Date().getFullYear()) {
  const numbers = [...pending];
  const size = 1000;
  for (let start = 0; ; start += size) {
    const { data, error } = await client.from(prefix === "D" ? "quotes" : "invoices")
      .select("number").eq("organization_id", organizationId).order("id").range(start, start + size - 1);
    if (error) throw new Error("Le prochain numéro ne peut pas être vérifié pour le moment.");
    numbers.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return nextDocumentNumber(numbers, prefix, year);
}
