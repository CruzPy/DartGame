// Build lifecycle: one active build at a time, sequence-numbered event log per
// build (replayable), persistent build records, SSE fan-out via subscribers.
import { randomUUID } from 'node:crypto';
import { loadJson, saveJson, appendEvent, readEvents, countEvents, BUILDS_PATH, WORKSPACE_DIR } from './store.js';
import { getProvider } from './providers/provider.js';
import { BuildStatus, EventTypes, ev } from './events.js';

const LIVE_STATUSES = new Set([
  BuildStatus.STARTING, BuildStatus.RUNNING,
  BuildStatus.WAITING_INPUT, BuildStatus.WAITING_PERMISSION,
]);

function slugify(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'negocio';
}

export class BuildManager {
  constructor() {
    this.builds = loadJson(BUILDS_PATH, {});
    this.handles = new Map();      // buildId -> adapter handle
    this.seqs = new Map();         // buildId -> last seq
    this.subscribers = new Map();  // buildId -> Set<fn(envelope)>

    // Bridge restarted: anything that was live is now orphaned (the child died
    // with us) but the CLI session on disk survives — resumable.
    let dirty = false;
    for (const b of Object.values(this.builds)) {
      if (LIVE_STATUSES.has(b.status)) { b.status = BuildStatus.INTERRUPTED; dirty = true; }
      const lastSeq = countEvents(b.id);
      if (lastSeq) this.seqs.set(b.id, lastSeq);
    }
    if (dirty) this.#persist();
  }

  #persist() { saveJson(BUILDS_PATH, this.builds); }

