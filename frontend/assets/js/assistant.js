/* ============================================================
   BARBER LINDEROS — Asistente de clientes (FAQ con IA)
   Widget de chat flotante que consulta POST /api/assistant/chat.
   Para excluirlo de una pagina, agregar data-no-assistant al <body>.
   ============================================================ */

(function () {
  function init() {
    if (document.body.hasAttribute('data-no-assistant')) return;
    if (document.getElementById('bl-assistant-fab')) return;

    const messages = [];

    const style = document.createElement('style');
    style.textContent = `
      .bl-assistant-head { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--border); flex-shrink:0; }
      .bl-assistant-title { font-family: var(--font-display); font-weight:700; font-size:0.95rem; }
      .bl-assistant-sub { color: var(--text-muted); font-size:0.78rem; margin-top:2px; }
      .bl-assistant-close { background:none; border:none; color:var(--text-muted); font-size:1.4rem; line-height:1; cursor:pointer; padding:4px; }
      .bl-assistant-close:hover { color:var(--text); }
      .bl-assistant-body { flex:1; overflow-y:auto; padding:16px 18px; display:flex; flex-direction:column; gap:10px; }
      .bl-msg { padding:10px 13px; border-radius:12px; font-size:0.88rem; line-height:1.45; max-width:85%; white-space:pre-wrap; }
      .bl-msg-assistant { background: var(--bg-card); border:1px solid var(--border); align-self:flex-start; }
      .bl-msg-user { background: var(--gold); color:#fff; align-self:flex-end; }
      .bl-msg-error { background: rgba(224,90,90,0.12); border:1px solid rgba(224,90,90,0.3); color:#f09090; align-self:flex-start; }
      .bl-assistant-form { display:flex; gap:8px; padding:14px; border-top:1px solid var(--border); flex-shrink:0; }
      .bl-assistant-form input { flex:1; min-width:0; background: var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:999px; padding:10px 16px; font-size:0.88rem; font-family:inherit; }
      .bl-assistant-form input:focus { outline:none; border-color: var(--gold); }
      .bl-assistant-form button { width:38px; height:38px; border-radius:50%; border:none; background:var(--gold); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
      .bl-typing { color: var(--text-muted); font-size:0.82rem; font-style:italic; }
      @media (max-width: 480px) {
        #bl-assistant-panel { right:16px !important; left:16px !important; width:auto !important; bottom:150px !important; }
        #bl-assistant-fab { right:16px !important; }
      }
    `;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.id = 'bl-assistant-fab';
    fab.setAttribute('aria-label', 'Preguntale al asistente');
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
      </svg>
    `;
    Object.assign(fab.style, {
      position: 'fixed', bottom: '96px', right: '24px', width: '58px', height: '58px',
      borderRadius: '50%', background: '#75c5de', color: '#0b0b0b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: '997', border: 'none', cursor: 'pointer',
      transition: 'transform 0.3s ease',
    });
    fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.08)'; });
    fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)'; });
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'bl-assistant-panel';
    panel.innerHTML = `
      <div class="bl-assistant-head">
        <div>
          <div class="bl-assistant-title">Asistente Barber Linderos</div>
          <div class="bl-assistant-sub">Pregúntame lo que quieras</div>
        </div>
        <button type="button" class="bl-assistant-close" aria-label="Cerrar">&times;</button>
      </div>
      <div class="bl-assistant-body" id="bl-assistant-body">
        <div class="bl-msg bl-msg-assistant">¡Hola! Soy el asistente de Barber Linderos. Puedo responder sobre servicios, precios, horarios, la tienda y la fidelización. ¿En qué te ayudo?</div>
      </div>
      <form class="bl-assistant-form" id="bl-assistant-form">
        <input type="text" id="bl-assistant-input" placeholder="Escribe tu pregunta..." autocomplete="off">
        <button type="submit" aria-label="Enviar">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 16L16 9L2 2L2 7.5L11 9L2 10.5L2 16Z" fill="currentColor"/>
          </svg>
        </button>
      </form>
    `;
    Object.assign(panel.style, {
      position: 'fixed', bottom: '164px', right: '24px', width: '360px', maxWidth: 'calc(100vw - 32px)',
      height: '480px', maxHeight: 'calc(100vh - 200px)', background: 'var(--bg-elevated)',
      border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      display: 'none', flexDirection: 'column', overflow: 'hidden', zIndex: '997',
    });
    document.body.appendChild(panel);

    let open = false;
    function togglePanel(force) {
      open = force !== undefined ? force : !open;
      panel.style.display = open ? 'flex' : 'none';
      if (open) document.getElementById('bl-assistant-input').focus();
    }
    fab.addEventListener('click', () => togglePanel());
    panel.querySelector('.bl-assistant-close').addEventListener('click', () => togglePanel(false));

    const body = document.getElementById('bl-assistant-body');
    function appendMessage(role, text) {
      const div = document.createElement('div');
      div.className = `bl-msg bl-msg-${role}`;
      div.textContent = text;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      return div;
    }

    document.getElementById('bl-assistant-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('bl-assistant-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      appendMessage('user', text);
      messages.push({ role: 'user', content: text });

      const typing = document.createElement('div');
      typing.className = 'bl-typing';
      typing.textContent = 'Escribiendo...';
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;

      try {
        const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
        });
        const data = await res.json().catch(() => ({}));
        typing.remove();
        if (!res.ok) {
          appendMessage('error', data.error || 'No se pudo responder. Intenta de nuevo.');
          messages.pop();
          return;
        }
        appendMessage('assistant', data.reply);
        messages.push({ role: 'assistant', content: data.reply });
      } catch (err) {
        typing.remove();
        appendMessage('error', 'No se pudo conectar con el servidor.');
        messages.pop();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
