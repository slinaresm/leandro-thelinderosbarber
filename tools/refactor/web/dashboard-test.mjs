import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard, monthRange, shiftMonth } from '../../../web/app/dashboard-data.ts';
const team = [{ id: 'a', name: 'Mismo nombre', active: 1 }, { id: 'b', name: 'Mismo nombre', active: 0 }, { id: 'c', name: 'Sin actividad', active: 1 }];
const visit = (id, barber, date, status, price = 10000, client = 'cliente') => ({ id, barber_id: barber, barber_name: 'Mismo nombre', client_id: client, date, status, price, service_name: 'Corte snapshot' });
const order = (id, status, total, created_at) => ({ id, status, total, created_at });
test('ingresos por estado, identidades separadas, ticket y matriz reconciliada', () => {
  const data = buildDashboard([
    visit('1', 'a', '2026-10-01', 'completed', '10000'), visit('2', 'b', '2026-10-02', 'completed', 20000),
    visit('3', 'a', '2026-10-03', 'confirmed', 90000), visit('4', 'b', '2026-10-04', 'cancelled', 90000),
    visit('5', 'a', '2026-10-05', 'no_show', 90000), visit('6', 'a', '2026-09-30', 'completed', 5000),
  ], [order('1', 'paid', 7000, '2026-10-15 15:00:00'), order('2', 'pending', 3000, '2026-10-15 15:00:00'), order('3', 'cancelled', 90000, '2026-10-15 15:00:00')], team, '2026-10');
  assert.equal(data.total, 37000); assert.equal(data.current.services, 30000); assert.equal(data.current.shop, 7000);
  assert.equal(data.ticket, 15000); assert.equal(data.current.clients.size, 1); assert.equal(data.current.pendingOrders, 1);
  assert.equal(data.current.pendingAmount, 3000); assert.equal(data.previousTotal, 5000); assert.equal(data.annualTotal, 42000);
  assert.deepEqual(data.team.map(row => [row.id, row.revenue]), [['b', 20000], ['a', 10000], ['c', 0]]);
  assert.equal(data.team.reduce((sum, row) => sum + row.monthly[9], 0), data.current.services);
  assert.equal(data.team.reduce((sum, row) => sum + row.annual, 0), data.annualServices);
  assert.equal(data.cancellationRate, 20); assert.equal(data.months.length, 12);
});
test('mes de creación comercial en Santiago, incluida frontera y horario de invierno', () => {
  const data = buildDashboard([], [order('1', 'paid', 2000, '2026-11-01 02:59:59'), order('2', 'paid', 3000, '2026-11-01 03:00:00'), order('3', 'paid', 4000, '2026-07-01 03:59:59')], [], '2026-10');
  assert.equal(data.current.shop, 2000); assert.equal(data.months[10].shop, 3000); assert.equal(data.months[5].shop, 4000);
});
test('meses vacíos, año bisiesto y comparación enero contra diciembre del año anterior', () => {
  assert.deepEqual(monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' }); assert.equal(shiftMonth('2026-01', -1), '2025-12');
  const data = buildDashboard([visit('1', 'a', '2025-12-31', 'completed', 9000)], [], team, '2026-01');
  assert.equal(data.total, 0); assert.equal(data.previousTotal, 9000); assert.equal(data.annualTotal, 0); assert.equal(data.ticket, 0);
  assert.equal(data.team.length, 3); assert.ok(data.months.every(row => row.total === 0));
  assert.throws(() => monthRange('2026-13')); assert.throws(() => monthRange('')); assert.throws(() => monthRange('2026-02&otro=1'));
});
test('precios snapshot y barberos históricos conservan sus ingresos', () => {
  const data = buildDashboard([visit('1', 'historico', '2026-10-01', 'completed', 12500)], [], [], '2026-10');
  assert.equal(data.team[0].id, 'historico'); assert.equal(data.team[0].revenue, 12500); assert.equal(data.services[0].revenue, 12500);
});
test('importes negativos, fraccionarios, vacíos, fechas comerciales inválidas y sumas inseguras se rechazan', () => {
  for (const value of [-1, 1.5, '', '1e4', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildDashboard([visit('1', 'a', '2026-10-01', 'completed', value)], [], team, '2026-10'));
  assert.throws(() => buildDashboard([visit('1', 'a', '2026-10-01', 'completed', Number.MAX_SAFE_INTEGER), visit('2', 'a', '2026-10-01', 'completed', 1)], [], team, '2026-10'));
  assert.throws(() => buildDashboard([], [order('1', 'paid', 10, 'invalida')], [], '2026-10'));
});