  #handleAlive(buildId) {
    const build = this.builds[buildId];
    const handle = this.handles.get(buildId);
    if (!build || !handle) return false;
    return getProvider(build.provider).isAlive(handle);
  }

  get activeBuild() {
    // A build blocks new ones while its status is live OR its CLI process is
    // still running (an interrupted build keeps its process alive for resume).
    return Object.values(this.builds).find(
      (b) => LIVE_STATUSES.has(b.status) || this.#handleAlive(b.id),
    ) || null;
  }

  list() {
    return Object.values(this.builds)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((b) => ({
        id: b.id, businessName: b.business?.name, status: b.status,
        startedAt: b.createdAt, model: b.model,
        costUsd: b.usage?.totalCostUsd ?? null,
      }));
  }

  get(buildId) { return this.builds[buildId] || null; }

  getEvents(buildId, sinceSeq = 0) { return readEvents(buildId, sinceSeq); }

  subscribe(buildId, fn) {
    if (!this.subscribers.has(buildId)) this.subscribers.set(buildId, new Set());
    this.subscribers.get(buildId).add(fn);
    return () => this.subscribers.get(buildId)?.delete(fn);
  }

  #emit(buildId, { type, data }) {
    const seq = (this.seqs.get(buildId) || 0) + 1;
    this.seqs.set(buildId, seq);
    const envelope = { seq, buildId, ts: Date.now(), type, data };
    appendEvent(buildId, envelope);

    // Persist builds.json only when the record actually changes — NOT on every
    // delta/tool event (a long build emits thousands; rewriting the whole file
    // per event would hammer the event loop).
    const build = this.builds[buildId];
    if (build) {
      let changed = false;
      if (type === EventTypes.STATUS && data.status) { build.status = data.status; changed = true; }
      if (type === EventTypes.USAGE) { build.usage = data; changed = true; }
      if (type === EventTypes.DONE && data.reason === 'completed') { build.status = BuildStatus.COMPLETED; changed = true; }
      if (type === EventTypes.ERROR && data.fatal) { build.status = BuildStatus.FAILED; changed = true; }
      if (changed) {
        build.updatedAt = new Date().toISOString();
        this.#persist();
      }
    }
    for (const fn of this.subscribers.get(buildId) || []) {
      try { fn(envelope); } catch { /* subscriber died */ }
    }
  }

  async start(payload, { model, provider = 'claude-cli', allowedTools } = {}) {
    if (!payload || payload.source !== 'dart-business-finder' || !payload.name) {
      const err = new Error('Payload inválido: se espera un DART winner (source=dart-business-finder con name)');
      err.status = 400; throw err;
    }
    if (this.activeBuild) {
      const err = new Error(`Ya hay un build activo (${this.activeBuild.business?.name}). Termínalo o detenlo primero.`);
      err.status = 409; throw err;
    }

    const adapter = getProvider(provider);
    const sessionId = randomUUID();
    const buildId = sessionId;
    const chosenModel = model || adapter.getModels()[0]?.id;

    this.builds[buildId] = {
      id: buildId,
      business: { name: payload.name, slug: slugify(payload.name) },
      payload,
      provider,
      model: chosenModel,
      allowedTools: allowedTools || null, // reused on resume so permissions stay consistent
      status: BuildStatus.STARTING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usage: null,
    };
    this.#persist();

    // Skill seam: prompt shape + the dart payload validation above are the two
    // dr-site-builder-specific spots in this file. A second skill/entry point
    // should turn these into a passed-in "job" (prompt + validator) rather
    // than growing branches here. Payload verbatim keeps build-cost.py
    // attribution working.
    const prompt = `Usa el skill dr-site-builder con este DART winner:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
    try {
      const handle = await adapter.start({
        buildId, sessionId, prompt, model: chosenModel,
        cwd: WORKSPACE_DIR, allowedTools,
        onEvent: (evn) => this.#emit(buildId, evn),
      });
      this.handles.set(buildId, handle);
    } catch (err) {
      this.builds[buildId].status = BuildStatus.FAILED;
      this.#persist();
      throw err;
    }
    return this.builds[buildId];
  }

  #liveHandle(buildId) {
    const build = this.#require(buildId);
    const adapter = getProvider(build.provider);
    const handle = this.handles.get(buildId);
    if (!handle || !adapter.isAlive(handle)) return { build, adapter, handle: null };
    return { build, adapter, handle };
  }

  #require(buildId) {
    const build = this.builds[buildId];
    if (!build) { const err = new Error('Build no encontrado'); err.status = 404; throw err; }
    return build;
  }

  async sendMessage(buildId, text) {
    const { adapter, handle } = this.#liveHandle(buildId);
    if (!handle) return this.resume(buildId, text); // process gone → respawn on same session
    adapter.send(handle, text);
  }

  respondPermission(buildId, requestId, decision) {
    const { adapter, handle } = this.#liveHandle(buildId);
    if (!handle) { const err = new Error('El build ya no está activo'); err.status = 409; throw err; }
    adapter.respondPermission(handle, requestId, decision);
  }

  interrupt(buildId) {
    const { adapter, handle } = this.#liveHandle(buildId);
    if (!handle) { const err = new Error('El build ya no está corriendo'); err.status = 409; throw err; }
    adapter.interrupt(handle);
  }

  kill(buildId) {
    const { build, adapter, handle } = this.#liveHandle(buildId);
    // With a live handle the adapter's exit hook emits status:interrupted;
    // with none, emit it here so the record and stream stay in sync.
    if (handle) adapter.kill(handle);
    else if (LIVE_STATUSES.has(build.status)) this.#emit(buildId, ev.status(BuildStatus.INTERRUPTED));
  }

  async resume(buildId, text) {
    const build = this.#require(buildId);
    const other = this.activeBuild;
    if (other && other.id !== buildId) {
      const err = new Error(`Otro build está activo (${other.business?.name})`);
      err.status = 409; throw err;
    }
    const adapter = getProvider(build.provider);
    const existing = this.handles.get(buildId);
    if (existing && adapter.isAlive(existing)) {
      adapter.send(existing, text || 'Continúa donde quedaste.');
      return build;
    }
    const handle = await adapter.resume({
      buildId, sessionId: build.id, model: build.model,
      cwd: WORKSPACE_DIR, text,
      allowedTools: build.allowedTools || undefined,
      onEvent: (evn) => this.#emit(buildId, evn),
    });
    this.handles.set(buildId, handle);
    // Status flips to running when the adapter's init event arrives.
    return build;
  }

  finish(buildId) {
    const { build, adapter, handle } = this.#liveHandle(buildId);
    if (handle) {
      adapter.finish(handle);
    } else {
      this.#emit(buildId, { type: EventTypes.DONE, data: { reason: 'completed', usage: build.usage } });
    }
  }
}
