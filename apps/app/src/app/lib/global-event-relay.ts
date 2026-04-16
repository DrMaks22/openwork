import type { Event } from "@opencode-ai/sdk/v2/client";

type QueuedEvent = {
  directory: string;
  payload: Event;
};

type EmitEvent = (directory: string, payload: Event) => void;

export function globalEventRelayKey(directory: string, payload: Event) {
  if (payload.type === "session.status") {
    return `session.status:${directory}:${payload.properties.sessionID}`;
  }
  if (payload.type === "lsp.updated") {
    return `lsp.updated:${directory}`;
  }
  if (payload.type === "todo.updated") {
    return `todo.updated:${directory}:${payload.properties.sessionID}`;
  }
  if (payload.type === "mcp.tools.changed") {
    return `mcp.tools.changed:${directory}:${payload.properties.server}`;
  }
  if (payload.type === "message.part.updated") {
    const part = payload.properties.part;
    return `message.part.updated:${directory}:${part.messageID}:${part.id}`;
  }
}

export function createBufferedGlobalEventRelay(emitEvent: EmitEvent) {
  let queue: Array<QueuedEvent | undefined> = [];
  const coalesced = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastFlushAt = 0;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;

    const events = queue;
    queue = [];
    coalesced.clear();
    if (events.length === 0) return;

    lastFlushAt = Date.now();
    for (const entry of events) {
      if (!entry) continue;
      emitEvent(entry.directory, entry.payload);
    }
  };

  const schedule = () => {
    if (timer) return;
    const elapsed = Date.now() - lastFlushAt;
    timer = setTimeout(flush, Math.max(0, 16 - elapsed));
  };

  return {
    push(directory: string, payload: Event) {
      const key = globalEventRelayKey(directory, payload);
      if (key) {
        const index = coalesced.get(key);
        if (index !== undefined) {
          queue[index] = undefined;
        }
        coalesced.set(key, queue.length);
      }

      queue.push({ directory, payload });
      schedule();
    },
    stop() {
      flush();
    },
  };
}
