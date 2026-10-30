import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, moveCalendarDay, validCalendarDate, calendarSearch } from '../../../web/app/calendar-data.ts';
import { monthRange, shiftMonth } from '../../../web/app/civil-dates.mjs';
test('lunes primero, domingo último y días únicos sin fechas inventadas', () => {
  const monday = calendarDays('2021-02'); assert.equal(monday.length, 28); assert.equal(monday[0], '2021-02-01'); assert.equal(monday.at(-1), '2021-02-28');
  const sunday = calendarDays('2026-11'); assert.ok(sunday.slice(0, 6).every(value => value === null)); assert.equal(sunday[6], '2026-11-01');
  assert.equal(new Set(sunday.filter(Boolean)).size, 30); assert.equal(sunday.length % 7, 0);
});
test('bisiestos, cambio de año y fechas civiles sin desfase horario', () => {
  assert.equal(calendarDays('2024-02').filter(Boolean).length, 29); assert.equal(calendarDays('2100-02').filter(Boolean).length, 28);
  assert.equal(moveCalendarDay('2024-02-28', 1), '2024-02-29'); assert.equal(moveCalendarDay('2024-02-29', 1), '2024-03-01');
  assert.equal(moveCalendarDay('2026-12-31', 1), '2027-01-01'); assert.equal(shiftMonth('2027-01', -1), '2026-12');
  assert.equal(moveCalendarDay('2026-09-06', -1), '2026-09-05');
});
test('selección diaria válida y límites de navegación', () => {
  assert.equal(validCalendarDate('2024-02-29', '2024-02'), true); assert.equal(validCalendarDate('2026-02-29', '2026-02'), false);
  assert.equal(validCalendarDate('2026-11-01', '2026-10'), false); assert.equal(validCalendarDate('2026-10-00', '2026-10'), false);
  assert.throws(() => monthRange('2026-13')); assert.throws(() => moveCalendarDay('1001-01-01', -1));
});
test('búsqueda normalizada para nombres con acentos', () => { assert.equal(calendarSearch('  José MUÑOZ '), 'jose munoz'); });
