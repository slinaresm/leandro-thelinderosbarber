/* Public catalogue: kept external so it remains compatible with the site's strict CSP. */
window.__storefrontLoaded = true;

(() => {
  const state = { page: 1, sort: 'relevancia', availability: null, minPrice: '', maxPrice: '' };
  let productsCache = [];
  const byId = (id) => document.getElementById(id);
  const money = (amount) => `$${Number(amount).toLocaleString('es-CL')}`;

  function buildQuery() {
    const params = new URLSearchParams({ page: state.page, sort: state.sort });
    if (state.availability) params.set('availability', state.availability);
    if (state.minPrice) params.set('minPrice', state.minPrice);
    if (state.maxPrice) params.set('maxPrice', state.maxPrice);
    return params.toString();
  }

  function escapeHtml(value) {
    const template = document.createElement('div');
    template.textContent = value || '';
    return template.innerHTML;
  }

  function renderProducts(products) {
    const grid = byId('products-grid');
    if (!products.length) {
      grid.innerHTML = '<div class="empty-state">No encontramos productos con estos filtros. Prueba ajustando la disponibilidad o el rango de precio.</div>';
      return;
    }
    grid.innerHTML = products.map((product) => {
      const productUrl = `/producto?id=${encodeURIComponent(product.id)}`;
      const image = product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy">`
        : '<span class="no-photo">Próximamente</span>';
      const stockLabel = product.stock > 0 ? 'En existencia' : 'Agotado';
      const button = product.stock > 0
        ? `<button class="btn btn-primary btn-block btn-sm" data-add="${escapeHtml(product.id)}">Agregar al carrito</button>`
        : '<button class="btn btn-outline btn-block btn-sm" disabled>Sin stock</button>';
      return `<article class="product-card">
        <a href="${productUrl}" class="product-thumb">${image}<span class="badge stock-flag ${product.stock > 0 ? 'badge-success' : 'badge-danger'}">${stockLabel}</span></a>
        <div class="product-body"><p class="category">${escapeHtml(product.category || 'Barber Linderos')}</p>
          <a href="${productUrl}"><h3>${escapeHtml(product.name)}</h3></a>
          <p class="desc">${escapeHtml(product.description || 'Producto seleccionado para tu rutina de cuidado.')}</p>
          <div class="price-row"><span class="price">${money(product.price)}</span></div>${button}
        </div></article>`;
    }).join('');
    grid.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => {
      const product = productsCache.find((item) => item.id === button.dataset.add);
      if (!product) return;
      Cart.addItem(product, 1);
      showToast(`${product.name} agregado al carrito.`, 'success');
    }));
  }

  function renderPagination(totalPages, page) {
    const element = byId('pagination');
    if (totalPages <= 1) { element.replaceChildren(); return; }
    element.innerHTML = `${page > 1 ? `<button class="page-btn" data-page="${page - 1}" aria-label="Página anterior">‹</button>` : ''}${Array.from({ length: totalPages }, (_, index) => `<button class="page-btn ${index + 1 === page ? 'active' : ''}" data-page="${index + 1}">${index + 1}</button>`).join('')}${page < totalPages ? `<button class="page-btn" data-page="${page + 1}" aria-label="Página siguiente">›</button>` : ''}`;
    element.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
      state.page = Number(button.dataset.page);
      load();
      byId('shop-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  async function load() {
    byId('result-count').textContent = 'Cargando productos…';
    try {
      const data = await apiRequest(`/products?${buildQuery()}`, { auth: false });
      productsCache = Array.isArray(data.products) ? data.products : [];
      renderProducts(productsCache);
      renderPagination(data.totalPages || 1, data.page || 1);
      byId('result-count').textContent = `${data.total || 0} producto${data.total === 1 ? '' : 's'} disponibles`;
      byId('count-in-stock').textContent = `(${data.facets?.inStockCount || 0})`;
      byId('count-out-stock').textContent = `(${data.facets?.outOfStockCount || 0})`;
    } catch (error) {
      byId('products-grid').innerHTML = '<div class="empty-state">No pudimos cargar el catálogo. Actualiza la página o intenta nuevamente en unos segundos.</div>';
      byId('result-count').textContent = 'Catálogo no disponible';
    }
  }

  byId('sort-select').addEventListener('change', (event) => { state.sort = event.target.value; state.page = 1; load(); });
  byId('filter-in-stock').addEventListener('change', (event) => { byId('filter-out-stock').checked = false; state.availability = event.target.checked ? 'in_stock' : null; state.page = 1; load(); });
  byId('filter-out-stock').addEventListener('change', (event) => { byId('filter-in-stock').checked = false; state.availability = event.target.checked ? 'out_of_stock' : null; state.page = 1; load(); });
  let priceTimer;
  ['filter-min-price', 'filter-max-price'].forEach((id) => byId(id).addEventListener('input', () => {
    clearTimeout(priceTimer);
    priceTimer = setTimeout(() => { state.minPrice = byId('filter-min-price').value; state.maxPrice = byId('filter-max-price').value; state.page = 1; load(); }, 400);
  }));
  byId('filter-clear').addEventListener('click', () => {
    state.availability = null; state.minPrice = ''; state.maxPrice = ''; state.sort = 'relevancia'; state.page = 1;
    byId('filter-in-stock').checked = false; byId('filter-out-stock').checked = false; byId('filter-min-price').value = ''; byId('filter-max-price').value = ''; byId('sort-select').value = state.sort;
    load();
  });
  load();
})();
