import { StaffUsers } from './staff-users';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLive } from './client';
import { StaffGuard, ResourceState, useResource } from './staff';
import { StaffAgenda } from './staff-agenda';
import { StaffClients, StaffNotes } from './staff-clients';
import { BarberStats, Schedule, StaffBarbers, StaffMaterials, StaffProducts, StaffServices, type Barber } from './staff-catalogs';
import { StaffOverview, StaffPromotions } from './staff-business';
import { StaffMovements, StaffOrders, StaffPurchases } from './staff-commerce';
const adminTabs = [['resumen', 'Resumen'], ['agenda', 'Agenda'], ['barberos', 'Barberos'], ['clientes', 'Clientes'], ['servicios', 'Servicios'], ['inventario', 'Materiales'], ['productos', 'Productos'], ['compras', 'Compras'], ['movimientos', 'Movimientos'], ['pedidos', 'Pedidos'], ['promociones', 'Promociones'], ['usuarios', 'Usuarios']];
const barberTabs = [['agenda', 'Agenda'], ['clientes', 'Clientes'], ['fotos', 'Fotos'], ['notas', 'Notas privadas'], ['materiales', 'Materiales'], ['stats', 'Estadísticas'], ['horario', 'Horario']];
const sectionInfo: Record<string, string> = {
  usuarios: 'Administra cuentas, roles y acceso a la plataforma.',
  resumen: 'El estado de tu barbería, los ingresos de cada mes y el rendimiento de tu equipo.',
  agenda: 'Organiza las atenciones y revisa los próximos compromisos.',
  barberos: 'Gestiona tu equipo, sus especialidades y horarios de atención.',
  clientes: 'Encuentra a tus clientes y consulta su historial de atención.',
  servicios: 'Define lo que ofreces, sus precios y el tiempo de cada atención.',
  inventario: 'Controla los materiales de trabajo y las solicitudes de reposición.',
  materiales: 'Consulta las existencias y solicita materiales de trabajo.',
  productos: 'Administra tu tienda, los precios y las existencias disponibles.',
  compras: 'Registra compras revisadas y consulta los ingresos de mercadería.',
  movimientos: 'Sigue las entradas, salidas y ajustes de productos.',
  pedidos: 'Revisa los pedidos y confirma los pagos que hayas recibido.',
  promociones: 'Prepara las promociones y elige a qué clientes se dirigen.',
  fotos: 'Consulta las imágenes de las atenciones de tus clientes.',
  notas: 'Conserva tus observaciones privadas de atención.',
  stats: 'Consulta tus atenciones y la actividad de tus clientes.',
  horario: 'Define tu disponibilidad para recibir reservas.'
};
const adminGroups = [['Tu negocio', ['resumen', 'agenda', 'clientes', 'barberos']], ['Catálogos', ['servicios', 'productos', 'inventario']], ['Comercio', ['pedidos', 'compras', 'movimientos', 'promociones']], ['Administración', ['usuarios']]] as const;
const legacyTabs: Record<string, string> = { tienda: 'productos', 'stock-costos': 'compras', marketing: 'promociones' };
function BarberSection({ tab, revision }: { tab: string; revision: number }) {
  const profile = useResource<{ barber: Barber }>('/barbers/me/profile', revision), barber = profile.data?.barber;
  return <><ResourceState resource={profile} />{barber && <>{!Number(barber.active) && <p role="status">Tu perfil está inactivo en el catálogo. Consulta al administrador antes de atender nuevas reservas.</p>}{tab === 'agenda' ? <StaffAgenda revision={revision} /> : tab === 'clientes' || tab === 'fotos' ? <StaffClients barberId={barber.id} revision={revision} photosOnly={tab === 'fotos'} /> : tab === 'notas' ? <StaffNotes barberId={barber.id} revision={revision} /> : tab === 'materiales' ? <StaffMaterials admin={false} revision={revision} /> : tab === 'stats' ? <BarberStats id={barber.id} revision={revision} /> : <Schedule barber={barber} saved={profile.reload} />}</>}</>;
}
function Panel({ role, name }: { role: 'admin' | 'barbero'; name: string }) {
  const [params] = useSearchParams(), tabs = role === 'admin' ? adminTabs : barberTabs;
  const requested = params.get('tab') || tabs[0][0], translated = role === 'admin' ? legacyTabs[requested] || requested : requested;
  const tab = tabs.some(([key]) => key === translated) ? translated : tabs[0][0];
  const [revision, setRevision] = useState(0);
  async function refresh() { setRevision(value => value + 1); }
  const connection = useLive('private', refresh);
  useEffect(() => {
    // Documents and materials have no event channel of their own.
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(onFocus, 30000);
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, []);
  function href(key: string) { const next = new URLSearchParams(params); next.set('tab', key); return '?' + next; }
  const title = tabs.find(([key]) => key === tab)?.[1];
  const [menuOpen, setMenuOpen] = useState(false);
  const groups = role === 'admin' ? adminGroups : [['Mi trabajo', tabs.map(([key]) => key)]] as const;
  return <main id="contenido" className="client-page staff-page">
    <header className="staff-heading"><div><p className="overline">BARBER LINDEROS · GESTIÓN</p><h1>{role === 'admin' ? 'Administración' : 'Mi espacio de barbero'}</h1></div><p className="staff-identity" data-testid="identity"><span aria-hidden="true">{name.charAt(0)}</span>Hola, {name}.</p></header>
    <div className="staff-layout"><aside className="staff-sidebar"><button className="staff-menu-toggle" aria-expanded={menuOpen} aria-controls="staff-navigation" onClick={() => setMenuOpen(!menuOpen)}>Secciones · {title} <span aria-hidden="true">⌄</span></button><nav id="staff-navigation" className={'staff-navigation ' + (menuOpen ? 'is-open' : '')} aria-label="Secciones del panel">{groups.map(([group, keys]) => <div className="staff-nav-group" key={group}><p>{group}</p>{keys.map(key => <Link key={key} to={href(key)} onClick={() => setMenuOpen(false)} aria-current={tab === key ? 'page' : undefined}><span>{tabs.find(([id]) => id === key)?.[1]}</span><span aria-hidden="true">›</span></Link>)}</div>)}<Link className="staff-site-link" to="/">Ver sitio público ↗</Link></nav></aside>
    <div className="staff-workspace"><header className="staff-section-heading"><div><p className="staff-breadcrumb">{role === 'admin' ? 'Administración' : 'Mi espacio'} / {title}</p><h2>{title}</h2><p>{sectionInfo[tab]}</p></div><button className="staff-secondary staff-refresh" onClick={refresh}><span aria-hidden="true">↻</span> Actualizar panel</button></header>{requested !== translated && <p role="status">Sección actualizada: {title}.</p>}{connection && <p className="staff-connection" role="status">{connection}</p>}<section key={tab} className="staff-section">{role === 'barbero' ? <BarberSection tab={tab} revision={revision} /> : tab === 'resumen' ? <StaffOverview revision={revision} /> : tab === 'agenda' ? <StaffAgenda calendar revision={revision} /> : tab === 'barberos' ? <StaffBarbers revision={revision} /> : tab === 'clientes' ? <StaffClients revision={revision} /> : tab === 'servicios' ? <StaffServices revision={revision} /> : tab === 'inventario' ? <StaffMaterials admin revision={revision} /> : tab === 'productos' ? <StaffProducts revision={revision} /> : tab === 'compras' ? <StaffPurchases revision={revision} /> : tab === 'usuarios' ? <StaffUsers revision={revision} /> : tab === 'movimientos' ? <StaffMovements revision={revision} /> : tab === 'pedidos' ? <StaffOrders revision={revision} /> : <StaffPromotions revision={revision} />}</section></div></div></main>;
}
export function StaffPanel({ role }: { role: 'admin' | 'barbero' }) { return <StaffGuard role={role}>{user => <Panel role={role} name={user.name} />}</StaffGuard>; }
