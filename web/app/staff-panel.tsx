import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLive } from './client';
import { StaffGuard, ResourceState, useResource } from './staff';
import { StaffAgenda } from './staff-agenda';
import { StaffClients, StaffNotes } from './staff-clients';
import { BarberStats, Schedule, StaffBarbers, StaffMaterials, StaffProducts, StaffServices, type Barber } from './staff-catalogs';
import { StaffOverview, StaffPromotions } from './staff-business';
import { StaffMovements, StaffOrders, StaffPurchases } from './staff-commerce';
const adminTabs = [['resumen', 'Resumen'], ['agenda', 'Agenda'], ['barberos', 'Barberos'], ['clientes', 'Clientes'], ['servicios', 'Servicios'], ['inventario', 'Materiales'], ['productos', 'Productos'], ['compras', 'Compras'], ['movimientos', 'Movimientos'], ['pedidos', 'Pedidos'], ['promociones', 'Promociones']];
const barberTabs = [['agenda', 'Agenda'], ['clientes', 'Clientes'], ['fotos', 'Fotos'], ['notas', 'Notas privadas'], ['materiales', 'Materiales'], ['stats', 'Estadísticas'], ['horario', 'Horario']];
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
  return <main id="contenido" className="client-page staff-page"><p className="overline">BARBER LINDEROS</p><h1>{role === 'admin' ? 'Administración' : 'Mi espacio de barbero'}</h1><p data-testid="identity">Hola, {name}.</p><nav className="client-nav" aria-label="Secciones del panel">{tabs.map(([key, title]) => <Link key={key} to={href(key)} aria-current={tab === key ? 'page' : undefined}>{title}</Link>)}</nav>{requested !== translated && <p>Sección actualizada: {tabs.find(([key]) => key === tab)?.[1]}.</p>}<h2>{tabs.find(([key]) => key === tab)?.[1]}</h2><button onClick={refresh}>Actualizar panel</button>{connection && <p role="status">{connection}</p>}<section key={tab} className="staff-section">{role === 'barbero' ? <BarberSection tab={tab} revision={revision} /> : tab === 'resumen' ? <StaffOverview revision={revision} /> : tab === 'agenda' ? <StaffAgenda revision={revision} /> : tab === 'barberos' ? <StaffBarbers revision={revision} /> : tab === 'clientes' ? <StaffClients revision={revision} /> : tab === 'servicios' ? <StaffServices revision={revision} /> : tab === 'inventario' ? <StaffMaterials admin revision={revision} /> : tab === 'productos' ? <StaffProducts revision={revision} /> : tab === 'compras' ? <StaffPurchases revision={revision} /> : tab === 'movimientos' ? <StaffMovements revision={revision} /> : tab === 'pedidos' ? <StaffOrders revision={revision} /> : <StaffPromotions revision={revision} />}</section></main>;
}
export function StaffPanel({ role }: { role: 'admin' | 'barbero' }) { return <StaffGuard role={role}>{user => <Panel role={role} name={user.name} />}</StaffGuard>; }
