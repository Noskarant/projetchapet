import type { DocumentFilters } from "@/lib/mobile-commercial-demo";
import type { MobileInvoice, MobileQuote } from "@/lib/mobile-prototype";

declare module "@/lib/mobile-commercial-demo" {
  export function filterBusinessDocuments(
    documents: MobileQuote[] | MobileInvoice[],
    filters: DocumentFilters,
  ): Array<MobileQuote | MobileInvoice>;
}
