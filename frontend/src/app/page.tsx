"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createSession } from "@/lib/api";

const TASK_ID = "v1-cart-discount";

export default function EntryPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { session_id } = await createSession({
        task_id: TASK_ID,
        candidate_name: name.trim(),
      });
      router.push(`/assessment/${session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session");
      setSubmitting(false);
    }
  }

  const ready = name.trim().length > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Engineering judgment assessment
        </h1>
        <p className="text-muted">
          A short, ~10-minute exercise. Next you&apos;ll see an untimed warm-up, then the
          task itself.
        </p>
      </div>

      <form
        onSubmit={start}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Lovelace"
            className="rounded-2xl border border-border bg-background px-3 py-2 font-normal outline-none focus:border-accent"
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={!ready || submitting}
          className="rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Starting…" : "Continue to warm-up"}
        </button>
      </form>
    </main>
  );
}
