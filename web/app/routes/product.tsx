import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ClientNav, errorText, money, ProductImage } from '../client';
import { AddProduct, loadProduct, type Product } from '../products';
export const meta = () => [{ title: 'Producto — Barber Linderos' }, { name: 'robots', content: 'noindex, follow' }];
export default function ProductDetail() {
  const [params] = useSearchParams(), id = params.get('id') || '';
  const [product, setProduct] = useState<Product | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const revision = useRef(0);
  async function load() {
    const version = ++revision.current; setError(''); setLoading(true); setProduct(null);
    try { if (!id) throw new Error('Falta el producto. Elige uno desde la tienda.'); const data = await loadProduct(id); if (version === revision.current) setProduct(data); }
    catch (error) { if (version === revision.current) setError(errorText(error)); }
    finally { if (version === revision.current) setLoading(false); }
  }
  useEffect(() => { void load(); const focus = () => void load(); window.addEventListener('focus', focus); return () => { revision.current++; window.removeEventListener('focus', focus); }; }, [id]);
  return <main id="contenido" className="client-page"><ClientNav /><Link to="/tienda">← Volver a la tienda</Link><h1>{product?.name || 'Producto'}</h1>{loading && <p role="status">Consultando producto…</p>}{error && <p role="alert">{error} <button onClick={load}>Reintentar producto</button></p>}{product && <article className="client-card product-detail"><ProductImage url={product.image_url} name={product.name} /><div><p>{product.description || 'Consulta los detalles de este producto con la barbería.'}</p><p>{money(product.price)} · {product.stock ? product.stock + ' disponibles' : 'Agotado'}</p><AddProduct key={product.id} product={product} /></div></article>}</main>;
}
