"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const fields = ["Signature", "Initial", "Date", "Text", "Checkbox", "Name", "Email"];

export function FieldBoard() {
  const reduced = useReducedMotion();
  const [live, setLive] = useState(0);
  const count = reduced ? fields.length : live;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setLive((current) => (current >= fields.length ? 0 : current + 1));
    }, 700);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div data-motion={reduced ? "reduced" : "loop"} className="rise grid gap-3 sm:grid-cols-2">
      <div className="doc-surface p-6">
        <p className="text-xl font-bold tracking-[-0.02em] text-[#e2e8f0]">Agreement</p>
        <div className="mt-4 space-y-2">
          <div className="h-1.5 w-full rounded bg-white/15" />
          <div className="h-1.5 w-4/5 rounded bg-white/15" />
          <div className="h-1.5 w-3/5 rounded bg-white/15" />
        </div>
        <div className="mt-8 space-y-2">
          {fields.slice(0, 3).map((field, index) => (
            <div
              key={field}
              className="rounded-[5px] border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.11)] px-3 py-2 text-xs font-semibold text-[#7dd3fc] transition-all duration-400"
              style={{
                opacity: count > index ? 1 : 0,
                transform: count > index ? "none" : "translateY(-8px)",
              }}
            >
              {field}
            </div>
          ))}
        </div>
      </div>
      <ul className="grid content-center gap-2">
        {fields.map((field, index) => (
          <li
            key={field}
            className="surface-card px-4 py-2.5 text-sm font-semibold transition-opacity duration-300"
            style={{ opacity: count > index ? 1 : 0.35 }}
          >
            {field}
          </li>
        ))}
      </ul>
    </div>
  );
}
