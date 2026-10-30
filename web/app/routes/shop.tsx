import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router';
import { ClientNav, errorText } from '../client';
import { get } from '../http';
import { ProductCard, productView, type Product } from '../products';
type Catalog = { products: Product[]; total: number; page: number; totalPages: number };
export const meta = () => [{ title: 'La tienda Linderos — Productos de barbería' }, { name: 'robots', content: 'noindex, follow' }];
const sorts: Record<string, string> = { relevancia: 'Relevancia', mas_vendidos: 'Más vendidos', alfabetico_az: 'Nombre A–Z', alfabetico_za: 'Nombre Z–A', precio_asc: 'Menor precio', precio_desc: 'Mayor precio', fecha_antiguo: 'Más antiguos', fecha_reciente: 'Más recientes' };
export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const revision = useRef(0); const query = params.toString();
  async function load() {
    const version = ++revision.current; setLoading(true); setError('');
    try { const result = await get<Catalog>('/products?' + query); if (version === revision.current) setCatalog({ ...result, products: result.products.map(productView) }); }
    catch (error) { if (version === revision.current) { setError(errorText(error)); setCatalog(null); } }
    finally { if (version === revision.current) setLoading(false); }
  }
  useEffect(() => { void load(); const focus = () => void load(); window.addEventListener('focus', focus); return () => { revision.current++; window.removeEventListener('focus', focus); }; }, [query]);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const next = new URLSearchParams();
    for (const key of ['minPrice', 'maxPrice', 'sort']) { const value = String(data.get(key) || ''); if (value !== '') next.set(key, value); }
    for (const value of data.getAll('availability')) next.append('availability', String(value));
    const min = data.get('minPrice'), max = data.get('maxPrice');
    if (min !== '' && max !== '' && Number(min) > Number(max)) { setError('El precio mínimo no puede superar al máximo.'); return; }
    setParams(next);
  }
  function page(value: number) { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); }
  return <main id="contenido" className="client-page"><ClientNav /><p className="overline">TU ESTILO SIGUE EN CASA</p><h1>La tienda Linderos.</h1>
    <form key={query} className="shop-filters client-card" onSubmit={filter}><fieldset><legend>Filtrar productos</legend><label>Precio mínimo<input type="number" name="minPrice" min={0} max={Number.MAX_SAFE_INTEGER} step={1} defaultValue={params.get('minPrice') || ''} /></label><label>Precio máximo<input type="number" name="maxPrice" min={0} max={Number.MAX_SAFE_INTEGER} step={1} defaultValue={params.get('maxPrice') || ''} /></label>
      <label>Ordenar por<select name="sort" defaultValue={params.get('sort') || 'relevancia'}>{Object.entries(sorts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="check-label"><input type="checkbox" name="availability" value="in_stock" defaultChecked={params.getAll('availability').includes('in_stock')} />En stock</label><label className="check-label"><input type="checkbox" name="availability" value="out_of_stock" defaultChecked={params.getAll('availability').includes('out_of_stock')} />Agotados</label>
      <button type="submit">Aplicar filtros</button><Link to="/tienda">Limpiar filtros</Link></fieldset></form>
    {loading && <p role="status">Consultando productos…</p>}{error && <p className="form-error" role="alert">{error} <button onClick={load}>Reintentar catálogo</button></p>}
    {!loading && catalog && <><p role="status">{catalog.total} productos · Página {catalog.page} de {catalog.totalPages}</p>{!catalog.products.length && <p>No hay productos para estos filtros.</p>}<div className="product-grid">{catalog.products.map(product => <ProductCard key={product.id} product={product} />)}</div><nav className="client-actions" aria-label="Páginas de productos"><button disabled={catalog.page <= 1} onClick={() => page(catalog.page - 1)}>Página anterior</button><button disabled={catalog.page >= catalog.totalPages} onClick={() => page(catalog.page + 1)}>Página siguiente</button></nav></>}
  </main>;
}
