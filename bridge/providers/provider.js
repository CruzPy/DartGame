// Provider adapter contract. Every engine that can run a website build
// implements this shape; the build manager and HTTP layer only ever talk to
// this interface, never to a concrete engine.
//
// Adapter lifecycle:
//   const handle = await adapter.start({ buildId, sessionId, prompt, model, cwd, onEvent })
//   adapter.send(handle, text)                      — user reply / steering
//   adapter.respondPermission(handle, requestId, { behavior, message })
//   adapter.interrupt(handle)                       — graceful stop, session survives
//   adapter.kill(handle)                            — hard stop, kills process tree
//   adapter.finish(handle)                          — end session cleanly (close stdin)
//   const handle = await adapter.resume({ buildId, sessionId, model, cwd, onEvent, text })
//
// `onEvent` receives normalized {type, data} objects from events.js.
// checkAuth() → { ok, installed, version, loggedIn, method, plan, detail }
// getModels() → [{ id, label }]

const registry = new Map();

export function registerProvider(adapter) {
  registry.set(adapter.id, adapter);
}

export function getProvider(id) {
  const adapter = registry.get(id);
  if (!adapter) throw new Error(`Unknown provider: ${id}`);
  return adapter;
}

export function listProviders() {
  return [...registry.values()];
}
