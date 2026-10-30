import { monthRange, shiftMonth } from './civil-dates.mjs';
export { monthRange, shiftMonth, monthTitle } from './civil-dates.mjs';
export type DashboardVisit = { id: string; barber_id: string; barber_name: string; client_id: string; date: string; status: string; price: number | string; service_name: string };
export type DashboardOrder = { id: string; status: string; total: number | string; created_at: string };
export type DashboardBarber = { id: string; name: string; active: number | boolean };
export const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function amount(value: number | string) {
  if (typeof value === 'string' && !/^\d+$/.test(value)) throw new Error('Hay importes que requieren revisión. No se muestran sumas incompletas.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Hay importes fuera del rango permitido. Revisa los datos antes de usar estos indicadores.');
  return number;
}
function add(left: number, right: number) { return amount(left + right); }
function localOrderMonth(value: string) {
  const normalized = value.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  const date = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + 'Z');
  if (!Number.isFinite(date.getTime())) throw new Error('Hay pedidos con fechas inválidas. Revisa los datos antes de usar estos indicadores.');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).format(date);
}
function bucket() { return { services: 0, shop: 0, completed: 0, confirmed: 0, cancelled: 0, noShow: 0, clients: new Set<string>(), pendingOrders: 0, pendingAmount: 0, paidOrders: 0 }; }
export function buildDashboard(visits: DashboardVisit[], orders: DashboardOrder[], barbers: DashboardBarber[], month: string) {
  monthRange(month);
  const year = month.slice(0, 4), previousMonth = shiftMonth(month, -1), index = Number(month.slice(5)) - 1;
  const months = Array.from({ length: 12 }, (_, i) => ({ month: year + '-' + String(i + 1).padStart(2, '0'), ...bucket() }));
  const current = bucket(), previous = bucket();
  const team = new Map(barbers.map(row => [row.id, { ...row, monthly: Array<number>(12).fill(0), revenue: 0, completed: 0, confirmed: 0, cancelled: 0, noShow: 0 }]));
  const services = new Map<string, { name: string; completed: number; revenue: number }>();
  for (const visit of visits) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visit.date)) throw new Error('Hay reservas con fechas inválidas.');
    const visitMonth = visit.date.slice(0, 7), value = visit.status === 'completed' ? amount(visit.price) : 0;
    const targets = [visitMonth === month ? current : null, visitMonth === previousMonth ? previous : null, visitMonth.startsWith(year + '-') ? months.find(row => row.month === visitMonth) : null].filter(row => row !== null && row !== undefined);
    for (const target of targets) {
      if (visit.status === 'completed') { target.services = add(target.services, value); target.completed++; target.clients.add(visit.client_id); }
      else if (visit.status === 'confirmed') target.confirmed++;
      else if (visit.status === 'cancelled') target.cancelled++;
      else if (visit.status === 'no_show') target.noShow++;
    }
    if (!team.has(visit.barber_id)) team.set(visit.barber_id, { id: visit.barber_id, name: visit.barber_name || 'Barbero histórico', active: false, monthly: Array<number>(12).fill(0), revenue: 0, completed: 0, confirmed: 0, cancelled: 0, noShow: 0 });
    const barber = team.get(visit.barber_id)!;
    if (visitMonth.startsWith(year + '-') && visit.status === 'completed') { const i = Number(visitMonth.slice(5)) - 1; if (i < 0 || i > 11) throw new Error('Fecha de reserva inválida.'); barber.monthly[i] = add(barber.monthly[i], value); }
    if (visitMonth === month) {
      if (visit.status === 'completed') { barber.revenue = add(barber.revenue, value); barber.completed++; const service = services.get(visit.service_name) || { name: visit.service_name, completed: 0, revenue: 0 }; service.completed++; service.revenue = add(service.revenue, value); services.set(service.name, service); }
      else if (visit.status === 'confirmed') barber.confirmed++;
      else if (visit.status === 'cancelled') barber.cancelled++;
      else if (visit.status === 'no_show') barber.noShow++;
    }
  }
  for (const order of orders) {
    if (!['paid', 'pending'].includes(order.status)) continue;
    const orderMonth = localOrderMonth(order.created_at), value = amount(order.total);
    const targets = [orderMonth === month ? current : null, orderMonth === previousMonth ? previous : null, orderMonth.startsWith(year + '-') ? months.find(row => row.month === orderMonth) : null].filter(row => row !== null && row !== undefined);
    for (const target of targets) {
      if (order.status === 'paid') { target.shop = add(target.shop, value); target.paidOrders++; }
      else { target.pendingOrders++; target.pendingAmount = add(target.pendingAmount, value); }
    }
  }
  const total = add(current.services, current.shop), previousTotal = add(previous.services, previous.shop);
  const annualServices = months.reduce((sum, row) => add(sum, row.services), 0), annualShop = months.reduce((sum, row) => add(sum, row.shop), 0);
  const teamRows = [...team.values()].map(row => ({ ...row, annual: row.monthly.reduce(add, 0) })).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
  return { month, year, index, current, previous, previousMonth, total, previousTotal, annualTotal: add(annualServices, annualShop), annualServices, annualShop, months: months.map(row => ({ ...row, total: add(row.services, row.shop) })), team: teamRows, services: [...services.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'es')), ticket: current.completed ? Math.round(current.services / current.completed) : 0, cancellationRate: current.completed + current.confirmed + current.cancelled + current.noShow ? current.cancelled * 100 / (current.completed + current.confirmed + current.cancelled + current.noShow) : 0 };
}
export type DashboardData = ReturnType<typeof buildDashboard>;
