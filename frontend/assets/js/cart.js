/* ============================================================
   BARBER LINDEROS — Carrito de compras (tienda)
   Modulo compartido: localStorage + icono flotante + drawer +
   checkout via Mercado Pago (Checkout Pro). Se incluye despues de
   api.js en cualquier pagina publica o de cliente que quiera
   ofrecer la tienda (/, /tienda, cliente/*.html).
   Para excluirlo de una pagina, agregar data-no-cart al <body>.
   ============================================================ */

const CART_KEY = 'bl_cart';

const Cart = {
  getItems() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },
  saveItems(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateCartBadge();
  },
  addItem(product, quantity = 1) {
    const items = this.getItems();
    const existing = items.find((i) => i.productId === product.id);
    const maxQty = product.stock ?? 999;
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, maxQty);
    } else {
      items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        image_url: product.image_url || null,
        stock: product.stock,
        quantity: Math.min(quantity, maxQty),
      });
    }
    this.saveItems(items);
  },
  updateQuantity(productId, quantity) {
    let items = this.getItems();
    if (quantity <= 0) {
      items = items.filter((i) => i.productId !== productId);
    } else {
      const item = items.find((i) => i.productId === productId);
      if (item) item.quantity = Math.min(quantity, item.stock ?? 999);
    }
    this.saveItems(items);
  },
  removeItem(productId) {
    this.saveItems(this.getItems().filter((i) => i.productId !== productId));
  },
  clear() {
    this.saveItems([]);
  },
  getCount() {
    return this.getItems().reduce((sum, i) => sum + i.quantity, 0);
  },
  getTotal() {
    return this.getItems().reduce((sum, i) => sum + i.price * i.quantity, 0);
  },
};

function money(n) { return `$${Number(n).toLocaleString('es-CL')}`; }

