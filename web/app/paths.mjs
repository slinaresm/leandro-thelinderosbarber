// Contrato compartido con el servidor estático: no duplicar alias en otro sitio.
export const aliases = {
  '/index.html': '/', '/login.html': '/ingresar', '/register.html': '/registro',
  '/politicas-servicio.html': '/politicas-de-servicio', '/productos.html': '/tienda',
  '/producto.html': '/producto', '/cliente/reservar.html': '/reservar',
  '/cliente/historial.html': '/mi-cuenta/reservas',
  '/admin/dashboard.html': '/administracion', '/barbero/dashboard.html': '/barbero',
};
export const routeRoles = {
  '/mi-cuenta/pedidos': 'cliente', '/mi-cuenta/reservas': 'cliente', '/administracion': 'admin', '/barbero': 'barbero',
};
export const canonicalPaths = ['/', '/ingresar', '/registro', '/politicas-de-servicio',
  '/carrito', '/reservar', '/tienda', '/producto', ...Object.keys(routeRoles)];
export function roleHome(role) {
  return role === 'admin' ? '/administracion' : role === 'barbero' ? '/barbero' : '/mi-cuenta/reservas';
}
export function safeReturnTo(value, role) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return roleHome(role);
  const url = new URL(value, 'https://local.invalid');
  const pathname = aliases[url.pathname] || url.pathname;
  if (pathname.includes('%') || !canonicalPaths.includes(pathname) || ['/ingresar', '/registro'].includes(pathname)) return roleHome(role);
  if (routeRoles[pathname] && routeRoles[pathname] !== role) return roleHome(role);
  return pathname + url.search + url.hash;
}
