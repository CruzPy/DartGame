// Normalized build-event constructors — the contract every provider adapter
// emits and the browser consumes. Envelope fields (seq) are added by the
// build manager; adapters emit only {type, data}.

export const EventTypes = Object.freeze({
  STATUS: 'status',
  MESSAGE_START: 'message_start',
  MESSAGE_DELTA: 'message_delta',
  MESSAGE_END: 'message_end',
  TOOL_START: 'tool_start',
  TOOL_OUTPUT: 'tool_output',
  TOOL_END: 'tool_end',
  PERMISSION_REQUEST: 'permission_request',
  PERMISSION_RESOLVED: 'permission_resolved',
  GATE: 'gate',
  USAGE: 'usage',
  DONE: 'done',
  ERROR: 'error',
});

export const BuildStatus = Object.freeze({
  STARTING: 'starting',
  RUNNING: 'running',
  WAITING_INPUT: 'waiting_input',
  WAITING_PERMISSION: 'waiting_permission',
  INTERRUPTED: 'interrupted',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

export const ev = Object.freeze({
  status: (status, detail) => ({ type: EventTypes.STATUS, data: detail ? { status, detail } : { status } }),
  messageStart: (role = 'assistant') => ({ type: EventTypes.MESSAGE_START, data: { role } }),
  messageDelta: (text) => ({ type: EventTypes.MESSAGE_DELTA, data: { text } }),
  messageEnd: (text) => ({ type: EventTypes.MESSAGE_END, data: { text } }),
  toolStart: (id, name, detail) => ({ type: EventTypes.TOOL_START, data: { id, name, detail } }),
  toolOutput: (id, chunk) => ({ type: EventTypes.TOOL_OUTPUT, data: { id, chunk } }),
  toolEnd: (id, ok) => ({ type: EventTypes.TOOL_END, data: { id, ok } }),
  permissionRequest: (requestId, tool, input, suggestions) =>
    ({ type: EventTypes.PERMISSION_REQUEST, data: { requestId, tool, input, suggestions } }),
  permissionResolved: (requestId, behavior) =>
    ({ type: EventTypes.PERMISSION_RESOLVED, data: { requestId, behavior } }),
  gate: (question) => ({ type: EventTypes.GATE, data: { question } }),
  usage: (u) => ({ type: EventTypes.USAGE, data: u }),
  done: (reason, usage, url) => ({ type: EventTypes.DONE, data: { reason, usage, url } }),
  error: (message, fatal = false) => ({ type: EventTypes.ERROR, data: { message, fatal } }),
});

