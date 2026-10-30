import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useSession } from '../session';
import { roleHome } from '../paths.mjs';

export function Header() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const staffView = location.pathname === '/administracion' || location.pathname === '/barbero';
  useEffect(() => { setOpen(false); }, [location.pathname, location.hash]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); }
    };
    const resize = () => { if (window.innerWidth > 1050) setOpen(false); };
    document.addEventListener('keydown', close);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('keydown', close); window.removeEventListener('resize', resize); };
  }, [open]);
  async function logout() {
    setPending(true); setError('');
    try { await session.logout(); navigate('/ingresar', { replace: true }); }
    catch (error) { setError(error instanceof Error ? error.message : 'No pudimos cerrar la sesión.'); }
    finally { setPending(false); }
  }
  return <>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <header className="masthead">
      <Link className="wordmark" to="/" aria-label="Barber Linderos, inicio"><img className="brand-logo" src="/assets/img/linderos-logo-v2.png" alt="The Linderos Barber" width="1235" height="848" /></Link>
      <button ref={toggle} className="menu-toggle" type="button" aria-expanded={open} aria-controls="main-nav" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen(!open)}><span /><span /></button>
      <nav id="main-nav" className={open ? 'open' : ''} aria-label="Navegación principal" onClick={() => setOpen(false)}>
        {staffView ? <Link to="/">Volver al sitio ↗</Link> : <><Link to="/#ritual">El ritual</Link><Link to="/#servicios">Servicios</Link><Link to="/#barberos">Barberos</Link><Link to="/tienda">La tienda</Link><Link to="/carrito">Carrito</Link></>}
        <Link className="nav-account" to={session.user ? roleHome(session.user.role) : '/ingresar'}>Mi cuenta</Link>
        {!staffView && <Link className="nav-book" to="/reservar">Reservar hora <span>↗</span></Link>}
        {session.user && <button className="session-close" type="button" disabled={pending} onClick={logout}>{pending ? 'Cerrando…' : 'Cerrar sesión'}</button>}
      </nav>
    </header>
    {error && <p className="global-message" role="alert">{error}</p>}
  </>;
}
