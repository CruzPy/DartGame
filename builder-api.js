'use strict';
// Bridge client for the Website Builder: REST calls + SSE event stream.
// Exposes window.BuilderAPI. Zero dependencies, plain script (no modules).
(function () {
  const BASE = (location.protocol === 'http:' || location.protocol === 'https:')
    ? location.origin
    : (window.BUILDER_BRIDGE_URL || 'http://127.0.0.1:4173');

  // Shared HTML escaper for all builder scripts (loads before them). app.js's
  // escapeHtml exists but loads last — this keeps the builder self-contained
  // with a single escaping implementation instead of per-file copies.
  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  async function request(path, options = {}) {
    const res = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function ping() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(BASE + '/api/settings', { signal: ctrl.signal });
      clearTimeout(timer);
      return res.ok ? await res.json() : null;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  // Slow variant: /api/status shells out to the claude CLI (cold start ~17s).
  async function status() {
    return request('/api/status');
  }

  /**
   * Open the SSE stream for a build. `handlers` is a map of eventType -> fn(data, envelope).
   * Replays from `since` (0 = full transcript). On transport drops EventSource
   * auto-reconnects with Last-Event-ID, which the bridge honors over ?since.
   */
  function openEvents(buildId, since, handlers) {
    const es = new EventSource(`${BASE}/api/builds/${buildId}/events?since=${since || 0}`);
    const TYPES = ['status', 'message_start', 'message_delta', 'message_end',
      'tool_start', 'tool_output', 'tool_end', 'permission_request',
      'permission_resolved', 'gate', 'usage', 'done', 'error'];
    for (const type of TYPES) {
      es.addEventListener(type, (e) => {
        let envelope;
        try { envelope = JSON.parse(e.data); } catch { return; }
        if (handlers[type]) handlers[type](envelope.data, envelope);
      });
    }
    if (handlers.__open) es.onopen = () => handlers.__open();
    if (handlers.__error) es.onerror = () => handlers.__error(es.readyState);
    return { close: () => es.close() };
  }

  window.BuilderAPI = Object.freeze({
    base: BASE,
    esc,
    ping,
    status,
    createBuild: (payload, opts) => request('/api/builds', { method: 'POST', body: { payload, ...opts } }),
    listBuilds: () => request('/api/builds'),
    getBuild: (id) => request(`/api/builds/${id}`),
    sendMessage: (id, text) => request(`/api/builds/${id}/message`, { method: 'POST', body: { text } }),
    respondPermission: (id, requestId, behavior, message) =>
      request(`/api/builds/${id}/permission`, { method: 'POST', body: { requestId, behavior, message } }),
    interrupt: (id) => request(`/api/builds/${id}/interrupt`, { method: 'POST' }),
    kill: (id) => request(`/api/builds/${id}/kill`, { method: 'POST' }),
    resume: (id, text) => request(`/api/builds/${id}/resume`, { method: 'POST', body: { text } }),
    finish: (id) => request(`/api/builds/${id}/finish`, { method: 'POST' }),
    getSettings: () => request('/api/settings'),
    putSettings: (partial) => request('/api/settings', { method: 'PUT', body: partial }),
    openEvents,
  });
})();
