/* ============================================================
   BARBER LINDEROS — Cliente API compartido
   Modulo reutilizable para llamadas REST + manejo de sesion JWT.
   ============================================================ */

// Frontend and API are served from the same origin.
const API_BASE_URL = '/api';
function siteRootPrefix() { return '/'; }
function siteUrl(path) { return '/' + path.replace(/^\/+/, ''); }
localStorage.removeItem('bl_token');

const Auth = {
  getToken() { return null; },
  getUser() {
    const raw = localStorage.getItem('bl_user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  setSession(token, user) {
    // The session token is stored exclusively in the HttpOnly cookie.
    localStorage.setItem('bl_user', JSON.stringify(user));
  },
  async clearSession() {
    await fetch('/api/auth/logout', {method:'POST',credentials:'same-origin'});
    localStorage.removeItem('bl_token');
    localStorage.removeItem('bl_user');
  },
  isLoggedIn() { return !!this.getUser(); },
  requireRole(role, redirectTo = siteUrl('/ingresar')) {
    const user = this.getUser();
    if (!this.isLoggedIn() || !user || user.role !== role) {
      window.location.href = redirectTo;
      return null;
    }
    return user;
  },
  redirectForRole(user) {
    if (user.role === 'admin') { window.location.href = siteUrl('/administracion'); return; }
    if (user.role === 'barbero') { window.location.href = siteUrl('/barbero'); return; }
    // Si el cliente venia de intentar pagar un carrito (se le pidio crear cuenta o
    // iniciar sesion a mitad del checkout), lo devolvemos a la tienda para retomar
    // el pago en vez de mandarlo siempre al wizard de reserva de horas.
    if (localStorage.getItem('bl_resume_checkout')) {
      localStorage.removeItem('bl_resume_checkout');
      window.location.href = siteUrl('/tienda?checkout=1');
      return;
    }
    window.location.href = siteUrl('/reservar');
  },
};

async function apiRequest(path, { method = 'GET', body, auth = true, isFormData = false } = {}) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (auth && Auth.getToken()) {
    headers['Authorization'] = `Bearer ${Auth.getToken()}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    throw new Error('No se pudo conectar con el servidor. ¿Esta corriendo el backend?');
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    if (auth && res.status === 401) localStorage.removeItem('bl_user');
    throw new Error((data && data.error) || `Error ${res.status}`);
  }
  return data;
}

/* ---------- Toast global ---------- */
function showToast(message, type = 'default') {
  let el = document.getElementById('bl-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bl-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

/* ---------- Scroll suave (Lenis) ----------
   Solo corre en paginas que cargan la libreria (ver <script> de Lenis en el <head>).
   Sincronizado con el ticker de GSAP para que ScrollTrigger lea la posicion correcta. */
function initSmoothScroll() {
  if (typeof Lenis === 'undefined') return;
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
  if (typeof gsap !== 'undefined') {
    if (typeof ScrollTrigger !== 'undefined') lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    requestAnimationFrame(function raf(time) { lenis.raf(time); requestAnimationFrame(raf); });
  }
}

/* ---------- Scroll reveal ----------
   Con GSAP+ScrollTrigger disponibles, anima entrada/salida con stagger; si no,
   cae de vuelta al fade simple por IntersectionObserver (paneles internos/dashboards). */
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    gsap.set(items, { autoAlpha: 0, y: 40, transition: 'none' });
    ScrollTrigger.batch(items, {
      start: 'top 85%',
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.12, overwrite: true }),
      onLeaveBack: (batch) => gsap.to(batch, { autoAlpha: 0, y: 40, duration: 0.5, ease: 'power2.in', overwrite: true }),
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  items.forEach((item) => observer.observe(item));
}

/* ---------- Menu mobile (hamburguesa) ----------
   Se activa solo en paginas que tengan <nav class="nav"> con un <div class="nav-links">
   adentro (/, /tienda, /producto). El CSS del drawer (transform,
   ancho, etc.) vive en el <style> de cada pagina dentro de su @media (max-width: 900px);
   este script solo inyecta el boton y el overlay, y alterna la clase "open". */
function initMobileNav() {
  if (document.body.hasAttribute('data-no-mobile-nav')) return;
  const nav = document.querySelector('nav.nav');
  const links = nav ? nav.querySelector('.nav-links') : null;
  if (!nav || !links || nav.querySelector('.nav-toggle')) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-label', 'Abrir menú');
  toggle.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <line x1="3" y1="12" x2="21" y2="12"></line>
      <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>
  `;
  nav.appendChild(toggle);

  const overlay = document.createElement('div');
  overlay.className = 'nav-overlay';
  document.body.appendChild(overlay);

  function closeMenu() {
    links.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  function openMenu() {
    links.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  toggle.addEventListener('click', () => {
    links.classList.contains('open') ? closeMenu() : openMenu();
  });
  overlay.addEventListener('click', closeMenu);
  links.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMenu(); });
}

/* ---------- WhatsApp: boton flotante de contacto (click-to-chat) ---------- */
let _publicConfigCache = null;
async function getPublicConfig() {
  if (_publicConfigCache) return _publicConfigCache;
  try {
    _publicConfigCache = await apiRequest('/config', { auth: false });
  } catch (e) {
    _publicConfigCache = { whatsappBusinessNumber: '56900000000' };
  }
  return _publicConfigCache;
}

function buildWhatsAppLink(number, message) {
  const clean = String(number).replace(/[^\d]/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

async function injectWhatsAppButton(message = 'Hola! Quiero reservar una hora en Barber Linderos.') {
  const config = await getPublicConfig();
  const link = buildWhatsAppLink(config.whatsappBusinessNumber, message);

  const btn = document.createElement('a');
  btn.href = link;
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';
  btn.setAttribute('aria-label', 'Contactar por WhatsApp');
  btn.id = 'bl-whatsapp-btn';
  btn.innerHTML = `
    <svg viewBox="0 0 32 32" width="28" height="28" fill="currentColor" aria-hidden="true">
      <path d="M16.001 3C9.373 3 4 8.373 4 15c0 2.386.7 4.61 1.91 6.48L4 29l7.72-1.87A11.94 11.94 0 0 0 16 27c6.627 0 12-5.373 12-12S22.628 3 16.001 3zm0 21.8c-1.83 0-3.55-.5-5.02-1.37l-.36-.21-4.58 1.11 1.14-4.47-.24-.38A9.77 9.77 0 0 1 5.2 15c0-5.96 4.85-10.8 10.8-10.8 5.96 0 10.8 4.84 10.8 10.8 0 5.96-4.84 10.8-10.8 10.8zm5.94-8.1c-.32-.16-1.9-.94-2.2-1.04-.29-.11-.51-.16-.72.16-.21.32-.83 1.04-1.02 1.25-.19.21-.37.24-.69.08-.32-.16-1.36-.5-2.6-1.6-.96-.86-1.61-1.92-1.8-2.24-.19-.32-.02-.5.14-.66.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.53-.54-.72-.55h-.62c-.21 0-.56.08-.85.4-.29.32-1.11 1.08-1.11 2.64 0 1.56 1.14 3.06 1.3 3.27.16.21 2.24 3.42 5.43 4.8.76.33 1.35.53 1.81.67.76.24 1.45.21 2 .13.61-.09 1.9-.78 2.17-1.53.27-.75.27-1.4.19-1.53-.08-.13-.29-.21-.61-.37z"/>
    </svg>
  `;
  Object.assign(btn.style, {
    position: 'fixed', bottom: '24px', right: '24px', width: '58px', height: '58px',
    borderRadius: '50%', background: '#25D366', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: '998', transition: 'transform 0.3s ease',
  });
  btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.08)');
  btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
  document.body.appendChild(btn);
}

document.addEventListener('DOMContentLoaded', () => {
  initSmoothScroll();
  initScrollReveal();
  initMobileNav();
  if (!document.body.hasAttribute('data-no-whatsapp')) {
    injectWhatsAppButton();
  }
});
