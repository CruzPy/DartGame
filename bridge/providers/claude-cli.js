// Claude Code CLI adapter — spawns the locally installed `claude` binary in
// headless bidirectional stream-json mode and translates its event stream to
// the normalized bridge events. Auth rides on the user's Claude subscription
// login; no API key involved.
//
// Verified against claude CLI 2.1.185 (spiked 2026-07-16):
//   - `--permission-prompt-tool stdio` works: non-allowlisted mutating tools emit
//     {type:"control_request", request:{subtype:"can_use_tool", ...}} on stdout and
//     accept {type:"control_response", response:{subtype:"success", request_id,
//     response:{behavior:"allow"|"deny", ...}}} on stdin.
//   - Interrupt: send {type:"control_request", request_id, request:{subtype:"interrupt"}};
//     the turn aborts with result subtype "error_during_execution", process survives.
//   - Every turn ends with a `result` event carrying cumulative usage + total_cost_usd.
import { spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);
import { ev } from '../events.js';

// Heuristic: does this assistant message end in a dr-site-builder checkpoint
// question (sí/no decision)? Canonical form is "¿...? (sí / no)" but models
// paraphrase ("Responde **sí** para ... o **no** para ..."). Skill-specific by
// nature — lives here (not in events.js) so the normalized event contract
// stays provider/skill-agnostic; the frontend has its own fallback regex.
function detectGate(text) {
  if (/\(\s*s[ií]\s*\/\s*no\s*\)/i.test(text)) return true;
  const tail = text.slice(-500);
  return /\bs[ií]\b/i.test(tail) && /\bno\b/i.test(tail)
    && /(responde|procedo|confirmas|quieres|buen fit|construy|¿)/i.test(tail);
}

const MODELS = [
  { id: 'opus', label: 'Claude Opus (mejor calidad)' },
  { id: 'sonnet', label: 'Claude Sonnet (equilibrado)' },
  { id: 'haiku', label: 'Claude Haiku (rápido / pruebas)' },
];

// Bash patterns the dr-site-builder skill is known to need. Anything outside
// this list (and outside acceptEdits' file-edit auto-approval) surfaces as an
// approval card in the chat UI instead of being silently allowed.
const DEFAULT_ALLOWED_TOOLS = [
  'Bash(git *)', 'Bash(gh *)', 'Bash(railway *)',
  'Bash(python *)', 'Bash(python3 *)', 'Bash(pip *)',
  'Bash(node *)', 'Bash(npm *)', 'Bash(npx *)',
  'Bash(mkdir *)', 'Bash(cp *)', 'Bash(robocopy *)',
  // Reads are non-destructive; the skill reads its references from
  // ~/.claude/skills (outside cwd), which otherwise prompts on every build.
  'Read', 'Glob', 'Grep',
  'Skill', 'Task', 'TodoWrite',
  'WebFetch', 'WebSearch',
];

const TOOL_OUTPUT_CAP = 20_000;

function resolveClaudeExe() {
  const candidates = [
    process.env.CLAUDE_EXE,
    process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    const out = execFileSync('where', ['claude.exe'], { encoding: 'utf8' });
    const line = out.split(/\r?\n/).find((l) => l.trim().endsWith('.exe'));
    if (line) return line.trim();
  } catch { /* not on PATH */ }
  return null;
}

function summarizeToolInput(name, input = {}) {
  const clip = (s, n = 140) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s);
  if (input.command) return clip(input.command);
  if (input.file_path) return clip(input.file_path);
  if (input.url) return clip(input.url);
  if (input.skill) return clip(input.skill);
  if (input.pattern) return clip(input.pattern);
  if (input.description) return clip(input.description);
  try { return clip(JSON.stringify(input)); } catch { return ''; }
}

function textOfToolResult(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (c && c.type === 'text' ? c.text : '')).join('\n');
  }
  return '';
}

function mapUsage(result) {
  const u = result.usage || {};
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    totalCostUsd: result.total_cost_usd ?? 0,
    turns: result.num_turns ?? 0,
  };
}

class ClaudeCliAdapter {
  id = 'claude-cli';
  label = 'Claude — Claude Code CLI';

