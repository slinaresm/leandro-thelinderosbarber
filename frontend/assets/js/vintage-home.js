/* The landing page uses native scrolling; content stays readable without animation. */
(() => {
  const menu = document.getElementById('main-nav');
  const toggle = document.querySelector('.menu-toggle');
  function closeMenu() { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Abrir menú'); }
  toggle.addEventListener('click', () => { const open = menu.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú'); });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); toggle.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 1050) closeMenu(); });
  document.getElementById('current-year').textContent = new Date().getFullYear();
  const fallbackServices = [ {name:'Corte de cabello',duration_minutes:45,price:10000}, {name:'Corte + barba',duration_minutes:60,price:15000}, {name:'Servicio premium',duration_minutes:90,price:18000} ];
  const fallbackBarbers = [{name:'Diego Morales',specialty:'Fade'}, {name:'Matías Rojas',specialty:'Clásico'}, {name:'Benjamín Soto',specialty:'Diseños'}, {name:'Nicolás Herrera',specialty:'Barba & Premium'}];
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function renderServices(services) {
    const list = document.getElementById('services-list'); list.replaceChildren();
    if (!services.length) { list.append(el('p','loading-copy','Pronto compartiremos nuestra carta. Consulta los servicios al reservar.')); return; }
    const descriptions = {
      'Corte de cabello': 'Un corte de cabello para hombre adaptado a tu estilo, con asesoría y un acabado cuidado.',
      'Corte + barba': 'Combina tu corte de cabello con un arreglo de barba para dar forma y equilibrio a tu look.',
      'Servicio premium': 'Corte de cabello, arreglo de barba y limpieza facial en una sesión de cuidado masculino.'
    };
    const labels = ['EL CLÁSICO', 'EL COMPLETO', 'EL RITUAL'];
    services.forEach((s, i) => {
      const card = el('article','v-service');
      card.append(el('span','service-index',`${String(i+1).padStart(2,'0')} / ${labels[i] || 'DE LA CASA'}`));
      const info = el('div','service-info');
      info.append(el('h3','',s.name),el('p','',descriptions[s.name] || s.description || 'Servicio de barbería con asesoría de estilo y atención al detalle.'));
      const meta = el('div','service-meta');
      meta.append(el('span','service-price',new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(s.price)),el('span','service-duration',`${s.duration_minutes} minutos`));
      const link = el('a','service-book','Reservar servicio'); link.href = '/reservar'; link.setAttribute('aria-label',`Reservar ${s.name}`); const arrow=el('span','','↗'); arrow.setAttribute('aria-hidden','true'); link.append(arrow);
      card.append(info,meta,link); list.append(card);
    });
  }

  function renderBarbers(barbers) {
    const list = document.getElementById('barbers-list'); list.replaceChildren();
    if (!barbers.length) { list.append(el('p','loading-copy','Consulta el equipo disponible al reservar tu hora.')); return; }
    barbers.forEach(b => {
      const card = el('article','v-barber'); const monogram = el('div','barber-monogram', b.name.split(' ').map(n => n[0]).slice(0,2).join(''));
      monogram.setAttribute('aria-hidden','true');
      const link = el('a','', 'RESERVAR CON ÉL'); link.href = '/reservar'; link.setAttribute('aria-label',`Reservar con ${b.name}`); link.append(el('span','','↗'));
      card.append(monogram,el('h3','',b.name),el('p','',b.specialty || 'Barbero de la casa'),link); list.append(card);
    });
  }
  async function load() {
    await Promise.allSettled([
      (async () => { try { const {services} = await apiRequest('/services',{auth:false}); renderServices(services); } catch { renderServices(fallbackServices); document.querySelector('.service-footnote').textContent = 'Carta de referencia. Confirma precio y disponibilidad al reservar.'; } })(),
      (async () => { try { const {barbers} = await apiRequest('/barbers',{auth:false}); renderBarbers(barbers); } catch { renderBarbers(fallbackBarbers); } })()
    ]);
  }
  load();
})();
