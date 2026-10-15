"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const rows = [
  { label: "External signing", value: "On" },
  { label: "Sender address", value: "Org-wide email" },
  { label: "Reminders", value: "On" },
] as const;

export function SettingsBoard() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const armed = reduced ? rows.length : Math.min(rows.length, step);
  const focus = !reduced && step >= rows.length ? step % rows.length : -1;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setStep((current) => current + 1);
    }, 900);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div data-motion={reduced ? "reduced" : "loop"} className="rise space-y-3">
      {rows.map((row, index) => {
        const on = armed > index;
        return (
          <div
            key={row.label}
            className={
              focus === index
                ? "surface-card flex items-center justify-between gap-4 px-5 py-5 ring-2 ring-[#2563eb]"
                : "surface-card flex items-center justify-between gap-4 px-5 py-5"
            }
          >
            <div>
              <p className="text-base font-bold tracking-[-0.02em] text-[#0b1b3a]">{row.label}</p>
              <p
                className="mt-1 text-sm text-muted-foreground transition-opacity duration-500"
                style={{ opacity: on ? 1 : 0 }}
              >
                {row.value}
              </p>
            </div>
            <span
              aria-hidden
              className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-500"
              style={{ background: on ? "#2563eb" : "rgba(15, 23, 42, 0.12)" }}
            >
              <span
                className="absolute top-1 left-1 size-5 rounded-full bg-white transition-transform duration-500"
                style={{ transform: on ? "translateX(20px)" : "none" }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