  getModels() { return MODELS; }

  async checkAuth() {
    const exe = resolveClaudeExe();
    if (!exe) return { ok: false, installed: false, detail: 'claude CLI no encontrado' };
    try {
      // Cold CLI startup can take ~17s — run both checks concurrently, long timeout.
      const opts = { encoding: 'utf8', timeout: 60_000, windowsHide: true };
      const [versionOut, statusOut] = await Promise.all([
        execFileAsync(exe, ['--version'], opts),
        execFileAsync(exe, ['auth', 'status', '--json'], opts),
      ]);
      const version = versionOut.stdout.trim();
      const status = JSON.parse(statusOut.stdout);
      return {
        ok: !!status.loggedIn,
        installed: true,
        version,
        loggedIn: !!status.loggedIn,
        method: 'cli-login',
        plan: status.subscriptionType || null,
        detail: status.loggedIn ? `Sesión ${status.subscriptionType || ''} (${status.email || ''})`.trim() : 'CLI instalado pero sin sesión — corre `claude login`',
      };
    } catch (err) {
      return { ok: false, installed: true, detail: `Error verificando CLI: ${err.message}` };
    }
  }

  async start({ sessionId, prompt, model, cwd, onEvent, allowedTools }) {
    return this.#spawn({ sessionArgs: ['--session-id', sessionId], prompt, model, cwd, onEvent, allowedTools });
  }

  async resume({ sessionId, model, cwd, onEvent, text, allowedTools }) {
    return this.#spawn({ sessionArgs: ['--resume', sessionId], prompt: text || 'Continúa donde quedaste.', model, cwd, onEvent, allowedTools });
  }

