// DART Builder Bridge — local-only server that serves the DART Business Finder
// and runs dr-site-builder builds through provider adapters (v1: Claude Code CLI).
// Zero npm dependencies. Start: node bridge/server.js → http://127.0.0.1:4173
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from './static.js';
import { handleSse } from './sse.js';
import { BuildManager } from './build-manager.js';
import { registerProvider, getProvider, listProviders } from './providers/provider.js';
import { claudeCliAdapter } from './providers/claude-cli.js';
import { loadJson, saveJson, SETTINGS_PATH, WORKSPACE_DIR } from './store.js';

const PORT = Number(process.env.BRIDGE_PORT) || 4173;
const HOST = '127.0.0.1';
const API_KEY_ENV_PATH = join(WORKSPACE_DIR, 'config', 'api_key.env');

registerProvider(claudeCliAdapter);
const manager = new BuildManager();

// Settings-UI catalog: registered adapters (available) + planned entries.
// `available` derives from the registry so the two can never disagree.
const PLANNED_PROVIDERS = [
  { id: 'anthropic-api', label: 'Claude — API key (Agent SDK)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' },
];

function providerCatalog() {
  const registered = listProviders().map((p) => ({ id: p.id, label: p.label, available: true }));
  const planned = PLANNED_PROVIDERS
    .filter((p) => !registered.some((r) => r.id === p.id))
    .map((p) => ({ ...p, available: false }));
  return [...registered, ...planned];
}

function getSettings() {
  return { activeProvider: 'claude-cli', model: 'opus', ...loadJson(SETTINGS_PATH, {}) };
}

function readApiKeyState() {
  try {
    if (!existsSync(API_KEY_ENV_PATH)) return { hasApiKey: false, apiKeyMasked: null };
    const match = readFileSync(API_KEY_ENV_PATH, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (!match || !match[1].trim()) return { hasApiKey: false, apiKeyMasked: null };
    const key = match[1].trim();
    return { hasApiKey: true, apiKeyMasked: key.slice(0, 10) + '…' + key.slice(-4) };
  } catch {
    return { hasApiKey: false, apiKeyMasked: null };
  }
}

function writeApiKey(key) {
  let content = existsSync(API_KEY_ENV_PATH) ? readFileSync(API_KEY_ENV_PATH, 'utf8') : '';
  const line = `ANTHROPIC_API_KEY=${key}`;
  if (/^ANTHROPIC_API_KEY=.*$/m.test(content)) {
    // Replacer FUNCTION: a key containing `$&`/`$1` must be written literally,
    // not interpreted as a replacement pattern.
    content = content.replace(/^ANTHROPIC_API_KEY=.*$/m, () => line);
  } else {
    content = content.replace(/\s*$/, '\n') + line + '\n';
  }
  writeFileSync(API_KEY_ENV_PATH, content);
}

let statusCache = { at: 0, value: null };
async function getStatus() {
  if (statusCache.value && Date.now() - statusCache.at < 60_000) return statusCache.value;
  const settings = getSettings();
  const providers = {};
  // Concurrent — each checkAuth can cold-start a CLI (~17s); serializing them
  // would sum the latencies once a second provider exists.
  await Promise.all(listProviders().map(async (p) => {
    const auth = await p.checkAuth();
    providers[p.id] = { ...auth, label: p.label, models: p.getModels(), activeModel: settings.model };
  }));
  statusCache = { at: Date.now(), value: { activeProvider: settings.activeProvider, providers } };
  return statusCache.value;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1_000_000) { reject(Object.assign(new Error('Body demasiado grande'), { status: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;

  try {
    if (!path.startsWith('/api/')) return serveStatic(req, res);

    // --- builds collection ---
    if (path === '/api/builds' && req.method === 'POST') {
      const { payload, model, provider } = await readBody(req);
      const settings = getSettings();
      const build = await manager.start(payload, {
        model: model || settings.model,
        provider: provider || settings.activeProvider,
        allowedTools: settings.allowedTools,
      });
      return sendJson(res, 201, { buildId: build.id, status: build.status });
    }
    if (path === '/api/builds' && req.method === 'GET') {
      return sendJson(res, 200, manager.list());
    }

    // --- per-build routes ---
    const buildMatch = path.match(/^\/api\/builds\/([0-9a-f-]{36})(?:\/([a-z]+))?$/);
    if (buildMatch) {
      const [, buildId, action] = buildMatch;

      if (!action && req.method === 'GET') {
        const build = manager.get(buildId);
        if (!build) return sendJson(res, 404, { error: 'Build no encontrado' });
        return sendJson(res, 200, build);
      }
      if (action === 'events' && req.method === 'GET') {
        if (!manager.get(buildId)) return sendJson(res, 404, { error: 'Build no encontrado' });
        return handleSse(req, res, { manager, buildId });
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        switch (action) {
          case 'message':
            if (!body.text?.trim()) return sendJson(res, 400, { error: 'Falta text' });
            await manager.sendMessage(buildId, body.text);
            return sendJson(res, 200, { ok: true });
          case 'permission':
            manager.respondPermission(buildId, body.requestId, { behavior: body.behavior, message: body.message });
            return sendJson(res, 200, { ok: true });
          case 'interrupt':
            manager.interrupt(buildId);
            return sendJson(res, 200, { ok: true });
          case 'kill':
            manager.kill(buildId);
            return sendJson(res, 200, { ok: true });
          case 'resume':
            await manager.resume(buildId, body.text);
            return sendJson(res, 200, { ok: true });
          case 'finish':
            manager.finish(buildId);
            return sendJson(res, 200, { ok: true });
        }
      }
      return sendJson(res, 404, { error: 'Ruta no encontrada' });
    }

    // --- status & settings ---
    if (path === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, await getStatus());
    }
    if (path === '/api/settings' && req.method === 'GET') {
      const settings = getSettings();
      const active = getProvider(settings.activeProvider);
      return sendJson(res, 200, {
        activeProvider: settings.activeProvider,
        model: settings.model,
        availableModels: active.getModels(),
        providers: providerCatalog(),
        ...readApiKeyState(),
      });
    }
    if (path === '/api/settings' && req.method === 'PUT') {
      const body = await readBody(req);
      const settings = getSettings();
      if (body.model) settings.model = String(body.model);
      if (body.activeProvider) {
        if (!providerCatalog().find((p) => p.id === body.activeProvider && p.available)) {
          return sendJson(res, 400, { error: 'Proveedor no disponible todavía' });
        }
        settings.activeProvider = body.activeProvider;
      }
      if (body.apiKey?.trim()) writeApiKey(body.apiKey.trim());
      saveJson(SETTINGS_PATH, settings);
      statusCache.value = null;
      return sendJson(res, 200, {
        activeProvider: settings.activeProvider,
        model: settings.model,
        ...readApiKeyState(),
      });
    }

    return sendJson(res, 404, { error: 'Ruta no encontrada' });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[bridge]', err);
    if (!res.headersSent) sendJson(res, status, { error: err.message });
  }
});

// Warm the status cache so the first browser request doesn't eat the CLI's
// ~17s cold start.
getStatus().catch(() => {});

server.listen(PORT, HOST, () => {
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│  DART Builder Bridge                            │');
  console.log(`│  App:  http://${HOST}:${PORT}                      │`);
  console.log(`│  Workspace: ${WORKSPACE_DIR}`);
  console.log('│  Engine: Claude Code CLI (suscripción local)    │');
  console.log('└─────────────────────────────────────────────────┘');
});
