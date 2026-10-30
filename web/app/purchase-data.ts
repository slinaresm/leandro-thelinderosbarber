export type PurchaseAmountLine = { quantity: string; unitCost: string };
export function purchaseTotals(lines: PurchaseAmountLine[]) {
  let total: number | null = 0, units: number | null = 0;
  const invalidLines: number[] = [];
  const subtotals = lines.map((row, index) => {
    const quantity = Number(row.quantity), cost = Number(row.unitCost);
    const quantityValid = row.quantity.trim() !== '' && Number.isSafeInteger(quantity) && quantity >= 1;
    const costValid = row.unitCost.trim() !== '' && Number.isSafeInteger(cost) && cost >= 0;
    if (!quantityValid || units === null || !Number.isSafeInteger(units + quantity)) units = null; else units += quantity;
    const subtotal = quantityValid && costValid && Number.isSafeInteger(quantity * cost) ? quantity * cost : null;
    if (subtotal === null) invalidLines.push(index);
    if (subtotal === null || total === null || !Number.isSafeInteger(total + subtotal)) total = null; else total += subtotal;
    return subtotal;
  });
  return { total, units, subtotals, invalidLines };
}
export const purchaseSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
