/** Una suscripción por vista; detenerla al cambiar de usuario o desmontar. */
export function subscribeAgenda({ scope = 'availability', barberId, date, onInvalidate, onAuthRequired = () => {}, onError = () => {}, base = '/api' }) {
  if (typeof onInvalidate !== 'function') throw new TypeError('onInvalidate es obligatorio');
  let source, cursor, stopped = false, epoch = 0, fallbackTimer, retryTimer, reconnectTimer;
  let queue = Promise.resolve();
  const pending = new AbortController();
  function enqueue(action) {
    queue = queue.then(() => stopped ? undefined : action()).catch(error => { if (!stopped) onError(error); });
    return queue;
  }
  function url(stream = false) {
    const target = new URL(base + (stream ? '/events/stream' : '/events'), location.origin);
    if (target.origin !== location.origin) throw new TypeError('Eventos requieren el mismo origen');
    target.searchParams.set('scope', scope);
    if (scope === 'availability') { target.searchParams.set('barberId', barberId); target.searchParams.set('date', date); }
    if (cursor) target.searchParams.set('cursor', cursor);
    return target;
  }
  function stop() {
    stopped = true; epoch++; source?.close(); pending.abort();
    clearTimeout(fallbackTimer); clearTimeout(retryTimer); clearTimeout(reconnectTimer); clearInterval(watchdog);
  }
  function auth() { stop(); onAuthRequired(); }
  async function poll() {
    if (stopped) return;
    try {
      await queue;
      const response = await fetch(url(), { credentials: 'same-origin', cache: 'no-store', signal: pending.signal, headers: { Accept: 'application/json' } });
      if ([401, 403].includes(response.status)) { auth(); return; }
      if (!response.ok) throw new Error('Eventos no disponibles: ' + response.status);
      const batch = await response.json();
      await enqueue(async () => { await onInvalidate(); cursor = batch.cursor; });
      if (!stopped) fallbackTimer = setTimeout(poll, batch.more ? 0 : 2000);
    } catch (error) {
      if (!stopped) { onError(error); fallbackTimer = setTimeout(poll, 2000); }
    }
  }
  function fallback() {
    source?.close(); epoch++;
    clearTimeout(fallbackTimer); clearTimeout(retryTimer);
    fallbackTimer = setTimeout(poll, 0);
    retryTimer = setTimeout(connect, 30000);
  }
  function connect() {
    if (stopped) return;
    clearTimeout(fallbackTimer); clearTimeout(retryTimer); source?.close();
    const version = ++epoch;
    if (typeof EventSource === 'undefined') { fallback(); return; }
    let first = true;
    try { source = new EventSource(url(true), { withCredentials: true }); } catch { fallback(); return; }
    source.addEventListener('sync', event => {
      enqueue(async () => {
        if (version !== epoch) return;
        const batch = JSON.parse(event.data);
        if (first || batch.reset || batch.changes.length) await onInvalidate();
        if (version !== epoch) return;
        first = false; cursor = batch.cursor;
      });
    });
    source.addEventListener('auth.required', auth);
    source.addEventListener('sync.failed', fallback);
    source.addEventListener('stream.end', () => {
      source.close(); epoch++;
      reconnectTimer = setTimeout(connect, 2000);
    });
    source.onerror = fallback;
  }
  const watchdog = setInterval(() => enqueue(onInvalidate), 30000);
  enqueue(onInvalidate);
  connect();
  return { stop, refresh: () => enqueue(onInvalidate) };
}
