// Mirror of the backend TaskManifest (app/models/trace.py).

export interface TaskManifest {
  task_id: string;
  prompt: string; // TASK.md
  agent_note: string; // AGENT_NOTE.md
  files: Record<string, string>; // { sandboxPath: content }, e.g. "src/cart.ts"
  entry: string; // path to open first
}