  #spawn({ sessionArgs, prompt, model, cwd, onEvent, allowedTools }) {
    const exe = resolveClaudeExe();
    if (!exe) throw new Error('claude CLI no encontrado');

    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', model || 'opus',
      ...sessionArgs,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', ...(allowedTools?.length ? allowedTools : DEFAULT_ALLOWED_TOOLS),
      '--permission-prompt-tool', 'stdio',
    ];

    const child = spawn(exe, args, { cwd, shell: false, windowsHide: true });
    const handle = {
      child,
      onEvent,
      pendingPermissions: new Map(), // requestId -> input (needed for allow's updatedInput)
      interrupting: false,
      closing: null, // 'finish' | 'kill' | null
      sawInit: false,
      streamingText: false,
      buf: '',
    };

    // setEncoding uses an internal StringDecoder — multibyte UTF-8 sequences
    // (á, ñ, ✓, …) split across chunk boundaries decode correctly instead of
    // becoming U+FFFD and poisoning the JSON line.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      handle.buf += chunk;
      let idx;
      while ((idx = handle.buf.indexOf('\n')) >= 0) {
        const line = handle.buf.slice(0, idx).trim();
        handle.buf = handle.buf.slice(idx + 1);
        if (!line) continue;
        let parsed;
        try { parsed = JSON.parse(line); } catch { continue; }
        try { this.#translate(handle, parsed); } catch (err) {
          onEvent(ev.error(`Error interno traduciendo evento: ${err.message}`));
        }
      }
    });

    let stderrTail = '';
    child.stderr.on('data', (d) => { stderrTail = (stderrTail + d).slice(-2000); });

    child.on('error', (err) => onEvent(ev.error(`No se pudo iniciar claude: ${err.message}`, true)));
    child.on('exit', (code) => {
      if (handle.closing === 'finish') {
        onEvent(ev.done('completed'));
      } else if (handle.closing === 'kill' || handle.interrupting) {
        onEvent(ev.status('interrupted'));
      } else if (code !== 0) {
        onEvent(ev.error(`El proceso claude terminó inesperadamente (código ${code}). ${stderrTail.slice(-400)}`, true));
        onEvent(ev.status('failed'));
      } else {
        onEvent(ev.done('completed'));
      }
    });

    this.#writeLine(handle, {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: prompt }] },
    });

    return handle;
  }

  #translate(handle, e) {
    const emit = handle.onEvent;

    switch (e.type) {
      case 'system':
        if (e.subtype === 'init' && !handle.sawInit) {
          handle.sawInit = true;
          emit(ev.status('running'));
        }
        return;

      case 'stream_event': {
        const se = e.event || {};
        if (se.type === 'content_block_start' && se.content_block?.type === 'text') {
          handle.streamingText = true;
          emit(ev.messageStart('assistant'));
        } else if (se.type === 'content_block_delta' && se.delta?.type === 'text_delta' && handle.streamingText) {
          emit(ev.messageDelta(se.delta.text));
        } else if (se.type === 'content_block_stop') {
          handle.streamingText = false;
        }
        return;
      }

      case 'assistant': {
        for (const block of e.message?.content || []) {
          if (block.type === 'text' && block.text) {
            emit(ev.messageEnd(block.text));
            if (detectGate(block.text)) emit(ev.gate(block.text));
          } else if (block.type === 'tool_use') {
            emit(ev.toolStart(block.id, block.name, summarizeToolInput(block.name, block.input)));
          }
        }
        return;
      }

      case 'user': {
        for (const block of e.message?.content || []) {
          if (block.type === 'tool_result') {
            const text = textOfToolResult(block.content);
            if (text) {
              emit(ev.toolOutput(block.tool_use_id, text.length > TOOL_OUTPUT_CAP
                ? text.slice(0, TOOL_OUTPUT_CAP) + '\n… [salida truncada]'
                : text));
            }
            emit(ev.toolEnd(block.tool_use_id, !block.is_error));
          }
        }
        return;
      }

      case 'control_request': {
        if (e.request?.subtype === 'can_use_tool') {
          handle.pendingPermissions.set(e.request_id, e.request.input || {});
          emit(ev.status('waiting_permission'));
          emit(ev.permissionRequest(
            e.request_id,
            e.request.tool_name,
            e.request.input,
            e.request.permission_suggestions || [],
          ));
        }
        return;
      }

      case 'result': {
        emit(ev.usage(mapUsage(e)));
        if (handle.interrupting) {
          handle.interrupting = false;
          emit(ev.status('interrupted'));
        } else {
          emit(ev.status('waiting_input'));
        }
        return;
      }

      default:
        return; // rate_limit_event, control_response, thinking_tokens, etc.
    }
  }

  send(handle, text) {
    handle.interrupting = false;
    this.#writeLine(handle, {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] },
    });
    handle.onEvent(ev.status('running'));
  }

  respondPermission(handle, requestId, { behavior, message }) {
    const input = handle.pendingPermissions.get(requestId);
    if (input === undefined) throw new Error(`Permiso desconocido: ${requestId}`);
    handle.pendingPermissions.delete(requestId);
    const response = behavior === 'allow'
      ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: message || 'El usuario denegó esta acción.' };
    this.#writeLine(handle, {
      type: 'control_response',
      response: { subtype: 'success', request_id: requestId, response },
    });
    handle.onEvent(ev.permissionResolved(requestId, behavior));
    handle.onEvent(ev.status('running'));
  }

  interrupt(handle) {
    handle.interrupting = true;
    this.#writeLine(handle, {
      type: 'control_request',
      request_id: randomUUID(),
      request: { subtype: 'interrupt' },
    });
  }

  finish(handle) {
    handle.closing = 'finish';
    try { handle.child.stdin.end(); } catch { /* already closed */ }
  }

  kill(handle) {
    handle.closing = 'kill';
    const pid = handle.child.pid;
    if (!pid) return;
    try {
      // /T kills the whole tree (git/python/railway grandchildren included).
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    } catch {
      try { handle.child.kill(); } catch { /* gone */ }
    }
  }

  isAlive(handle) {
    return !!handle?.child && handle.child.exitCode === null && !handle.child.killed;
  }

  #writeLine(handle, obj) {
    if (!handle.child.stdin.writable) throw new Error('El proceso claude ya no acepta entrada');
    handle.child.stdin.write(JSON.stringify(obj) + '\n');
  }
}

export const claudeCliAdapter = new ClaudeCliAdapter();
