// Client-side trace buffer. Events are recorded with a monotonic seq, batched,
// and flushed to the backend on a debounce. Unload is covered by sendBeacon so a
// closed tab still delivers what's queued. Re-sends are safe: the backend upserts
// on (session_id, seq).

import { eventsUrl, postEvents } from "@/lib/api";
import type { EventPayloads, EventType, TraceEventInput } from "@/types/trace";

const FLUSH_DEBOUNCE_MS = 1500;

export class TraceRecorder {
  private queue: TraceEventInput[] = [];
  private seq = 1; // seq 0 is the server-emitted session_started
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(private readonly sessionId: string) {}

  record<T extends EventType>(type: T, payload: EventPayloads[T]): void {
    this.queue.push({
      seq: this.seq++,
      client_ts: new Date().toISOString(),
      type,
      payload,
    });
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), FLUSH_DEBOUNCE_MS);
  }

  /** Send everything currently queued. Failed sends are re-queued for retry. */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flushing = true;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await postEvents(this.sessionId, batch);
    } catch {
      this.queue.unshift(...batch); // put them back; a later flush retries
    } finally {
      this.flushing = false;
    }
  }

  /** Best-effort delivery of the remaining queue when the tab is closing. */
  private beacon(): void {
    if (this.queue.length === 0 || typeof navigator.sendBeacon !== "function") return;
    const blob = new Blob([JSON.stringify({ events: this.queue })], {
      type: "application/json",
    });
    if (navigator.sendBeacon(eventsUrl(this.sessionId), blob)) {
      this.queue = [];
    }
  }

  /** Wire unload handlers; returns a cleanup function. */
  installUnloadHandlers(): () => void {
    const onHide = () => this.beacon();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }
}
