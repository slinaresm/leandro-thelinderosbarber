import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation, isRouteErrorResponse, useRouteError } from 'react-router';
import { useEffect, type ReactNode } from 'react';
import { SessionProvider } from './session';
import { Header } from './components/header';
import './web.css';
import './client.css';
import './staff.css';
import { CartProvider } from './cart';

export function Layout({ children }: { children: ReactNode }) {
  return <html lang="es"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#191713" /><Meta /><Links />
    {['style', 'vintage-home', 'brand', 'cinema', 'home-refinements', 'faq', 'closing', 'footer', 'login-vintage'].map(name => <link key={name} rel="stylesheet" href={'/assets/css/' + name + '.css'} />)}
    <link rel="icon" type="image/png" href="/assets/img/linderos-logo-v2.png" />
  </head><body className="vintage-home"><div id="app">{children}</div><ScrollRestoration /><Scripts /></body></html>;
}

export default function App() {
  const location = useLocation();
  useEffect(() => {
    document.body.className = location.pathname === '/ingresar' || location.pathname === '/registro' ? 'vintage-login' : 'vintage-home';
    // Enlaces profundos después de hidratar y de cambiar de ruta.
    if (location.hash) {
      try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); } catch { /* fragmento inválido */ }
    }
  }, [location.pathname, location.hash]);
  return <SessionProvider><CartProvider><Header /><Outlet /></CartProvider></SessionProvider>;
}

export function ErrorBoundary() {
  const error = useRouteError();
  return <main id="contenido" className="status-page"><h1>{isRouteErrorResponse(error) && error.status === 404 ? 'Página no encontrada' : 'No pudimos abrir esta página'}</h1><p>Inténtalo de nuevo en unos minutos.</p><a href="/">Volver al inicio</a></main>;
}
