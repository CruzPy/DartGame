'use strict';
// Website Builder settings window: provider cards, model picker, engine status,
// optional API key (stored via the bridge, never in localStorage).
// Exposes window.BuilderSettings.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => BuilderAPI.esc(v);
  let apiKeyDirty = false;

  function badge(cls, text) {
    return `<span class="provider-badge ${cls}">${esc(text)}</span>`;
  }

  function renderProviders(settings, statusInfo) {
    const wrap = $('settings-providers');
    wrap.innerHTML = '';
    for (const p of settings.providers || []) {
      const card = document.createElement('div');
      const isActive = p.id === settings.activeProvider;
      card.className = `provider-card${isActive ? ' active' : ''}${p.available ? '' : ' disabled'}`;
      let badgeHtml = badge('soon', 'Próximamente');
      let sub = '';
      if (p.available) {
        const auth = statusInfo?.providers?.[p.id];
        if (auth?.ok) {
          badgeHtml = badge('ok', 'Conectado');
          sub = auth.detail || '';
        } else if (auth) {
          badgeHtml = badge('bad', auth.installed ? 'Sin sesión' : 'No encontrado');
          sub = auth.detail || '';
        } else {
          badgeHtml = badge('soon', 'Verificando…');
        }
      }
      card.innerHTML = `
        <span><span class="provider-name">${esc(p.label)}</span>
        ${sub ? `<span class="provider-sub">${esc(sub)}</span>` : ''}</span>
        ${badgeHtml}`;
      wrap.appendChild(card);
    }
  }

  async function load({ withStatus } = {}) {
    const note = $('settings-status-note');
    try {
      const settings = await BuilderAPI.getSettings();
      renderProviders(settings, null);

      const select = $('settings-model-select');
      select.innerHTML = (settings.availableModels || [])
        .map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('');
      select.value = settings.model || 'opus';

      const keyInput = $('settings-api-key');
      keyInput.value = '';
      keyInput.placeholder = settings.hasApiKey
        ? `Guardada: ${settings.apiKeyMasked}` : 'sk-ant-... (opcional)';
      apiKeyDirty = false;
      note.textContent = '';

      if (withStatus) {
        note.textContent = 'Verificando el motor (puede tardar ~20s la primera vez)…';
        const statusInfo = await BuilderAPI.status();
        renderProviders(settings, statusInfo);
        note.textContent = '';
      }
    } catch (err) {
      note.textContent = `Bridge no disponible: ${err.message}. Inicia el servidor y reintenta.`;
    }
  }

  async function save() {
    const note = $('settings-status-note');
    const body = { model: $('settings-model-select').value };
    const key = $('settings-api-key').value.trim();
    if (apiKeyDirty && key) body.apiKey = key;
    try {
      await BuilderAPI.putSettings(body);
      if (typeof setToast === 'function') setToast('Configuración guardada.');
      $('settings-api-key').value = '';
      apiKeyDirty = false;
      await load({ withStatus: false });
    } catch (err) {
      note.textContent = `No se pudo guardar: ${err.message}`;
    }
  }

  function open() {
    const win = $('settings-window');
    if (!win) return;
    win.classList.remove('hidden');
    if (typeof bringWindowToFront === 'function') { try { bringWindowToFront(win); } catch { /* n/a */ } }
    load({ withStatus: true });
  }

  function close() {
    $('settings-window')?.classList.add('hidden');
  }

  function init() {
    const win = $('settings-window');
    if (!win) return;
    $('close-settings-window').onclick = close;
    $('settings-save-btn').onclick = save;
    $('settings-check-btn').onclick = () => load({ withStatus: true });
    $('settings-api-key').addEventListener('input', () => { apiKeyDirty = true; });
  }

  window.BuilderSettings = Object.freeze({ open, close });
  init();
})();
