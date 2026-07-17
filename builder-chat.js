'use strict';
// Website Builder chat sidebar: confirmation card → streaming build feed →
// gates/permissions → stop/continue → usage. Exposes window.BuilderChat.
(function () {
  const ACTIVE_KEY = 'dart_builder_active_build_v1';
  // Statuses worth re-attaching to after a page reload (interrupted is
  // resumable, so it counts here even though the bridge no longer treats it
  // as blocking-active).
  const REATTACHABLE_STATUSES = ['starting', 'running', 'waiting_input', 'waiting_permission', 'interrupted'];
  const STREAM_RENDER_MS = 120; // markdown re-parses the whole buffer — don't do it every frame

  const S = {
    phase: 'idle', // idle | confirming | starting | running | waiting_user | waiting_perm | stopped | done | error
    buildId: null,
    model: 'opus',
    startedAt: null,
    stream: null,
    pinned: true,
    // FIFO of in-flight assistant messages: message_start pushes, deltas write
    // to the LAST entry, message_end finalizes the FIRST (an assistant turn
    // can carry several text blocks; ends arrive in the same order as starts).
    streamQueue: [],
    renderTimer: null,
    elapsedTimer: null,
    usage: null,
    settings: null,
    suppressCelebration: false, // true when replaying an already-finished build
    toolRows: new Map(),
    permCards: new Map(),
    reconnectNote: null, // single reused element — never spam one per retry
    reconnectTries: 0,
  };

  const $ = (id) => document.getElementById(id);
  const els = {};
  function grabEls() {
    ['chat-panel', 'chat-feed', 'chat-business-name', 'chat-state-pill', 'chat-model-pill',
      'chat-elapsed', 'chat-cost', 'chat-spinner', 'chat-builds-btn', 'chat-settings-btn',
      'chat-close-btn', 'chat-builds-menu', 'chat-jump-btn', 'chat-quick-replies',
      'chat-stop-btn', 'chat-resume-btn', 'chat-finish-btn', 'chat-input', 'chat-send-btn',
    ].forEach((id) => { els[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = $(id); });
  }

  // ---------- Markdown mini-renderer (escape-first, streaming-safe) ----------
  const esc = (v) => BuilderAPI.esc(v);

  function inlineMd(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function renderMarkdown(raw) {
    const segments = esc(raw).split(/```(?:\w*)\n?/);
    let html = '';
    for (let i = 0; i < segments.length; i++) {
      if (i % 2 === 1) { html += `<pre><code>${segments[i]}</code></pre>`; continue; }
      const lines = segments[i].split('\n');
      let para = [];
      let list = null;
      const flushPara = () => {
        if (para.length) { html += `<p>${inlineMd(para.join('<br>'))}</p>`; para = []; }
      };
      const flushList = () => {
        if (list) { html += `<ul>${list.map((li) => `<li>${inlineMd(li)}</li>`).join('')}</ul>`; list = null; }
      };
      for (const line of lines) {
        const t = line.trimEnd();
        if (/^#{1,4}\s+/.test(t)) {
          flushPara(); flushList();
          html += `<strong class="md-h">${inlineMd(t.replace(/^#{1,4}\s+/, ''))}</strong>`;
        } else if (/^\s*[-*]\s+/.test(t)) {
          flushPara();
          (list ||= []).push(t.replace(/^\s*[-*]\s+/, ''));
        } else if (!t.trim()) {
          flushPara(); flushList();
        } else {
          flushList();
          para.push(t);
        }
      }
      flushPara(); flushList();
    }
    return html;
  }

  // ---------- Feed helpers ----------------------------------------------------
  function feedAppend(el) {
    els.chatFeed.appendChild(el);
    if (S.pinned) els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
    else els.chatJumpBtn.hidden = false;
  }

  function addSystemNote(text) {
    const p = document.createElement('p');
    p.className = 'msg system';
    p.textContent = text;
    feedAppend(p);
  }

  function addUserBubble(text) {
    const div = document.createElement('div');
    div.className = 'msg user';
    div.textContent = text;
    feedAppend(div);
  }

  function addErrorBlock(text) {
    const div = document.createElement('div');
    div.className = 'msg error-block';
    div.textContent = text;
    feedAppend(div);
  }

  function beginAssistantMessage() {
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.innerHTML = '<div class="msg-body"></div><span class="stream-caret"></span>';
    S.streamQueue.push({ el: div, buf: '' });
    feedAppend(div);
  }

  function renderStreamTail() {
    S.renderTimer = null;
    const entry = S.streamQueue[S.streamQueue.length - 1];
    if (!entry) return;
    entry.el.querySelector('.msg-body').innerHTML = renderMarkdown(entry.buf);
    if (S.pinned) els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
  }

  function appendDelta(text) {
    if (!S.streamQueue.length) beginAssistantMessage();
    S.streamQueue[S.streamQueue.length - 1].buf += text;
    // Throttled: renderMarkdown re-parses the whole buffer, so cap re-renders
    // instead of running one per delta/frame (long messages get O(n²) fast).
    if (!S.renderTimer) S.renderTimer = setTimeout(renderStreamTail, STREAM_RENDER_MS);
  }

  // Finalize the OLDEST in-flight message (ends arrive in start order).
  function finalizeStream(finalText) {
    const entry = S.streamQueue.shift();
    if (entry) {
      entry.el.querySelector('.msg-body').innerHTML = renderMarkdown(finalText ?? entry.buf);
      entry.el.querySelector('.stream-caret')?.remove();
    } else if (finalText) {
      const div = document.createElement('div');
      div.className = 'msg assistant';
      div.innerHTML = `<div class="msg-body">${renderMarkdown(finalText)}</div>`;
      feedAppend(div);
    }
    if (S.pinned) els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
  }

  // Close any dangling in-flight messages (stream interrupted before its
  // message_end — e.g. Detener mid-sentence, or replay of a cut-off log).
  function flushStreams() {
    while (S.streamQueue.length) finalizeStream();
  }

  // ---------- Phase / header state --------------------------------------------
  const PHASE_LABEL = {
    idle: ['Listo', ''],
    confirming: ['Confirmando', ''],
    starting: ['Iniciando…', 'state-running'],
    running: ['Generando', 'state-running'],
    waiting_user: ['Esperando tu respuesta', 'state-waiting'],
    waiting_perm: ['Esperando aprobación', 'state-waiting'],
    stopped: ['Detenido', 'state-stopped'],
    done: ['Completado', 'state-done'],
    error: ['Error', 'state-stopped'],
  };

  function setPhase(phase) {
    S.phase = phase;
    if (!['running', 'starting'].includes(phase)) flushStreams();
    const [label, cls] = PHASE_LABEL[phase] || [phase, ''];
    els.chatStatePill.textContent = label;
    els.chatStatePill.className = `chat-pill ${cls}`;

    const busy = phase === 'running' || phase === 'starting';
    els.chatSpinner.hidden = !busy;
    const composerOn = ['running', 'waiting_user', 'waiting_perm', 'stopped'].includes(phase);
    els.chatInput.disabled = !composerOn;
    els.chatSendBtn.disabled = !composerOn;
    els.chatStopBtn.hidden = !(phase === 'running' || phase === 'starting');
    els.chatResumeBtn.hidden = phase !== 'stopped';
    els.chatFinishBtn.hidden = phase !== 'waiting_user';
    if (phase !== 'waiting_user') hideQuickReplies();

    if (busy && !S.elapsedTimer) startElapsed();
    if (['stopped', 'done', 'error', 'idle'].includes(phase)) stopElapsed();
  }

  function startElapsed() {
    els.chatElapsed.hidden = false;
    S.elapsedTimer = setInterval(() => {
      if (!S.startedAt) return;
      const secs = Math.floor((Date.now() - S.startedAt) / 1000);
      const mm = String(Math.floor(secs / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      els.chatElapsed.textContent = `${mm}:${ss}`;
    }, 1000);
  }

  function stopElapsed() {
    clearInterval(S.elapsedTimer);
    S.elapsedTimer = null;
  }

  function showQuickReplies(options) {
    els.chatQuickReplies.innerHTML = '';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt;
      btn.onclick = () => sendUserText(opt.toLowerCase());
      els.chatQuickReplies.appendChild(btn);
    }
    els.chatQuickReplies.hidden = false;
  }

  function hideQuickReplies() {
    els.chatQuickReplies.hidden = true;
  }

  // ---------- Panel open/close + map push -------------------------------------
  function openPanel() {
    if (els.chatPanel.hidden) {
      els.chatPanel.hidden = false;
      void els.chatPanel.offsetWidth; // ensure the slide-in transition runs
    }
    if (!document.body.classList.contains('chat-open')) {
      preserveMapCenter(() => document.body.classList.add('chat-open'));
    }
  }

  function closePanel() {
    preserveMapCenter(() => document.body.classList.remove('chat-open'));
  }

  function preserveMapCenter(mutate) {
    const gmap = (typeof map !== 'undefined' && map) ? map : null;
    const center = gmap ? gmap.getCenter() : null;
    const mapDiv = $('map');
    if (gmap && center && mapDiv) {
      const onEnd = (e) => {
        if (e.propertyName !== 'width') return;
        mapDiv.removeEventListener('transitionend', onEnd);
        try {
          google.maps.event.trigger(gmap, 'resize');
          gmap.setCenter(center);
        } catch { /* map not ready */ }
      };
      mapDiv.addEventListener('transitionend', onEnd);
    }
    mutate();
  }

  // ---------- Confirmation card ------------------------------------------------
  function renderConfirmCard(place) {
    const payload = buildBuilderPayload(place);
    const card = document.createElement('div');
    card.className = 'confirm-card';
    card.innerHTML = `
      <p class="confirm-kicker">Confirma el sitio web</p>
      <h3 class="confirm-name">${esc(payload.name)}</h3>
      <div class="confirm-grid">
        <div><span>Categoría</span><strong>${esc(payload.category || '—')}</strong></div>
        <div><span>Teléfono</span><strong>${esc(payload.phone || 'Sin teléfono')}</strong></div>
        <div><span>Rating</span><strong>${payload.rating ? `${esc(payload.rating)} (${esc(payload.reviewCount)} reseñas)` : 'Sin rating'}</strong></div>
        <div><span>Fotos en Maps</span><strong>${esc(payload.mapsPhotoCount)}</strong></div>
      </div>
      <p class="confirm-address">${esc(payload.address || 'Sin dirección')}</p>
      <label class="confirm-model-row"><span>Modelo</span><select id="confirm-model-select"></select></label>
      <div class="confirm-actions">
        <button id="confirm-generate-btn" class="action-link build-link" type="button">Generar sitio web</button>
        <button id="confirm-copy-btn" class="confirm-copy-link" type="button">Copiar payload (manual)</button>
      </div>
      <p id="confirm-offline-hint" class="confirm-hint" hidden>
        Bridge no detectado. Inicia el servidor (<code>start-dart.cmd</code>) o copia el payload manualmente.
        <a href="#" id="confirm-retry-link">Reintentar conexión</a>
      </p>`;
    feedAppend(card);

    const select = card.querySelector('#confirm-model-select');
    populateModelSelect(select);
    const generateBtn = card.querySelector('#confirm-generate-btn');
    generateBtn.onclick = () => startBuild(payload, select.value);
    card.querySelector('#confirm-copy-btn').onclick = (e) => copyBuilderPayload(place, e.currentTarget);
    card.querySelector('#confirm-retry-link').onclick = (e) => { e.preventDefault(); checkBridge(card); };

    checkBridge(card);
  }

  function populateModelSelect(select) {
    // Model list comes from the bridge only — Generate is disabled until the
    // bridge responds, so an empty select is never actionable.
    const models = S.settings?.availableModels || [];
    select.innerHTML = models
      .map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('');
    if (models.length) select.value = S.settings?.model || models[0].id;
  }

  const modelLabel = (id) => (id || '').charAt(0).toUpperCase() + (id || '').slice(1);

  async function checkBridge(card) {
    const hint = card.querySelector('#confirm-offline-hint');
    const generateBtn = card.querySelector('#confirm-generate-btn');
    generateBtn.disabled = true;
    generateBtn.textContent = 'Verificando bridge…';
    const settings = await BuilderAPI.ping();
    if (settings) {
      S.settings = settings;
      populateModelSelect(card.querySelector('#confirm-model-select'));
      hint.hidden = true;
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generar sitio web';
    } else {
      hint.hidden = false;
      generateBtn.disabled = true;
      generateBtn.textContent = 'Bridge no disponible';
    }
  }

  // ---------- Usage / permission cards -----------------------------------------
  function fmtTokens(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return Math.round(n / 1_000) + 'K';
    return String(n ?? 0);
  }

  function renderUsageCard(usage, reason) {
    const card = document.createElement('div');
    card.className = 'usage-card';
    const u = usage || S.usage || {};
    const elapsed = els.chatElapsed.textContent || '—';
    card.innerHTML = `
      <p class="usage-kicker">${reason === 'completed' ? 'Build finalizado' : 'Resumen del build'}</p>
      <div class="usage-grid">
        <div><span>Costo (API equiv.)</span><strong>$${(u.totalCostUsd ?? 0).toFixed(2)}</strong></div>
        <div><span>Duración</span><strong>${esc(elapsed)}</strong></div>
        <div><span>Tokens entrada</span><strong>${fmtTokens((u.inputTokens ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0))}</strong></div>
        <div><span>Tokens salida</span><strong>${fmtTokens(u.outputTokens)}</strong></div>
      </div>`;
    feedAppend(card);
  }

  function renderPermissionCard(data) {
    const card = document.createElement('div');
    card.className = 'perm-card';
    const inputPreview = data.input?.command || data.input?.file_path || JSON.stringify(data.input || {});
    card.innerHTML = `
      <p class="perm-kicker">Aprobación requerida</p>
      <strong>${esc(data.tool)}</strong>
      <div class="perm-tool">${esc(String(inputPreview).slice(0, 600))}</div>
      <div class="perm-actions">
        <button class="perm-allow" type="button">Permitir</button>
        <button class="perm-deny" type="button">Denegar</button>
      </div>
      <p class="perm-resolution" hidden></p>`;
    card.querySelector('.perm-allow').onclick = () => resolvePermission(data.requestId, 'allow');
    card.querySelector('.perm-deny').onclick = () => resolvePermission(data.requestId, 'deny');
    S.permCards.set(data.requestId, card);
    feedAppend(card);
  }

  async function resolvePermission(requestId, behavior) {
    try {
      await BuilderAPI.respondPermission(S.buildId, requestId, behavior);
    } catch (err) {
      addErrorBlock(`No se pudo responder el permiso: ${err.message}`);
    }
  }

  function markPermissionResolved(data) {
    const card = S.permCards.get(data.requestId);
    if (!card) return;
    card.classList.add('resolved');
    // CSS hides the buttons, but disable them too — a replayed card must never
    // re-submit an already-decided request.
    card.querySelectorAll('.perm-allow, .perm-deny').forEach((b) => { b.disabled = true; });
    const note = card.querySelector('.perm-resolution');
    note.hidden = false;
    note.textContent = data.behavior === 'allow' ? '✓ Permitido' : '✕ Denegado';
  }

  // ---------- Tool rows ---------------------------------------------------------
  function toolStart(data) {
    const row = document.createElement('details');
    row.className = 'tool-row running';
    row.innerHTML = `
      <summary><span class="tool-dot"></span><span>${esc(data.name)}${data.detail ? ': ' + esc(data.detail) : ''}</span></summary>
      <pre class="tool-out" hidden></pre>`;
    S.toolRows.set(data.id, row);
    feedAppend(row);
  }

  function toolOutput(data) {
    const row = S.toolRows.get(data.id);
    if (!row) return;
    const pre = row.querySelector('.tool-out');
    pre.hidden = false;
    pre.textContent = (pre.textContent + data.chunk).slice(-20_000);
  }

  function toolEnd(data) {
    const row = S.toolRows.get(data.id);
    if (!row) return;
    row.classList.remove('running');
    row.classList.add(data.ok ? 'ok' : 'fail');
  }

  // ---------- Reconnect indicator ----------------------------------------------
  // EventSource auto-retries a dropped/absent server every few seconds and fires
  // `error` each time. Show ONE reusable note (escalating if the server is truly
  // gone), never one note per retry.
  function showReconnecting() {
    S.reconnectTries += 1;
    if (!S.reconnectNote) {
      const p = document.createElement('p');
      p.className = 'msg system reconnecting';
      S.reconnectNote = p;
      feedAppend(p);
    }
    // ~3 retries ≈ ~10s down: no longer a blip — tell them the server stopped.
    S.reconnectNote.textContent = S.reconnectTries >= 3
      ? 'Se perdió la conexión con el servidor. Reinícialo (Dart Game.lnk); el build continúa solo al reconectar.'
      : 'Reconectando…';
  }

  function clearReconnecting(reconnected) {
    S.reconnectTries = 0;
    if (!S.reconnectNote) return;
    if (reconnected) {
      S.reconnectNote.textContent = 'Reconectado.';
      S.reconnectNote.classList.remove('reconnecting');
    } else {
      S.reconnectNote.remove();
    }
    S.reconnectNote = null; // a later drop starts a fresh single note
  }

  // ---------- SSE wiring ----------------------------------------------------------
  const STATUS_TO_PHASE = {
    starting: 'starting',
    running: 'running',
    waiting_input: 'waiting_user',
    waiting_permission: 'waiting_perm',
    interrupted: 'stopped',
    failed: 'error',
    completed: 'done',
  };

  function attach(buildId, since) {
    detach();
    S.buildId = buildId;
    S.stream = BuilderAPI.openEvents(buildId, since, {
      status: (d) => { if (STATUS_TO_PHASE[d.status]) setPhase(STATUS_TO_PHASE[d.status]); },
      message_start: () => beginAssistantMessage(),
      message_delta: (d) => appendDelta(d.text),
      message_end: (d) => finalizeStream(d.text),
      tool_start: (d) => toolStart(d),
      tool_output: (d) => toolOutput(d),
      tool_end: (d) => toolEnd(d),
      permission_request: (d) => renderPermissionCard(d),
      permission_resolved: (d) => markPermissionResolved(d),
      gate: () => showQuickReplies(['Sí', 'No']),
      usage: (d) => {
        S.usage = d;
        els.chatCost.hidden = false;
        els.chatCost.textContent = `$${(d.totalCostUsd ?? 0).toFixed(2)}`;
      },
      done: (d) => {
        renderUsageCard(d.usage, d.reason);
        setPhase('done');
        clearActiveBuild(buildId);
        // No confetti when merely replaying an already-finished build's log.
        if (!S.suppressCelebration && typeof launchConfetti === 'function' && d.reason === 'completed') {
          launchConfetti();
        }
      },
      error: (d) => {
        addErrorBlock(d.message);
        if (d.fatal) { setPhase('error'); clearActiveBuild(); }
      },
      __open: () => clearReconnecting(true), // no-op on first connect (no note yet)
      __error: () => showReconnecting(),
    });
  }

  function detach() {
    S.stream?.close();
    S.stream = null;
    S.streamQueue = [];
    clearTimeout(S.renderTimer);
    S.renderTimer = null;
    S.toolRows.clear();
    S.permCards.clear();
    S.reconnectNote = null;
    S.reconnectTries = 0;
  }

  function clearFeed() {
    els.chatFeed.innerHTML = '';
    els.chatCost.hidden = true;
    els.chatElapsed.hidden = true;
    els.chatElapsed.textContent = '00:00';
    S.usage = null;
  }

  // ---------- Actions ---------------------------------------------------------------
  async function startBuild(payload, modelId) {
    S.model = modelId;
    S.suppressCelebration = false;
    els.chatModelPill.textContent = modelLabel(modelId);
    setPhase('starting');
    S.startedAt = Date.now();
    addSystemNote('Iniciando build…');
    try {
      const res = await BuilderAPI.createBuild(payload, { model: modelId });
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({
        buildId: res.buildId, businessName: payload.name, model: modelId, startedAt: S.startedAt,
      }));
      attach(res.buildId, 0);
    } catch (err) {
      addErrorBlock(err.status === 409
        ? err.message
        : `No se pudo iniciar el build: ${err.message}`);
      setPhase('confirming');
    }
  }

  async function sendUserText(text) {
    const clean = text.trim();
    if (!clean || !S.buildId) return;
    addUserBubble(clean);
    hideQuickReplies();
    els.chatInput.value = '';
    autoGrow();
    try {
      await BuilderAPI.sendMessage(S.buildId, clean);
      setPhase('running');
    } catch (err) {
      addErrorBlock(`No se pudo enviar: ${err.message}`);
    }
  }

  async function stopBuild() {
    if (!S.buildId) return;
    try {
      await BuilderAPI.interrupt(S.buildId);
      addSystemNote('Build detenido — puedes continuar o escribir instrucciones.');
    } catch (err) {
      addErrorBlock(`No se pudo detener: ${err.message}`);
    }
  }

  async function resumeBuild() {
    if (!S.buildId) return;
    try {
      await BuilderAPI.resume(S.buildId, 'Continúa donde quedaste.');
      addUserBubble('Continúa donde quedaste.');
      setPhase('running');
    } catch (err) {
      addErrorBlock(`No se pudo continuar: ${err.message}`);
    }
  }

  async function finishBuild() {
    if (!S.buildId) return;
    try {
      await BuilderAPI.finish(S.buildId);
    } catch (err) {
      addErrorBlock(`No se pudo finalizar: ${err.message}`);
    }
  }

  // Clear the reattach pointer — but never wipe another build's pointer just
  // because a historical build's replayed `done` event fired.
  function clearActiveBuild(buildId) {
    if (buildId) {
      try {
        const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
        if (saved && saved.buildId !== buildId) return;
      } catch { /* fall through and clear */ }
    }
    localStorage.removeItem(ACTIVE_KEY);
  }

  // ---------- Build history dropdown ---------------------------------------------
  async function toggleBuildsMenu() {
    const menu = els.chatBuildsMenu;
    if (!menu.hidden) { menu.hidden = true; return; }
    menu.innerHTML = '<p class="msg system">Cargando…</p>';
    menu.hidden = false;
    try {
      const builds = await BuilderAPI.listBuilds();
      menu.innerHTML = builds.length ? '' : '<p class="msg system">Sin builds todavía</p>';
      for (const b of builds.slice(0, 20)) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'build-row';
        const date = b.startedAt ? new Date(b.startedAt).toLocaleDateString() : '';
        const cost = b.costUsd != null ? ` · $${b.costUsd.toFixed(2)}` : '';
        row.innerHTML = `
          <span><span class="build-row-name">${esc(b.businessName || b.id)}</span>
          <span class="build-row-meta">${esc(date)}${esc(cost)} · ${esc(b.model || '')}</span></span>
          <span class="chat-pill">${esc(b.status)}</span>`;
        row.onclick = () => { menu.hidden = true; openExisting(b); };
        menu.appendChild(row);
      }
    } catch (err) {
      menu.innerHTML = `<p class="msg system">Error: ${esc(err.message)}</p>`;
    }
  }

  function openExisting(buildSummary) {
    clearFeed();
    detach();
    els.chatBusinessName.textContent = buildSummary.businessName || 'Build';
    els.chatModelPill.textContent = modelLabel(buildSummary.model || '');
    S.startedAt = buildSummary.startedAt ? new Date(buildSummary.startedAt).getTime() : Date.now();
    S.suppressCelebration = ['completed', 'failed'].includes(buildSummary.status);
    setPhase(STATUS_TO_PHASE[buildSummary.status] || 'done');
    openPanel();
    attach(buildSummary.id, 0);
  }

  // ---------- Composer helpers -----------------------------------------------------
  function autoGrow() {
    const ta = els.chatInput;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 130) + 'px';
  }

  // ---------- Public API -------------------------------------------------------------
  function openForPlace(place) {
    grabEls();
    if (typeof hidePreviewCard === 'function') { try { hidePreviewCard(); } catch { /* n/a */ } }
    clearFeed();
    detach();
    S.buildId = null;
    S.suppressCelebration = false;
    els.chatBusinessName.textContent = place.name || 'Negocio';
    setPhase('confirming');
    openPanel();
    renderConfirmCard(place);
  }

  function close() {
    closePanel();
  }

  // Top-bar "AI" button: expand/collapse the sidebar. Reopening keeps whatever
  // was on screen; a fresh open seeds the current winner's confirm card, or an
  // empty-state hint when no dart has landed yet.
  function toggle() {
    grabEls();
    if (document.body.classList.contains('chat-open')) { closePanel(); return; }
    const winner = window.__lastWinnerPlace;
    // Nothing running/finished on screen → follow the latest winner. A build
    // in progress (or its transcript) is never clobbered by a toggle.
    if (winner && ['idle', 'confirming'].includes(S.phase)
      && els.chatBusinessName.textContent !== winner.name) {
      openForPlace(winner);
      return;
    }
    if (!els.chatFeed.children.length) {
      if (winner) { openForPlace(winner); return; }
      els.chatBusinessName.textContent = 'Website Builder';
      setPhase('idle');
      addSystemNote('Tira un dardo y elige un ganador para generar su sitio web, o abre un build anterior con ↻.');
    }
    openPanel();
  }

  // ---------- Wiring -----------------------------------------------------------------
  function init() {
    grabEls();
    if (!els.chatPanel) return;

    els.chatCloseBtn.onclick = close;
    els.chatStopBtn.onclick = stopBuild;
    els.chatResumeBtn.onclick = resumeBuild;
    els.chatFinishBtn.onclick = finishBuild;
    els.chatSendBtn.onclick = () => sendUserText(els.chatInput.value);
    els.chatBuildsBtn.onclick = toggleBuildsMenu;
    els.chatSettingsBtn.onclick = () => { if (window.BuilderSettings) BuilderSettings.open(); };
    const aiBtn = $('ai-toggle-btn');
    if (aiBtn) aiBtn.onclick = toggle;
    els.chatInput.addEventListener('input', autoGrow);
    els.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserText(els.chatInput.value); }
    });
    els.chatFeed.addEventListener('scroll', () => {
      const feed = els.chatFeed;
      S.pinned = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
      if (S.pinned) els.chatJumpBtn.hidden = true;
    });
    els.chatJumpBtn.onclick = () => {
      S.pinned = true;
      els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
      els.chatJumpBtn.hidden = true;
    };

    reattachIfActive();
  }

  async function reattachIfActive() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch { saved = null; }
    if (!saved?.buildId) return;
    try {
      const build = await BuilderAPI.getBuild(saved.buildId);
      if (REATTACHABLE_STATUSES.includes(build.status)) {
        addSystemNote('Reconectado al build en curso.');
        openExisting({
          id: build.id, businessName: build.business?.name,
          model: build.model, status: build.status, startedAt: build.createdAt,
        });
      } else {
        clearActiveBuild();
      }
    } catch {
      clearActiveBuild(); // bridge down or build gone — silent
    }
  }

  window.BuilderChat = Object.freeze({ openForPlace, close, toggle, openExisting });
  init();
})();
