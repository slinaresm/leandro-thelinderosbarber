import { monthRange } from './civil-dates.mjs';

export function calendarDays(month: string): (string | null)[] {
  const { from, to } = monthRange(month);
  const offset = (new Date(from + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const count = Number(to.slice(8));
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => index >= offset && index < offset + count ? month + '-' + String(index - offset + 1).padStart(2, '0') : null);
}
export function validCalendarDate(value: string, month: string) {
  const { from, to } = monthRange(month);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= from && value <= to;
}
export function moveCalendarDay(value: string, days: number) {
  if (!validCalendarDate(value, value.slice(0, 7))) throw new Error('Fecha de agenda inválida.');
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  const result = date.toISOString().slice(0, 10);
  monthRange(result.slice(0, 7));
  return result;
}
export const calendarDateTitle = (date: string) => new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date + 'T12:00:00Z'));
export const calendarSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
