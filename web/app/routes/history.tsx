import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ClientGuard, ClientNav, errorText, imagePath, localDate, money, statusText, today, useLive } from '../client';
import { ApiError, get, mutate } from '../http';
import type { User } from '../session';

type Visit = { id: string; date: string; start_time: string; status: string; service_name: string; price: number; duration_minutes?: number; barber_name: string };
type Photo = { id: string; photo_url: string; type: string; barber_name: string; created_at: string };
type Profile = { id: string; loyalty_points: number | null; loyalty_level: string | null };
export const meta = () => [{ title: 'Mis reservas y fotos — Barber Linderos' }, { name: 'robots', content: 'noindex, nofollow' }];

function VisitActions({ visit, reload }: { visit: Visit; reload: () => Promise<void> }) {
  const [action, setAction] = useState(''), [pending, setPending] = useState(false), [message, setMessage] = useState('');
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const data = new FormData(event.currentTarget);
    lock.current = true; setPending(true); setMessage('');
    try {
      await mutate('/reservations/' + encodeURIComponent(visit.id) + '/' + action, action === 'reschedule' ? { date: data.get('date'), startTime: data.get('startTime') } : {}, 'PATCH');
      setMessage(action === 'cancel' ? 'Reserva cancelada.' : 'Reserva reprogramada.'); setAction(''); await reload();
    } catch (error) {
      setMessage(error instanceof ApiError && error.status === 409 ? 'No se pudo cambiar la reserva: el horario está ocupado o la cita ya cambió. Tu reserva original no se modifica por este intento.' : error instanceof ApiError && error.status === 0 ? 'Resultado no confirmado. Actualiza tu historial antes de reintentar.' : errorText(error));
      await reload();
    } finally { lock.current = false; setPending(false); }
  }
  return <div>{visit.status === 'confirmed' && !action && <div className="client-actions"><button onClick={() => setAction('reschedule')}>Reprogramar</button><button onClick={() => setAction('cancel')}>Cancelar reserva</button></div>}
    {action && <form onSubmit={submit} aria-busy={pending}><fieldset disabled={pending}><legend>{action === 'cancel' ? '¿Confirmas la cancelación de esta reserva?' : 'Solicitar otro horario'}</legend>
      {action === 'reschedule' && <><p>Se conservan el precio y la duración originales. La disponibilidad se valida al guardar.</p><label>Nueva fecha<input type="date" name="date" required min={today()} max="9998-12-31" defaultValue={visit.date} /></label><label>Nueva hora<input type="time" name="startTime" required defaultValue={visit.start_time.slice(0, 5)} /></label></>}
      <button type="submit">{pending ? 'Guardando…' : action === 'cancel' ? 'Confirmar cancelación' : 'Guardar nuevo horario'}</button><button type="button" onClick={() => setAction('')}>Volver sin cambios</button>
    </fieldset></form>}{message && <p role="status">{message}</p>}
  </div>;
}
function PrivatePhoto({ photo }: { photo: Photo }) {
  const [failed, setFailed] = useState(false); const src = imagePath(photo.photo_url, true);
  return <figure className="client-photo">{src && !failed ? <img src={src} alt={'Foto ' + (photo.type === 'antes' ? 'antes' : 'después') + ' de tu atención'} onError={() => setFailed(true)} /> : <p>Esta foto no está disponible.</p>}<figcaption>{photo.type === 'antes' ? 'Antes' : 'Después'} · {photo.barber_name} · {localDate(photo.created_at)}</figcaption></figure>;
}
function History({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile | null>(null), [visits, setVisits] = useState<Visit[]>([]), [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true), [errors, setErrors] = useState<string[]>([]);
  const live = useRef(true), revision = useRef(0);
  useEffect(() => () => { live.current = false; revision.current++; }, []);
  async function reload() {
    const version = ++revision.current;
    const data = await Promise.allSettled([get<{ client: Profile }>('/clients/me/profile'), get<{ reservations: Visit[] }>('/reservations'), get<{ photos: Photo[] }>('/photos')]);
    if (!live.current || version !== revision.current) return;
    const messages: string[] = [];
    const own = data[0].status === 'fulfilled' ? data[0].value.client : null;
    setProfile(own);
    if (data[0].status === 'rejected') messages.push('Fidelización: ' + errorText(data[0].reason));
    if (data[1].status === 'fulfilled') setVisits(data[1].value.reservations); else { setVisits([]); messages.push('Reservas: ' + errorText(data[1].reason)); }
    if (data[2].status === 'fulfilled') setPhotos(data[2].value.photos); else { setPhotos([]); messages.push('Fotos: ' + errorText(data[2].reason)); }
    if (own) {
      try {
        const history = await get<{ history: Visit[] }>('/clients/' + encodeURIComponent(own.id) + '/history');
        if (!live.current || version !== revision.current) return;
        setVisits(history.history);
      } catch (error) { messages.push('Historial: ' + errorText(error)); }
    }
    if (live.current && version === revision.current) { setErrors(messages); setLoading(false); }
  }
  const connection = useLive('private', reload);
  return <main id="contenido" className="client-page"><ClientNav /><h1>Mis reservas y fotos</h1><p data-testid="identity">Hola, {user.name}.</p><button onClick={reload}>Actualizar historial</button>
    {connection && <p role="status">{connection}</p>}{loading && <p role="status">Cargando tu historial…</p>}{errors.map(error => <p role="alert" key={error}>{error}</p>)}
    {profile && <section className="client-card" aria-label="Fidelización"><h2>Tu fidelización</h2><p>{profile.loyalty_points ?? 'Sin saldo registrado'}{profile.loyalty_points !== null ? ' puntos' : ''} · {profile.loyalty_level ?? 'Sin nivel registrado'}</p><p>Los puntos se actualizan cuando tu atención se completa.</p></section>}
    <section aria-labelledby="visits-title"><h2 id="visits-title">Tus visitas</h2>{!loading && !visits.length && <p>Aún no tienes reservas.</p>}
      <div className="visit-list">{visits.map(visit => <article className="client-card" key={visit.id} data-testid="visit"><h3>{visit.service_name}</h3><p>{visit.date} · {visit.start_time.slice(0, 5)} · {visit.barber_name}</p><p>{money(Number(visit.price))}{visit.duration_minutes ? ' · ' + visit.duration_minutes + ' minutos' : ''} · <strong>{statusText[visit.status] || visit.status}</strong></p><VisitActions visit={visit} reload={reload} /></article>)}</div>
    </section>
    <section aria-labelledby="photos-title"><h2 id="photos-title">Fotos de tus atenciones</h2>{!loading && !photos.length && <p>No tienes fotos disponibles.</p>}<div className="photo-grid">{photos.map(photo => <PrivatePhoto key={photo.id} photo={photo} />)}</div></section>
  </main>;
}
export default function HistoryRoute() { return <ClientGuard>{user => <History user={user} />}</ClientGuard>; }
