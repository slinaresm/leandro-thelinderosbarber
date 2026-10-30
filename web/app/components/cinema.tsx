import { useEffect, useRef } from 'react';
import { CinemaMarkup } from './cinema-markup';

export function Cinema() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const story = ref.current!.querySelector<HTMLElement>('.cinema-story')!;
    const video = story.querySelector('video')!;
    const panels = [...story.querySelectorAll<HTMLElement>('.cinema-panel')];
    const button = story.querySelector<HTMLButtonElement>('#cinema-motion')!;
    const discover = story.querySelector<HTMLAnchorElement>('#cinema-discover')!;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const events = new AbortController();
    let disabled = preference.matches, loaded = false, failed = false, disposed = false;
    let frame = 0, active = 0, blobUrl = '', loading = false;
    const cuts = [0, .18, .36, .56, .78];
    const labels = ['EL RITUAL LINDEROS', 'EL OFICIO', 'TU MOMENTO', 'EL DETALLE', 'TU SELLO'];
    function render() {
      frame = 0;
      if (disabled || !loaded || disposed) return;
      const start = story.getBoundingClientRect().top + scrollY;
      const distance = Math.max(1, story.offsetHeight - story.querySelector<HTMLElement>('.cinema-stage')!.offsetHeight);
      const progress = Math.min(1, Math.max(0, (scrollY - start) / distance));
      story.style.setProperty('--film-progress', String(progress));
      active = cuts.reduce((last, cut, index) => progress >= cut ? index : last, 0);
      panels.forEach((panel, index) => {
        panel.classList.toggle('is-active', index === active);
        panel.inert = index !== active;
        if (index !== active) panel.setAttribute('aria-hidden', 'true'); else panel.removeAttribute('aria-hidden');
      });
      story.querySelector('#cinema-count')!.textContent = String(active + 1).padStart(2, '0') + ' / 05';
      story.querySelector('#cinema-caption')!.textContent = labels[active];
      const time = progress * Math.max(0, video.duration - .08);
      if (!video.seeking && video.readyState >= 2 && video.seekable.length && time <= video.seekable.end(video.seekable.length - 1) && Math.abs(video.currentTime - time) > 1 / 30) video.currentTime = time;
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(render); }
    async function load() {
      if (loading || blobUrl || failed) return;
      loading = true;
      try {
        const response = await fetch(matchMedia('(max-width:760px)').matches ? '/assets/videos/barber-scroll-mobile.mp4' : '/assets/videos/barber-scroll.mp4', { signal: events.signal });
        if (!response.ok) throw new Error('Video no disponible');
        const blob = await response.blob();
        if (!blob.size) throw new Error('Video vacío');
        if (disposed) return;
        blobUrl = URL.createObjectURL(blob); video.src = blobUrl; video.load();
      } catch { if (!disposed) { failed = true; disabled = true; mode(); } }
      finally { loading = false; }
    }
    function mode() {
      const enhanced = !disabled && loaded && !failed;
      story.classList.toggle('cinema-enhanced', enhanced);
      story.classList.toggle('cinema-ready', enhanced);
      story.classList.toggle('cinema-static', !enhanced);
      button.hidden = failed;
      button.textContent = disabled ? 'Ver con animación' : 'Ver sin animación';
      discover.href = enhanced ? '#paso-1' : '#film-title-1';
      panels.forEach(panel => { panel.inert = false; panel.removeAttribute('aria-hidden'); });
      if (disabled) video.pause(); else { void load(); schedule(); }
    }
    const opts = { signal: events.signal };
    button.addEventListener('click', () => {
      const visible = active; disabled = !disabled; mode();
      if (disabled) panels[visible].scrollIntoView({ block: 'center' });
    }, opts);
    preference.addEventListener('change', event => { disabled = event.matches; mode(); }, opts);
    video.addEventListener('loadeddata', () => { if (Number.isFinite(video.duration) && video.duration > 0) { loaded = true; mode(); } }, opts);
    video.addEventListener('error', () => { failed = true; disabled = true; mode(); }, opts);
    for (const event of ['seeked', 'canplay', 'progress']) video.addEventListener(event, schedule, opts);
    window.addEventListener('scroll', schedule, { ...opts, passive: true });
    window.addEventListener('resize', schedule, opts);
    mode();
    return () => {
      disposed = true; events.abort(); cancelAnimationFrame(frame);
      video.pause(); video.removeAttribute('src'); video.load();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []);
  return <div ref={ref}><CinemaMarkup /></div>;
}