function updateCartBadge() {
  const badge = document.getElementById('bl-cart-badge');
  if (!badge) return;
  const count = Cart.getCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function renderCartDrawer() {
  const body = document.getElementById('bl-cart-body');
  const footer = document.getElementById('bl-cart-footer');
  if (!body) return;
  const items = Cart.getItems();

  if (items.length === 0) {
    body.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:40px 12px;">Tu carrito esta vacio.</p>`;
    footer.innerHTML = '';
    return;
  }

  const imgBase = API_BASE_URL.replace('/api', '');
  body.innerHTML = items.map((i) => `
    <div style="display:flex; gap:12px; align-items:center; padding:14px 0; border-bottom:1px solid var(--border);">
      <div style="width:52px; height:52px; border-radius:8px; background:var(--bg-elevated); flex-shrink:0; overflow:hidden; display:flex; align-items:center; justify-content:center;">
        ${i.image_url ? `<img src="${i.image_url.startsWith('http') ? i.image_url : imgBase + i.image_url}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:var(--text-faint); font-size:0.7rem;">Sin foto</span>'}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:0.9rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.name}</div>
        <div style="color:var(--gold-bright); font-size:0.85rem; margin-top:2px;">${money(i.price)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:4px;">
        <button class="btn btn-outline btn-sm" style="padding:8px 13px; min-width:36px;" data-cart-dec="${i.productId}">−</button>
        <span style="min-width:22px; text-align:center;">${i.quantity}</span>
        <button class="btn btn-outline btn-sm" style="padding:8px 13px; min-width:36px;" data-cart-inc="${i.productId}">+</button>
      </div>
      <button data-cart-remove="${i.productId}" style="background:none; border:none; color:var(--text-faint); font-size:1.2rem; padding:10px; min-width:36px; min-height:36px;">×</button>
    </div>
  `).join('');

  footer.innerHTML = `
    <div style="display:flex; justify-content:space-between; padding:16px 0; font-weight:700; font-size:1.05rem;">
      <span>Total</span><span class="text-gold">${money(Cart.getTotal())}</span>
    </div>
    <button id="bl-cart-checkout" class="btn btn-primary btn-block">Comprar por WhatsApp</button>
  `;

  body.querySelectorAll('[data-cart-inc]').forEach((btn) => btn.addEventListener('click', () => {
    const item = Cart.getItems().find((i) => i.productId === btn.dataset.cartInc);
    if (item) Cart.updateQuantity(item.productId, item.quantity + 1);
    renderCartDrawer();
  }));
  body.querySelectorAll('[data-cart-dec]').forEach((btn) => btn.addEventListener('click', () => {
    const item = Cart.getItems().find((i) => i.productId === btn.dataset.cartDec);
    if (item) Cart.updateQuantity(item.productId, item.quantity - 1);
    renderCartDrawer();
  }));
  body.querySelectorAll('[data-cart-remove]').forEach((btn) => btn.addEventListener('click', () => {
    Cart.removeItem(btn.dataset.cartRemove);
    renderCartDrawer();
  }));

  const checkoutBtn = document.getElementById('bl-cart-checkout');
  if (checkoutBtn) checkoutBtn.addEventListener('click', checkout);
}

async function checkout() {
  const user = Auth.getUser();
  if (!Auth.isLoggedIn() || !user) {
    showToast('Inicia sesion como cliente para pagar.', 'error');
    // Al volver de iniciar sesion o crear cuenta, redirectForRole() lee esta
    // marca y devuelve al cliente a la tienda para retomar el pago, en vez
    // de mandarlo siempre al wizard de reserva de horas.
    localStorage.setItem('bl_resume_checkout', '1');
    window.location.href = siteUrl('/ingresar');
    return;
  }
  if (user.role !== 'cliente') {
    showToast('Solo los clientes pueden comprar productos.', 'error');
    return;
  }

  const items = Cart.getItems();
  if (items.length === 0) return;

  const btn = document.getElementById('bl-cart-checkout');
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

  try {
    const { order } = await apiRequest('/orders', {
      method: 'POST',
      body: { items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
    });

    const lines = order.items.map((i) => `- ${i.name} x${i.quantity} (${money(i.price * i.quantity)})`).join('\n');
    const text = `Hola! Quiero comprar (Orden ${order.buyOrder}):\n${lines}\n\nTotal: ${money(order.total)}\n\n¿Me pueden enviar los datos para pagar?`;
    const config = await getPublicConfig();

    Cart.clear();
    window.location.href = buildWhatsAppLink(config.whatsappBusinessNumber, text);
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Comprar por WhatsApp'; }
  }
}

function injectCartUI() {
  if (document.getElementById('bl-cart-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'bl-cart-fab';
  fab.setAttribute('aria-label', 'Ver carrito');
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
    </svg>
    <span id="bl-cart-badge"></span>
  `;
  Object.assign(fab.style, {
    position: 'fixed', bottom: '24px', left: '24px', width: '58px', height: '58px',
    borderRadius: '50%', background: 'var(--gold)', color: '#16130a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: '998', border: 'none', cursor: 'pointer',
  });

  const badge = fab.querySelector('#bl-cart-badge');
  Object.assign(badge.style, {
    position: 'absolute', top: '-4px', right: '-4px', minWidth: '20px', height: '20px',
    borderRadius: '10px', background: 'var(--danger)', color: '#fff', fontSize: '0.7rem',
    fontWeight: '700', display: 'none', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
  });

  const overlay = document.createElement('div');
  overlay.id = 'bl-cart-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', zIndex: '999',
    opacity: '0', pointerEvents: 'none', transition: 'opacity 0.3s ease',
  });

  const drawer = document.createElement('div');
  drawer.id = 'bl-cart-drawer';
  drawer.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:24px; border-bottom:1px solid var(--border);">
      <h3 style="font-size:1.1rem;">Tu carrito</h3>
      <button id="bl-cart-close" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer;">×</button>
    </div>
    <div id="bl-cart-body" style="flex:1; overflow-y:auto; padding:0 24px;"></div>
    <div id="bl-cart-footer" style="padding:20px 24px; border-top:1px solid var(--border);"></div>
  `;
  Object.assign(drawer.style, {
    position: 'fixed', top: '0', right: '0', bottom: '0', width: 'min(400px, 100vw)',
    background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: '1000',
    display: 'flex', flexDirection: 'column',
    transform: 'translateX(100%)', transition: 'transform 0.35s var(--ease, ease)',
  });

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
  document.body.appendChild(fab);

  function openDrawer() {
    renderCartDrawer();
    drawer.style.transform = 'translateX(0)';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
  }
  function closeDrawer() {
    drawer.style.transform = 'translateX(100%)';
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
  }

  fab.addEventListener('click', openDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.getElementById('bl-cart-close').addEventListener('click', closeDrawer);

  updateCartBadge();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.body.hasAttribute('data-no-cart')) {
    injectCartUI();
    resumeCheckoutIfNeeded();
  }
});

// Si venimos de crear cuenta / iniciar sesion a mitad de un pago (ver checkout()
// y Auth.redirectForRole en api.js), reabre el carrito y reintenta el pago solo.
function resumeCheckoutIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') !== '1') return;

  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  window.history.replaceState({}, '', url);

  if (!Auth.isLoggedIn() || Cart.getItems().length === 0) return;

  document.getElementById('bl-cart-fab')?.click();
  setTimeout(() => checkout(), 250);
}
