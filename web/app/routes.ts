import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('politicas-de-servicio', 'routes/policies.tsx'),
  route('ingresar', 'routes/login.tsx'),
  route('registro', 'routes/register.tsx'),
  route('reservar', 'routes/booking.tsx'),
  route('mi-cuenta/reservas', 'routes/history.tsx'),
  route('tienda', 'routes/shop.tsx'),
  route('producto', 'routes/product.tsx'),
  route('carrito', 'routes/cart-page.tsx'),
  route('mi-cuenta/pedidos', 'routes/orders.tsx'),
  route('administracion', 'routes/admin.tsx'),
  route('barbero', 'routes/barber.tsx'),
  route('*', 'routes/remaining.tsx'),
] satisfies RouteConfig;
