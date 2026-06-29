"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  durationMs: number;
  onExpire: () => void;
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Timer({ durationMs, onExpire }: TimerProps) {
  const [deadline] = useState(() => Date.now() + durationMs);
  const [remaining, setRemaining] = useState(durationMs);

  useEffect(() => {
    const id = setInterval(() => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        onExpire();
      }
    }, 250);
    return () => clearInterval(id);
  }, [deadline, onExpire]);

  const danger = remaining <= 60_000;
  return (
    <div
      className={`font-mono text-2xl tabular-nums ${danger ? "text-danger" : "text-foreground"}`}
      aria-label="time remaining"
    >
      {fmt(remaining)}
    </div>
  );
}
