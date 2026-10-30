import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { subscribeAgenda } from '../../api/resources/js/agenda-events.mjs';
import { useSession, type User } from './session';
import { roleHome } from './paths.mjs';

export const money = (value: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function localDate(value: string) {
  const normalized = value.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  const instant = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : normalized + 'Z');
  return Number.isFinite(instant.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant) : 'Fecha no disponible';
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'No pudimos completar la operación.';
export const statusText: Record<string, string> = { confirmed: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió', pending: 'Pendiente de pago', paid: 'Pagado', failed: 'Fallido' };
export function imagePath(value: string | null | undefined, privatePhoto = false) {
  return value && (privatePhoto ? /^\/uploads\/haircuts\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/ : /^\/(?:assets\/img\/[A-Za-z0-9_./-]+|uploads\/products\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$/).test(value) && !value.includes('..') ? value : undefined;
}
export function ProductImage({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const src = imagePath(url);
  return src && !failed ? <img src={src} alt={name} onError={() => setFailed(true)} /> : <div className="product-empty">Sin imagen disponible</div>;
}
export function ClientGuard({ children }: { children: (user: User) => ReactNode }) {
  const session = useSession(); const location = useLocation();
  if (session.status === 'checking') return <main id="contenido" className="status-page"><p role="status">Comprobando tu sesión…</p></main>;
  if (session.status === 'error') return <main id="contenido" className="status-page"><h1>No pudimos comprobar tu sesión</h1><p role="alert">{session.error}</p><button className="v-button" onClick={() => void session.refresh()}>Reintentar</button></main>;
  if (!session.user) return <Navigate replace to={'/ingresar?returnTo=' + encodeURIComponent(location.pathname + location.search + location.hash)} />;
  if (session.user.role !== 'cliente') return <main id="contenido" className="status-page"><h1>Acceso no permitido</h1><Link to={roleHome(session.user.role)}>Ir a mi cuenta</Link></main>;
  return <section key={session.user.id}>{children(session.user)}</section>;
}
export function ClientNav() { return <nav className="client-nav" aria-label="Tu cuenta"><Link to="/reservar">Reservar</Link><Link to="/mi-cuenta/reservas">Mis reservas y fotos</Link><Link to="/mi-cuenta/pedidos">Mis pedidos</Link><Link to="/tienda">Tienda</Link><Link to="/carrito">Carrito</Link></nav>; }
export function useLive(scope: 'private' | 'availability', refresh: () => Promise<void>, enabled = true, barberId?: string, date?: string) {
  const callback = useRef(refresh); callback.current = refresh;
  const [connection, setConnection] = useState('');
  const session = useSession();
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const subscription = subscribeAgenda({ scope, barberId, date,
      onInvalidate: async () => { await callback.current(); if (live) setConnection(''); },
      onAuthRequired: () => { if (live) window.dispatchEvent(new Event('session-invalid')); },
      onError: () => { if (live) setConnection('Conexión en vivo interrumpida. Reintentamos automáticamente; también puedes actualizar.'); },
    });
    return () => { live = false; subscription.stop(); };
  }, [scope, enabled, barberId, date, session.user?.id]);
  return connection;
}
