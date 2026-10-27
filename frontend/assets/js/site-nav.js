/* Shared mobile navigation used by the public pages. */
(() => {
  const menu = document.getElementById('main-nav');
  const toggle = document.querySelector('.menu-toggle');
  if (!menu || !toggle) return;
  const closeMenu = () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
  };
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); toggle.focus(); }
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 760) closeMenu(); });
})();
