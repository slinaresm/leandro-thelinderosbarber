import { Link, Navigate, useLocation } from 'react-router';
import { aliases, canonicalPaths, routeRoles, roleHome } from '../paths.mjs';
import { useSession } from '../session';

export const meta = () => [{ title: 'Tu próxima visita — Barber Linderos' }, { name: 'robots', content: 'noindex, nofollow' }];
const names: Record<string, string> = { '/reservar': 'Reservar una hora', '/tienda': 'La tienda Linderos', '/producto': 'Producto', '/mi-cuenta/reservas': 'Mis reservas', '/administracion': 'Administración', '/barbero': 'Mi agenda' };
export default function Remaining() {
  const location = useLocation();
  const session = useSession();
  const alias = aliases[location.pathname as keyof typeof aliases];
  if (alias) return <Navigate to={alias + location.search + location.hash} replace />;
  if (!canonicalPaths.includes(location.pathname)) return <main id="contenido" className="status-page"><h1>Página no encontrada</h1><p>Comprueba el enlace o regresa al inicio.</p><Link to="/">Volver al inicio</Link></main>;
  const role = routeRoles[location.pathname as keyof typeof routeRoles];
  if (role) {
    if (session.status === 'checking') return <main id="contenido" className="status-page"><p role="status">Comprobando tu sesión…</p></main>;
    if (session.status === 'error') return <main id="contenido" className="status-page"><h1>No pudimos comprobar tu sesión</h1><p role="alert">{session.error}</p><button className="v-button" onClick={() => void session.refresh()}>Reintentar</button></main>;
    if (!session.user) return <Navigate replace to={'/ingresar?returnTo=' + encodeURIComponent(location.pathname + location.search + location.hash)} />;
    if (session.user.role !== role) return <main id="contenido" className="status-page"><h1>Acceso no permitido</h1><p>Esta sección corresponde a otro tipo de cuenta.</p><Link to={roleHome(session.user.role)}>Ir a mi cuenta</Link></main>;
  }
  return <main id="contenido" className="status-page"><p className="overline">BARBER LINDEROS</p><h1>{names[location.pathname]}</h1>
    {role && <p data-testid="identity">Hola, {session.user?.name}.</p>}
    <p>Estamos preparando esta sección de la nueva web. Estará disponible antes del cambio de plataforma.</p><p>Puedes consultar nuestros servicios y las políticas para preparar tu visita.</p>
    <Link className="v-button" to="/#servicios">Ver servicios ↗</Link> <Link className="text-link" to="/politicas-de-servicio">Políticas de servicio</Link>
  </main>;
}
