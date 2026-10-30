/** @param {string} month */
export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1001 || Number(month.slice(0, 4)) > 9997) throw new Error('Selecciona un mes válido.');
  const [year, number] = month.split('-').map(Number);
  return { from: month + '-01', to: month + '-' + new Date(Date.UTC(year, number, 0)).getUTCDate() };
}
/** @param {string} month @param {number} delta */
export function shiftMonth(month, delta) {
  monthRange(month);
  const [year, number] = month.split('-').map(Number), date = new Date(Date.UTC(year, number - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
/** @param {string} month */
export function monthTitle(month) {
  monthRange(month);
  return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-01T12:00:00Z'));
}
