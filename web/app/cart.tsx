import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type CartLine = { productId: string; quantity: number };
export const CART_KEY = 'bl_cart';
export function normalizeCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const result: CartLine[] = [];
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item.productId !== 'string' || !item.productId || item.productId.length > 191 || /[\u0000-\u001f]/.test(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) continue;
    const existing = result.find(line => line.productId === item.productId);
    if (existing) { if (Number.isSafeInteger(existing.quantity + item.quantity)) existing.quantity += item.quantity; }
    else if (result.length < 50) result.push({ productId: item.productId, quantity: item.quantity });
  }
  return result;
}
type Cart = { items: CartLine[]; ready: boolean; warning: string; change: (id: string, quantity: number) => void; add: (id: string, quantity: number, max: number) => void; consume: (items: CartLine[]) => void };
const Context = createContext<Cart | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]), [ready, setReady] = useState(false), [warning, setWarning] = useState('');
  const durable = useRef(true);
  const current = useRef(items); current.current = items;
  useEffect(() => {
    function load() {
      try { setItems(normalizeCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'))); }
      catch { durable.current = false; setItems([]); setWarning('No pudimos recuperar el carrito guardado. Puedes preparar uno nuevo.'); }
      setReady(true);
    }
    load();
    const sync = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) load(); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); }
    catch { durable.current = false; setWarning('El almacenamiento está deshabilitado. Conservaremos el carrito solo mientras esta página siga abierta.'); }
  }, [items, ready]);
  function change(id: string, quantity: number) {
    if (!Number.isSafeInteger(quantity) || quantity < 0) return;
    setItems(previous => normalizeCart(quantity === 0 ? previous.filter(item => item.productId !== id) : previous.some(item => item.productId === id) ? previous.map(item => item.productId === id ? { productId: id, quantity } : item) : [...previous, { productId: id, quantity }]));
  }
  function add(id: string, quantity: number, max: number) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || max < 1) return;
    const existing = current.current.find(item => item.productId === id)?.quantity || 0;
    change(id, Math.min(existing + quantity, max));
  }
  function consume(ordered: CartLine[]) {
    // Releer antes de descontar para conservar cambios concurrentes de otra pestaña.
    let latest = current.current;
    try { if (durable.current) latest = normalizeCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]')); } catch { /* carrito en memoria */ }
    setItems(latest.flatMap(item => { const quantity = item.quantity - (ordered.find(line => line.productId === item.productId)?.quantity || 0); return quantity > 0 ? [{ ...item, quantity }] : []; }));
  }
  return <Context.Provider value={{ items, ready, warning, change, add, consume }}>{children}</Context.Provider>;
}
export function useCart() { const cart = useContext(Context); if (!cart) throw new Error('Falta CartProvider.'); return cart; }
