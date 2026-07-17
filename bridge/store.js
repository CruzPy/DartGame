// Tiny persistent JSON store: atomic writes (tmp + rename) and an append-only
// JSONL event log per build.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRIDGE_DIR = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(BRIDGE_DIR, 'data');
export const EVENTS_DIR = join(DATA_DIR, 'events');
// Layout: <workspace>/DartGame/bridge — builds run with cwd = workspace root
// (where the dr-scaffold, config/ and COSTS.md live). Override with
// BRIDGE_WORKSPACE if the repo is cloned elsewhere.
export const WORKSPACE_DIR = process.env.BRIDGE_WORKSPACE || dirname(dirname(BRIDGE_DIR));

mkdirSync(EVENTS_DIR, { recursive: true });

export function loadJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function saveJson(path, value) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

export const BUILDS_PATH = join(DATA_DIR, 'builds.json');
export const SETTINGS_PATH = join(DATA_DIR, 'settings.json');

export function eventLogPath(buildId) {
  // buildId is a bridge-generated UUID — safe as a filename.
  return join(EVENTS_DIR, `${buildId}.jsonl`);
}

export function appendEvent(buildId, envelope) {
  appendFileSync(eventLogPath(buildId), JSON.stringify(envelope) + '\n');
}

export function readEvents(buildId, sinceSeq = 0) {
  const path = eventLogPath(buildId);
  if (!existsSync(path)) return [];
  // The log is append-only with seq starting at 1 and incrementing by 1, so
  // line k (0-based) holds seq k+1 — skip the prefix without parsing it.
  const lines = readFileSync(path, 'utf8').split('\n');
  const out = [];
  for (const line of lines.slice(Math.max(0, sinceSeq))) {
    if (!line.trim()) continue;
    try {
      const evn = JSON.parse(line);
      if (evn.seq > sinceSeq) out.push(evn);
    } catch { /* skip torn line */ }
  }
  return out;
}

// Last seq without parsing the log (seq == number of non-empty lines).
export function countEvents(buildId) {
  const path = eventLogPath(buildId);
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf8');
  let count = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) count++;
  return text.endsWith('\n') || text.length === 0 ? count : count + 1;
}
