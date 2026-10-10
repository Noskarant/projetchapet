/** Client-facing cells: missing values stay empty; zero remains an explicit value. */
export function documentLineValues(item: { quantity: number | null | undefined; unitPrice: number | null | undefined; taxRate: number | null | undefined }) {
  const finite = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const quantity = finite(item.quantity);
  const unitPrice = finite(item.unitPrice);
  return {
    quantity,
    unitPrice,
    taxRate: unitPrice === null ? null : finite(item.taxRate),
    total: quantity === null || unitPrice === null ? null : quantity * unitPrice,
  };
}
