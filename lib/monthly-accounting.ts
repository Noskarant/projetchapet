export type AccountingInvoice = {
  number: string;
  issue_date: string;
  status: string;
  subtotal: number;
  tax_total: number;
  total: number;
  customer?: { company_name?: string | null; last_name?: string | null; first_name?: string | null } | null;
};

export function previousCalendarMonth(today: Date) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const first = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { first, next, label: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T12:00:00Z`)) };
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/^([\s]*[=+\-@])/u, "'$1");
  return `"${text.replaceAll('"', '""')}"`;
}

export function monthlyInvoiceCsv(invoices: AccountingInvoice[]) {
  const rows = [["Facture", "Émission", "Client", "Statut", "Sous-total HT", "TVA", "Total TTC"],
    ...invoices.map((invoice) => [
      invoice.number, invoice.issue_date,
      invoice.customer?.company_name || [invoice.customer?.first_name, invoice.customer?.last_name].filter(Boolean).join(" "),
      invoice.status, Number(invoice.subtotal).toFixed(2), Number(invoice.tax_total).toFixed(2), Number(invoice.total).toFixed(2),
    ])];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
