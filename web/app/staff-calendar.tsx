import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import { statusText, today } from './client';
import { monthRange, monthTitle, shiftMonth } from './dashboard-data';
import { calendarDays, calendarDateTitle, calendarSearch, moveCalendarDay, validCalendarDate } from './calendar-data';
import './calendar.css';

export type CalendarVisit = { id: string; barber_id?: string; date: string; start_time: string; status: string; service_name: string; client_name?: string; barber_name?: string };
export function StaffCalendar<T extends CalendarVisit>({ visits, children, updating }: { visits: T[]; children: (visit: T) => ReactNode; updating: boolean }) {
  const [params, setParams] = useSearchParams(), currentDay = today();
  let month = params.get('agendaMonth') || currentDay.slice(0, 7);
  try { monthRange(month); } catch { month = currentDay.slice(0, 7); }
  const candidate = params.get('agendaDate') || '', selected = validCalendarDate(candidate, month) ? candidate : '';
  const [status, setStatus] = useState(''), [barber, setBarber] = useState(''), [search, setSearch] = useState('');
  const focusDate = useRef(''), dayButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => { if (focusDate.current) { dayButtons.current.get(focusDate.current)?.focus({ preventScroll: true }); focusDate.current = ''; } }, [month, selected]);
  function navigate(nextMonth: string, date = '') {
    try { monthRange(nextMonth); } catch { return; }
    const next = new URLSearchParams(params); next.set('agendaMonth', nextMonth);
    if (date && validCalendarDate(date, nextMonth)) next.set('agendaDate', date); else next.delete('agendaDate');
    setParams(next, { preventScrollReset: true });
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    try { const next = moveCalendarDay(date, offsets[event.key]); focusDate.current = next; navigate(next.slice(0, 7), next); } catch { /* Civil-date navigation stops at supported bounds. */ }
  }
  const barbers = [...new Map(visits.filter(row => row.barber_id).map(row => [row.barber_id!, row.barber_name || 'Barbero'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const monthVisits = visits.filter(row => row.date.startsWith(month + '-'));
  const filtered = monthVisits.filter(row => (!status || row.status === status) && (!barber || row.barber_id === barber) && (!search || calendarSearch((row.client_name || '') + ' ' + (row.barber_name || '') + ' ' + row.service_name).includes(calendarSearch(search))))
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time) || (a.client_name || '').localeCompare(b.client_name || '', 'es') || a.id.localeCompare(b.id));
  const grouped = new Map<string, T[]>();
  for (const row of filtered) { const day = grouped.get(row.date) || []; day.push(row); grouped.set(row.date, day); }
  const days = calendarDays(month), detail = selected ? grouped.get(selected) || [] : filtered;
  const tabStop = selected || (currentDay.startsWith(month) ? currentDay : month + '-01');
  return <div className="staff-month-agenda" aria-busy={updating}>
    <header className="calendar-heading"><div><p>AGENDA DEL MES</p><h3>{monthTitle(month)}</h3><span>Selecciona un día para consultar sus reservas.</span></div><div className="calendar-navigation"><button className="staff-secondary" aria-label="Mes anterior de agenda" disabled={month === '1001-01'} onClick={() => navigate(shiftMonth(month, -1))}>←</button><label>Mes de agenda<input type="month" aria-label="Mes de agenda" min="1001-01" max="9997-12" value={month} onChange={event => { if (event.target.value) navigate(event.target.value); }} /></label><button className="staff-secondary" aria-label="Mes siguiente de agenda" disabled={month === '9997-12'} onClick={() => navigate(shiftMonth(month, 1))}>→</button><button onClick={() => navigate(currentDay.slice(0, 7), currentDay)}>Hoy</button></div></header>
    <div className="calendar-month-summary"><span><strong>{monthVisits.length}</strong> reservas en el mes</span><span><i className="calendar-dot confirmed" />{monthVisits.filter(row => row.status === 'confirmed').length} confirmadas</span><span><i className="calendar-dot completed" />{monthVisits.filter(row => row.status === 'completed').length} completadas</span></div>
    <div className="calendar-filters"><label>Buscar en el mes<input type="search" value={search} placeholder="Cliente, barbero o servicio…" onChange={event => setSearch(event.target.value)} /></label><label>Barbero de agenda<select aria-label="Barbero de agenda" value={barber} onChange={event => setBarber(event.target.value)}><option value="">Todos los barberos</option>{barbers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Estado de agenda<select aria-label="Estado de agenda" value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos los estados</option>{['confirmed', 'completed', 'cancelled', 'no_show'].map(value => <option value={value} key={value}>{statusText[value]}</option>)}</select></label>{(status || barber || search) && <button className="staff-secondary" onClick={() => { setStatus(''); setBarber(''); setSearch(''); }}>Limpiar filtros</button>}</div>
    <div className="calendar-month-grid"><table><caption>Calendario de {monthTitle(month)} · {filtered.length} reservas con los filtros actuales</caption><thead><tr>{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => <th scope="col" key={day}><abbr title={day}>{day.slice(0, 3)}</abbr></th>)}</tr></thead><tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map((date, index) => <td key={date || 'empty-' + index} className={date ? '' : 'calendar-outside'}>{date && <button ref={element => { if (element) dayButtons.current.set(date, element); else dayButtons.current.delete(date); }} className={'calendar-day ' + (date === selected ? 'is-selected' : '') + (date === currentDay ? ' is-today' : '')} tabIndex={date === tabStop ? 0 : -1} aria-pressed={date === selected} aria-current={date === currentDay ? 'date' : undefined} aria-label={calendarDateTitle(date) + ', ' + (grouped.get(date)?.length || 0) + ' reservas' + (date === currentDay ? ', hoy' : '')} onClick={() => navigate(month, date)} onKeyDown={event => keyboard(event, date)}><span className="calendar-day-top"><span className="calendar-number">{Number(date.slice(8))}</span>{date === currentDay && <span className="calendar-today-label">Hoy</span>}{(grouped.get(date)?.length || 0) > 0 && <span className="calendar-day-count">{grouped.get(date)!.length}<span className="calendar-mobile-count-label"> citas</span></span>}</span><span className="calendar-day-events" aria-hidden="true">{grouped.get(date)?.slice(0, 2).map(row => <span className={'calendar-event ' + row.status} key={row.id}><b>{row.start_time.slice(0, 5)}</b> {row.client_name || row.service_name}<small>{row.barber_name || row.service_name}</small></span>)}{(grouped.get(date)?.length || 0) > 2 && <span className="calendar-more">+{grouped.get(date)!.length - 2} más</span>}</span></button>}</td>)}</tr>)}</tbody></table></div>
    <div className="calendar-legend">{['confirmed', 'completed', 'cancelled', 'no_show'].map(value => <span key={value}><i className={'calendar-dot ' + value} />{statusText[value]}</span>)}<span>Horas locales de Santiago.</span></div>
    <section className="calendar-detail" aria-label="Detalle de reservas"><header><div><p>{selected ? 'DÍA SELECCIONADO' : 'VISTA DEL MES'}</p><h3>{selected ? calendarDateTitle(selected) : 'Reservas de ' + monthTitle(month)}</h3><span role="status">{detail.length} reservas{status || barber || search ? ' con los filtros actuales' : ''}</span></div>{selected && <button className="staff-secondary" onClick={() => navigate(month)}>Ver todo el mes</button>}</header>{!detail.length ? <div className="calendar-empty"><h4>{selected ? 'No hay reservas para este día' : 'No hay reservas para este mes'}</h4><p>{status || barber || search ? 'Prueba con otros filtros o limpia la búsqueda.' : 'Puedes seleccionar otro día o navegar a otro mes.'}</p></div> : <div className="calendar-visit-list">{detail.map(row => <div key={row.id}>{children(row)}</div>)}</div>}</section>
  </div>;
}
