import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { get, mutate, ApiError } from '../http';
import { useSession } from '../session';
import { ClientNav, errorText, money, today, useLive } from '../client';

type Service = { id: string; name: string; price: number; duration_minutes: number };
type Barber = { id: string; name: string };
type Availability = { availableSlots: string[] };
export const meta = () => [{ title: 'Reservar una hora — Barber Linderos' }, { name: 'robots', content: 'noindex, nofollow' }];
export default function Booking() {
  const [params, setParams] = useSearchParams();
  const serviceId = params.get('serviceId') || '', barberId = params.get('barberId') || '', date = params.get('date') || today();
  const selected = params.get('startTime') || '';
  const session = useSession();
  const [services, setServices] = useState<Service[]>([]), [barbers, setBarbers] = useState<Barber[]>([]);
  const [slots, setSlots] = useState<string[]>([]), [loading, setLoading] = useState(false), [pending, setPending] = useState(false);
  const [catalogError, setCatalogError] = useState(''), [availabilityError, setAvailabilityError] = useState(''), [message, setMessage] = useState('');
  const [success, setSuccess] = useState<{ id: string; date: string; start_time: string; price: number; service_name: string; ownerId?: string } | null>(null);
  const owner = useRef(session.user?.id); owner.current = session.user?.id;
  const revision = useRef(0), lock = useRef(false), current = useRef(''), mounted = useRef(true);
  current.current = [serviceId, barberId, date].join('|');
  useEffect(() => () => { mounted.current = false; revision.current++; }, []);
  const service = services.find(item => item.id === serviceId);
  async function loadCatalog() {
    setCatalogError('');
    try {
      const [a, b] = await Promise.all([get<{ services: Service[] }>('/services'), get<{ barbers: Barber[] }>('/barbers')]);
      if (mounted.current) { setServices(a.services); setBarbers(b.barbers); }
    } catch (error) { if (mounted.current) setCatalogError(errorText(error)); }
  }
  useEffect(() => { void loadCatalog(); }, []);
  const availabilityPath = '/reservations/availability?' + new URLSearchParams({ barberId, serviceId, date });
  async function refresh() {
    if (!serviceId || !barberId || !date) return;
    const version = ++revision.current;
    try {
      const result = await get<Availability>(availabilityPath);
      if (mounted.current && version === revision.current) { setSlots(result.availableSlots); setAvailabilityError(''); setLoading(false); }
    } catch (error) {
      if (mounted.current && version === revision.current) { setAvailabilityError(errorText(error)); setSlots([]); setLoading(false); }
    }
  }
  useEffect(() => {
    revision.current++; setSlots([]); setMessage(''); setLoading(!!serviceId && !!barberId); void refresh();
  }, [serviceId, barberId, date]);
  const connection = useLive('availability', async () => { await Promise.all([refresh(), loadCatalog()]); }, !!serviceId && !!barberId && !!date, barberId, date);
  function choose(name: string, value: string) {
    const next = new URLSearchParams(params); next.set(name, value); if (name !== 'startTime') next.delete('startTime');
    setParams(next, { replace: true }); setSuccess(null);
  }
  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || !service || !slots.includes(selected) || session.user?.role !== 'cliente') return;
    const form = event.currentTarget, key = current.current, actor = owner.current;
    const notes = String(new FormData(form).get('notes') || '');
    lock.current = true; setPending(true); setMessage('');
    try {
      const [catalog, available] = await Promise.all([get<{ services: Service[] }>('/services'), get<Availability>(availabilityPath)]);
      if (!mounted.current || current.current !== key || actor !== owner.current) return;
      const latest = catalog.services.find(item => item.id === serviceId);
      if (!latest || latest.price !== service.price || latest.duration_minutes !== service.duration_minutes) {
        setServices(catalog.services); setSlots(available.availableSlots); setMessage('El servicio cambió. Revisa precio y duración antes de confirmar nuevamente.'); return;
      }
      if (!available.availableSlots.includes(selected)) { setSlots(available.availableSlots); setMessage('Ese horario ya está ocupado. Elige otra hora disponible.'); return; }
      const result = await mutate<{ reservation: NonNullable<typeof success> }>('/reservations', { serviceId, barberId, date, startTime: selected, notes });
      if (mounted.current && actor === owner.current) { setSuccess({ ...result.reservation, ownerId: actor }); form.reset(); await refresh(); }
    } catch (error) {
      if (!mounted.current) return;
      setMessage(error instanceof ApiError && error.status === 409 ? 'Ese horario ya está ocupado o dejó de estar disponible. Elige otra hora.' : error instanceof ApiError && error.status === 0 ? 'No pudimos confirmar el resultado. Revisa Mis reservas antes de volver a enviar.' : errorText(error));
      await refresh();
    } finally { lock.current = false; if (mounted.current) setPending(false); }
  }
  const returnTo = '/reservar?' + params;
  return <main id="contenido" className="client-page"><ClientNav /><p className="overline">TU PRÓXIMA VISITA</p><h1>Reserva tu momento.</h1>
    <p>Horarios de Linderos, zona America/Santiago. El horario se confirma al guardar la reserva.</p>
    {catalogError && <p role="alert">{catalogError} <button onClick={loadCatalog}>Reintentar catálogos</button></p>}
    {success && success.ownerId === session.user?.id ? <section className="client-card" role="status"><h2>Reserva confirmada</h2><p>{success.service_name} · {success.date} · {success.start_time.slice(0, 5)} · {money(Number(success.price))}</p><Link className="v-button" to="/mi-cuenta/reservas">Ver mis reservas</Link><button onClick={() => setSuccess(null)}>Reservar otra hora</button></section> : <form onSubmit={reserve} aria-busy={pending} className="client-card booking-form">
      <fieldset disabled={pending}><legend>Elige tu atención</legend>
        <label>Servicio<select required value={serviceId} onChange={event => choose('serviceId', event.target.value)}><option value="">Elige un servicio</option>{services.map(item => <option key={item.id} value={item.id}>{item.name} · {money(Number(item.price))} · {item.duration_minutes} min</option>)}</select></label>
        <label>Barbero<select required value={barberId} onChange={event => choose('barberId', event.target.value)}><option value="">Elige tu barbero</option>{barbers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Fecha<input type="date" required min={today()} max="9998-12-31" value={date} onChange={event => choose('date', event.target.value)} /></label>
        {loading && <p role="status">Consultando horarios…</p>}
        {availabilityError && <p role="alert">{availabilityError} <button type="button" onClick={refresh}>Reintentar horarios</button></p>}
        {connection && <p role="status">{connection}</p>}
        {serviceId && barberId && !loading && !availabilityError && <><label>Horario<select required value={slots.includes(selected) ? selected : ''} onChange={event => choose('startTime', event.target.value)}><option value="">Elige una hora</option>{slots.map(time => <option key={time} value={time}>{time}</option>)}</select></label>{!slots.length && <p role="status">No quedan horarios para esta selección. Prueba otra fecha o barbero.</p>}</>}
        {session.user?.role === 'cliente' && <label>Notas para tu atención (opcional)<textarea name="notes" maxLength={4000} /></label>}
      </fieldset>
      {message && <p className="form-error" role="alert">{message} <Link to="/mi-cuenta/reservas">Mis reservas</Link></p>}
      {session.status === 'checking' ? <p role="status">Comprobando tu sesión…</p> : !session.user ? <Link className="v-button" to={'/ingresar?returnTo=' + encodeURIComponent(returnTo)}>Ingresar para confirmar</Link> : session.user.role !== 'cliente' ? <p>Para reservar necesitas una cuenta de cliente.</p> : <button className="v-button" disabled={pending || !service || !barbers.some(item => item.id === barberId) || !slots.includes(selected)}>{pending ? 'Confirmando…' : 'Confirmar reserva'}</button>}
    </form>}
  </main>;
}
