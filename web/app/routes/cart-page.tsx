import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useCart, type CartLine } from '../cart';
import { ClientNav, errorText, money, ProductImage } from '../client';
import { ApiError, mutate } from '../http';
import { loadProduct, type Product } from '../products';
import { useSession } from '../session';
type Row = CartLine & { product?: Product; error?: string };
type Review = { rows: Row[]; total: number; signature: string; valid: boolean };
export const meta = () => [{ title: 'Tu carrito — Barber Linderos' }, { name: 'robots', content: 'noindex, nofollow' }];
export default function CartPage() {
  const cart = useCart(), session = useSession();
  const [review, setReview] = useState<Review | null>(null), [pending, setPending] = useState(false), [message, setMessage] = useState(''), [uncertain, setUncertain] = useState(false);
  const [created, setCreated] = useState<{ id: string; buyOrder: string; total: number; ownerId?: string } | null>(null);
  const lock = useRef(false), mounted = useRef(true), revision = useRef(0), current = useRef(''), identity = useRef(session.user?.id);
  const basket = JSON.stringify(cart.items); current.current = basket; identity.current = session.user?.id;
  useEffect(() => () => { mounted.current = false; revision.current++; }, []);
  useEffect(() => { revision.current++; setReview(null); }, [basket]);
  useEffect(() => { revision.current++; setCreated(null); setReview(null); setUncertain(false); setMessage(''); }, [session.user?.id]);
  async function inspect(items: CartLine[]): Promise<Review> {
    const rows: Row[] = await Promise.all(items.map(async (item): Promise<Row> => {
      try { const product = await loadProduct(item.productId); return { ...item, product, error: item.quantity > product.stock ? 'No hay stock suficiente. Ajusta la cantidad o elimina este producto.' : undefined }; }
      catch (error) { return { ...item, error: error instanceof ApiError && error.status === 404 ? 'Producto no disponible. Elimínalo para continuar.' : errorText(error) }; }
    }));
    let total = 0, valid = rows.length > 0 && rows.every(row => !row.error && row.product);
    for (const row of rows) if (row.product) { const line = row.product.price * row.quantity; if (!Number.isSafeInteger(line) || !Number.isSafeInteger(total + line)) { valid = false; total = 0; break; } total += line; }
    if (total < 1) valid = false;
    return { rows, total, valid, signature: JSON.stringify(rows.map(row => [row.productId, row.quantity, row.product?.name, row.product?.price, row.product?.stock, row.error])) };
  }
  async function check() {
    if (lock.current || session.status === 'checking') return;
    lock.current = true; setPending(true); setMessage(''); const version = ++revision.current, expected = current.current;
    try { const result = await inspect(cart.items); if (mounted.current && version === revision.current && expected === current.current) setReview(result); }
    catch (error) { if (mounted.current) setMessage(errorText(error)); }
    finally { lock.current = false; if (mounted.current) setPending(false); }
  }
  async function checkout() {
    if (lock.current || !review?.valid || uncertain || session.user?.role !== 'cliente') return;
    lock.current = true; setPending(true); setMessage(''); const expected = current.current, owner = identity.current, items = cart.items.map(item => ({ ...item }));
    let sent = false;
    try {
      const latest = await inspect(items);
      if (!mounted.current || expected !== current.current || owner !== identity.current) return;
      if (!latest.valid || review.signature !== latest.signature) { setReview(latest); setMessage('El precio o stock cambió. Revisa el carrito actualizado antes de confirmar nuevamente.'); return; }
      sent = true;
      const result = await mutate<{ order: NonNullable<typeof created> }>('/orders', { items });
      if (!mounted.current || owner !== identity.current) return;
      setCreated({ ...result.order, ownerId: owner }); cart.consume(items); setReview(null);
    } catch (error) {
      if (!mounted.current || owner !== identity.current) return;
      if (sent && error instanceof ApiError && [0, 500, 502, 503].includes(error.status)) { setUncertain(true); setMessage('No conocemos el resultado del envío. Revisa Mis pedidos antes de preparar otro envío; no repetimos la compra automáticamente.'); }
      else { setReview(null); setMessage(error instanceof ApiError && [404, 409].includes(error.status) ? 'Cambió la disponibilidad. Revisa nuevamente los productos antes de continuar.' : errorText(error)); }
    } finally { lock.current = false; if (mounted.current) setPending(false); }
  }
  return <main id="contenido" className="client-page"><ClientNav /><h1>Tu carrito.</h1><p>Revisa precio y disponibilidad antes de crear el pedido. Un pedido pendiente no reserva stock ni confirma un pago.</p>
    {cart.warning && <p role="alert">{cart.warning}</p>}{!cart.ready && <p role="status">Recuperando carrito…</p>}
    {created && created.ownerId === session.user?.id && <section className="client-card" role="status"><h2>Pedido creado</h2><p>Referencia {created.buyOrder} · Total confirmado: {money(Number(created.total))}</p><p>Pendiente de pago. Coordina el pago con la barbería.</p><Link className="v-button" to={'/mi-cuenta/pedidos?orderId=' + encodeURIComponent(created.id)}>Consultar mi pedido</Link></section>}
    {cart.ready && !cart.items.length && <p>Tu carrito está vacío. <Link to="/tienda">Explorar la tienda</Link></p>}
    <div className="cart-lines">{cart.items.map(item => {
      const row = review?.rows.find(row => row.productId === item.productId);
      return <article className="client-card cart-line" key={item.productId} data-testid="cart-line">{row?.product && <ProductImage url={row.product.image_url} name={row.product.name} />}<div><Link to={'/producto?id=' + encodeURIComponent(item.productId)}>{row?.product?.name || 'Producto ' + item.productId}</Link>{row?.product && <p>{money(row.product.price)} por unidad · {row.product.stock} disponibles</p>}{row?.error && <p role="alert">{row.error}</p>}
        <label>Cantidad de {item.productId}<input type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} value={item.quantity} disabled={pending} onChange={event => { const quantity = Number(event.target.value); if (Number.isSafeInteger(quantity) && quantity >= 1) cart.change(item.productId, quantity); }} /></label><button disabled={pending} onClick={() => cart.change(item.productId, 0)}>Eliminar producto</button></div></article>;
    })}</div>
    {message && <p className="form-error" role="alert">{message} <Link to="/mi-cuenta/pedidos">Mis pedidos</Link></p>}
    {!!cart.items.length && <section className="client-card"><button disabled={pending || session.status === 'checking'} onClick={check}>{pending ? 'Comprobando…' : 'Revisar precio y stock'}</button>
      {review && <><p>Total revisado: {money(review.total)}</p>{!review.valid && <p role="alert">El carrito no está listo: revisa disponibilidad, cantidades e importes. El total debe ser positivo y estar dentro del límite permitido.</p>}</>}
      {session.status === 'checking' ? <p role="status">Comprobando tu sesión…</p> : !session.user ? <Link to="/ingresar?returnTo=%2Fcarrito">Ingresar para crear pedido</Link> : session.user.role !== 'cliente' ? <p>Para comprar necesitas una cuenta de cliente.</p> : <button className="v-button" disabled={pending || !review?.valid || uncertain} onClick={checkout}>Crear pedido manual</button>}
      {uncertain && <button disabled={pending} onClick={() => { setUncertain(false); setReview(null); setMessage('Revisa nuevamente el carrito antes de preparar otro envío.'); }}>Ya revisé mis pedidos; preparar otro envío</button>}
    </section>}
  </main>;
}
