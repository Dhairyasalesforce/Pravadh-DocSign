"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const actions = ["Generate", "Send", "Get status", "Cancel", "Resend"];

export function ActionCycle() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % actions.length);
    }, 1100);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <ol data-motion={reduced ? "reduced" : "loop"} className="rise grid gap-2 sm:grid-cols-5">
      {actions.map((action, actionIndex) => (
        <li
          key={action}
          className={
            !reduced && actionIndex === index
              ? "rounded-xl bg-[#2563eb] px-3 py-6 text-center text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(37,99,235,0.18)] transition-colors duration-500"
              : "surface-card px-3 py-6 text-center text-sm font-semibold text-[#33425f] transition-colors duration-500"
          }
        >
          {action}
        </li>
      ))}
    </ol>
  );
}
