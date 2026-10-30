import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ClientGuard, ClientNav, errorText, localDate, money, statusText, useLive } from '../client';
import { get } from '../http';
import type { User } from '../session';
type Order = { id: string; buy_order: string; total: number; status: string; created_at: string; paymentMode: string; requiresReconciliation: boolean; items: { productId: string; name: string; price: number; quantity: number }[] };
export const meta = () => [{ title: 'Mis pedidos — Barber Linderos' }, { name: 'robots', content: 'noindex, nofollow' }];
function Orders({ user }: { user: User }) {
  const [params] = useSearchParams(), id = params.get('orderId');
  const [orders, setOrders] = useState<Order[]>([]), [selected, setSelected] = useState<Order | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [number, setNumber] = useState('');
  const revision = useRef(0), live = useRef(true);
  useEffect(() => { get<{ whatsappBusinessNumber: string }>('/config').then(data => { if (live.current && /^[1-9]\d{7,14}$/.test(data.whatsappBusinessNumber)) setNumber(data.whatsappBusinessNumber); }).catch(() => {}); return () => { live.current = false; revision.current++; }; }, []);
  async function refresh() {
    const version = ++revision.current;
    try {
      const data = await get<{ orders: Order[] }>('/orders');
      const detail = id ? (await get<{ order: Order }>('/orders/' + encodeURIComponent(id))).order : null;
      if (live.current && version === revision.current) { setOrders(data.orders); setSelected(detail); setError(''); setLoading(false); }
    } catch (error) { if (live.current && version === revision.current) { setOrders([]); setSelected(null); setError(errorText(error)); setLoading(false); } }
  }
  useEffect(() => { revision.current++; setSelected(null); setLoading(true); void refresh(); }, [id]);
  const connection = useLive('private', refresh);
  const visible = selected ? [selected] : orders;
  return <main id="contenido" className="client-page"><ClientNav /><h1>Mis pedidos</h1><p data-testid="identity">Hola, {user.name}.</p><button onClick={refresh}>Actualizar pedidos</button>{id && <Link to="/mi-cuenta/pedidos">Ver todos mis pedidos</Link>}
    {loading && <p role="status">Consultando pedidos…</p>}{connection && <p role="status">{connection}</p>}{error && <p role="alert">{error}</p>}{!loading && !error && !visible.length && <p>Aún no tienes pedidos.</p>}
    {visible.map(order => <article className="client-card order-card" key={order.id} data-testid="order"><h2>Pedido <span className="order-reference">{order.buy_order}</span></h2><p>{localDate(order.created_at)} · <strong>{statusText[order.status] || order.status}</strong></p><ul>{order.items.map((item, index) => <li key={index}>{item.name} · {item.quantity} × {money(Number(item.price))}</li>)}</ul><p>Total confirmado: {money(Number(order.total))}</p>
      {order.requiresReconciliation ? <p>Este pedido requiere conciliación con la barbería antes de continuar. No se inicia ningún cobro desde esta página.</p> : order.status === 'pending' ? <><p>Pago manual pendiente. Este pedido no reserva stock; la barbería confirma pago y disponibilidad.</p>{number && <a href={'https://wa.me/' + number + '?text=' + encodeURIComponent('Hola, quiero coordinar el pedido ' + order.buy_order + ' por ' + money(Number(order.total)) + '.')} target="_blank" rel="noopener noreferrer">Coordinar por WhatsApp ↗</a>}</> : null}
      {!id && <Link to={'/mi-cuenta/pedidos?orderId=' + encodeURIComponent(order.id)}>Ver detalle del pedido</Link>}
    </article>)}
  </main>;
}
export default function OrdersRoute() { return <ClientGuard>{user => <Orders user={user} />}</ClientGuard>; }
