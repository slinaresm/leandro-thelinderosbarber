/* Seek the uploaded film to the position represented by the page scroll. */
(() => {
  const story = document.querySelector('.cinema-story');
  const video = document.getElementById('barber-film');
  if (!story || !video) return;
  const panels = [...story.querySelectorAll('.cinema-panel')];
  const motionButton = document.getElementById('cinema-motion');
  const count = document.getElementById('cinema-count');
  const caption = document.getElementById('cinema-caption');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disabled = preference.matches;
  let frame = 0;
  let active = -1;
  let desiredTime = 0;
  let loaded = false;
  let failed = false;
  let loading = false;
  let start = 0;
  let distance = 1;
  const cuts = [0, .18, .36, .56, .78];
  const labels = ['EL RITUAL LINDEROS', 'EL OFICIO', 'TU MOMENTO', 'EL DETALLE', 'TU SELLO'];
  video.muted = true;
  video.defaultMuted = true;
  function selectPanel(index) {
    if (index === active) return;
    active = index;
    panels.forEach((panel, i) => {
      const selected = i === index;
      panel.classList.toggle('is-active', selected);
      panel.inert = !disabled && !selected;
      if (!disabled && !selected) panel.setAttribute('aria-hidden', 'true');
      else panel.removeAttribute('aria-hidden');
    });
    count.textContent = `${String(index + 1).padStart(2,'0')} / 05`;
    caption.textContent = labels[index];
  }
  function seek() {
    if (disabled || !loaded || video.seeking || video.readyState < 2) return;
    // Retry media readiness events rather than losing an early scroll target.
    if (!video.seekable.length || desiredTime > video.seekable.end(video.seekable.length - 1)) return;
    if (Math.abs(video.currentTime - desiredTime) >= 1 / 30) {
      try { video.currentTime = desiredTime; } catch { /* retry on the next media event */ }
    }
  }
  function render() {
    frame = 0;
    if (disabled || !loaded) return;
    const progress = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
    desiredTime = progress * Math.max(0, video.duration - .08);
    story.style.setProperty('--film-progress', progress.toFixed(4));
    let index = 0;
    for (let i = 1; i < cuts.length; i++) if (progress >= cuts[i]) index = i;
    selectPanel(index);
    seek();
  }
  function requestRender() { if (!frame) frame = requestAnimationFrame(render); }
  function measure() {
    start = story.getBoundingClientRect().top + window.scrollY;
    distance = Math.max(1, story.offsetHeight - story.querySelector('.cinema-stage').offsetHeight);
    requestRender();
  }
  function failVideo() {
    failed = true;
    disabled = true;
    motionButton.hidden = true;
    applyMode();
  }
  async function loadVideo() {
    if (video.hasAttribute('src') || loading || failed) return;
    loading = true;
    const small = window.matchMedia('(max-width: 760px)').matches;
    const source = small ? '/assets/videos/barber-scroll-mobile.mp4' : '/assets/videos/barber-scroll.mp4';
    try {
      // Buffer once before attaching the source. A local Blob supports seeking even
      // when the static host does not implement HTTP Range requests (e.g. http.server).
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Video HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Empty video');
      video.src = URL.createObjectURL(blob);
      video.preload = 'auto';
      video.load();
    } catch {
      failVideo();
    } finally {
      loading = false;
    }
  }
  function applyMode() {
    const enhanced = !disabled && loaded && !failed;
    story.classList.toggle('cinema-enhanced', enhanced);
    story.classList.toggle('cinema-loading', !disabled && !loaded && !failed);
    story.classList.toggle('cinema-static', !enhanced);
    story.classList.toggle('cinema-ready', enhanced);
    document.getElementById('cinema-discover').href = enhanced ? '#paso-1' : '#film-title-1';
    motionButton.textContent = disabled ? 'Ver con animación' : 'Ver sin animación';
    panels.forEach(panel => { panel.inert = false; panel.removeAttribute('aria-hidden'); });
    active = -1;
    if (!disabled) { loadVideo(); if (enhanced) { measure(); render(); } }
    else { video.pause(); selectPanel(0); }
  }
  video.addEventListener('loadeddata', () => {
    if (loaded || !Number.isFinite(video.duration) || video.duration <= 0) return;
    loaded = true;
    motionButton.hidden = false;
    applyMode();
  });
  video.addEventListener('seeked', seek);
  video.addEventListener('canplay', seek);
  video.addEventListener('canplaythrough', seek);
  video.addEventListener('progress', seek);
  video.addEventListener('suspend', seek);
  video.addEventListener('error', failVideo);
  motionButton.addEventListener('click', () => {
    const visible = active > 0 ? active : 0;
    const wasEnhanced = story.classList.contains('cinema-enhanced');
    disabled = !disabled;
    applyMode();
    if (disabled && wasEnhanced) panels[visible].scrollIntoView({behavior:'instant',block:'center'});
    else if (!disabled && loaded) window.scrollTo({top:start + cuts[visible] * distance,behavior:'instant'});
  });
  preference.addEventListener('change', event => { disabled = event.matches; applyMode(); });
  window.addEventListener('scroll', requestRender, {passive:true});
  window.addEventListener('resize', measure, {passive:true});
  window.addEventListener('pageshow', measure);
  document.fonts?.ready.then(measure);
  motionButton.hidden = false;
  applyMode();
})();




