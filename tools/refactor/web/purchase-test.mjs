import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseTotals, purchaseSearch } from '../../../web/app/purchase-data.ts';
test('cantidades, subtotales y costo total de compra se reconcilian', () => {
  const rows = [{ quantity: '3', unitCost: '2000' }, { quantity: '2', unitCost: '1000' }];
  assert.deepEqual(purchaseTotals(rows), { total: 8000, units: 5, subtotals: [6000, 2000], invalidLines: [] });
  assert.equal(rows[0].quantity, '3');
});
test('costo cero válido y borrador vacío no se confunden con un costo incompleto', () => {
  assert.equal(purchaseTotals([{ quantity: '2', unitCost: '0' }]).total, 0);
  assert.equal(purchaseTotals([]).total, 0);
  const incomplete = purchaseTotals([{ quantity: '2', unitCost: '500' }, { quantity: '1', unitCost: '' }]);
  assert.equal(incomplete.total, null); assert.equal(incomplete.units, 3); assert.deepEqual(incomplete.invalidLines, [1]);
});
test('cantidades inválidas e importes negativos o fraccionarios no producen sumas parciales', () => {
  for (const row of [{ quantity: '', unitCost: '100' }, { quantity: '0', unitCost: '100' }, { quantity: '1.5', unitCost: '100' }, { quantity: '1', unitCost: '-1' }, { quantity: '1', unitCost: '0.5' }]) assert.equal(purchaseTotals([row]).total, null);
});
test('desbordamiento por línea, suma o cantidad se detecta', () => {
  assert.equal(purchaseTotals([{ quantity: '2', unitCost: String(Number.MAX_SAFE_INTEGER) }]).total, null);
  assert.equal(purchaseTotals([{ quantity: '1', unitCost: String(Number.MAX_SAFE_INTEGER) }, { quantity: '1', unitCost: '1' }]).total, null);
  assert.equal(purchaseTotals([{ quantity: String(Number.MAX_SAFE_INTEGER), unitCost: '0' }, { quantity: '1', unitCost: '0' }]).units, null);
});
test('búsqueda de proveedor y productos normalizada', () => { assert.equal(purchaseSearch('  Distribución MUÑOZ '), 'distribucion munoz'); });
