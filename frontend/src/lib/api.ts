// Thin client for the FastAPI backend. All trace data flows through here —
// the frontend never talks to Supabase directly in v1.

import type { TaskManifest } from "@/types/task";
import type { TraceEventInput } from "@/types/trace";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchTask(taskId: string): Promise<TaskManifest> {
  return json(await fetch(`${API_URL}/api/v1/tasks/${taskId}`));
}

export async function createSession(input: {
  task_id: string;
  candidate_name: string;
}): Promise<{ session_id: string }> {
  // Time out so a stopped backend surfaces a clear error instead of a frozen
  // "Starting…" button.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    return await json(
      await fetch(`${API_URL}/api/v1/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: ac.signal,
      }),
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`Couldn't reach the backend at ${API_URL}. Is it running?`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function eventsUrl(sessionId: string): string {
  return `${API_URL}/api/v1/sessions/${sessionId}/events`;
}

export async function postEvents(
  sessionId: string,
  events: TraceEventInput[],
): Promise<void> {
  await json(
    await fetch(eventsUrl(sessionId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
    }),
  );
}
