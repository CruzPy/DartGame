// SSE endpoint helper: replays the persisted event log from ?since (or
// Last-Event-ID), then streams live events. One global heartbeat keeps
// long-idle connections (tens-of-minutes builds) alive through proxies.
const clients = new Set();

setInterval(() => {
  for (const res of clients) {
    try { res.write(':hb\n\n'); } catch { clients.delete(res); }
  }
}, 15_000).unref();

function writeEvent(res, envelope) {
  res.write(`id: ${envelope.seq}\nevent: ${envelope.type}\ndata: ${JSON.stringify(envelope)}\n\n`);
}

export function handleSse(req, res, { manager, buildId }) {
  const url = new URL(req.url, 'http://localhost');
  const sinceParam = url.searchParams.get('since');
  const lastEventId = req.headers['last-event-id'];
  // Last-Event-ID wins: EventSource re-requests the SAME url (?since=0) on
  // every transport reconnect, and only the header carries the real position —
  // preferring the query param would re-replay the whole transcript.
  const since = lastEventId != null ? Number(lastEventId) || 0
    : sinceParam !== null ? Number(sinceParam) || 0
    : 0;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':connected\n\n');

  for (const envelope of manager.getEvents(buildId, since)) writeEvent(res, envelope);

  const unsubscribe = manager.subscribe(buildId, (envelope) => {
    try { writeEvent(res, envelope); } catch { /* dropped */ }
  });
  clients.add(res);

  req.on('close', () => {
    unsubscribe();
    clients.delete(res);
  });
}
