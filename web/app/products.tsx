import { useState } from 'react';
import { Link } from 'react-router';
import { get } from './http';
import { money, ProductImage } from './client';
import { useCart } from './cart';
export type Product = { id: string; name: string; description: string | null; price: number; stock: number; image_url: string | null; category?: string | null };
export function productView(value: Product): Product {
  const price = Number(value.price), stock = Number(value.stock);
  if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(stock) || stock < 0) throw new Error('El producto no tiene un precio o stock válido.');
  return { ...value, price, stock };
}
export async function loadProduct(id: string) { return productView((await get<{ product: Product }>('/products/' + encodeURIComponent(id))).product); }
export function AddProduct({ product }: { product: Product }) {
  const cart = useCart(); const [quantity, setQuantity] = useState(1), [added, setAdded] = useState(false);
  const existing = cart.items.find(item => item.productId === product.id)?.quantity || 0;
  const full = cart.items.length >= 50 && existing === 0;
  return <div className="add-product"><label>Cantidad de {product.name}<input type="number" min={1} max={product.stock || 1} step={1} value={quantity} onChange={event => { setQuantity(Number(event.target.value)); setAdded(false); }} /></label>
    <button disabled={!cart.ready || full || product.stock < existing + quantity || !Number.isSafeInteger(quantity) || quantity < 1} onClick={() => { cart.add(product.id, quantity, product.stock); setAdded(true); }}>Agregar al carrito</button>
    {full && <p>El carrito admite hasta cincuenta productos distintos.</p>}
    {added && <p role="status">Agregado al carrito. <Link to="/carrito">Revisar carrito</Link></p>}
  </div>;
}
export function ProductCard({ product }: { product: Product }) {
  return <article className="client-card product-card" data-testid="product"><Link to={'/producto?id=' + encodeURIComponent(product.id)}><ProductImage url={product.image_url} name={product.name} /><h2>{product.name}</h2></Link><p>{money(product.price)} · {product.stock ? 'Disponible' : 'Agotado'}</p><AddProduct product={product} /></article>;
}
