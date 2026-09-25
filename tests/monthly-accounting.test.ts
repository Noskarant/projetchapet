import assert from "node:assert/strict";
import test from "node:test";
import { monthlyInvoiceCsv, previousCalendarMonth } from "../lib/monthly-accounting";

test("le relevé prend le mois précédent y compris en janvier", () => {
  assert.deepEqual(previousCalendarMonth(new Date("2027-01-02T07:00:00Z")), {
    first: "2026-12-01", next: "2027-01-01", label: "décembre 2026",
  });
});

test("l’export CSV conserve les décimales, les clients et neutralise les formules", () => {
  const csv = monthlyInvoiceCsv([{ number: "FAC-001", issue_date: "2026-08-31", status: "paid", subtotal: 18.5, tax_total: 1.85, total: 20.35, customer: { company_name: "=HYPERLINK(\"bad\")" } }]);
  assert.match(csv, /"18\.50";"1\.85";"20\.35"/);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
});
