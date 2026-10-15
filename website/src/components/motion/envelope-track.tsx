"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const steps = ["Sent", "Viewed", "Signed", "Completed"] as const;

export function EnvelopeTrack() {
  const reduced = useReducedMotion();
  const [live, setLive] = useState(0);
  const index = reduced ? steps.length - 1 : live;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setLive((current) => (current + 1) % steps.length);
    }, 1200);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div data-motion={reduced ? "reduced" : "loop"} className="rise">
      <p className="sr-only">
        Envelope status moves from Sent to Viewed to Signed to Completed.
      </p>
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((step, stepIndex) => {
          const on = stepIndex <= index;
          const current = stepIndex === index;
          return (
            <li key={step} className="text-center">
              <div className="relative mb-3 h-1 rounded-full bg-[#e1eaf8]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[#2563eb] transition-all duration-500"
                  style={{ width: on ? "100%" : "0%" }}
                />
              </div>
              <span
                className={
                  current
                    ? "inline-flex rounded-full bg-[#2563eb] px-2.5 py-1 text-xs font-bold text-white transition-colors duration-500"
                    : on
                      ? "inline-flex rounded-full bg-[rgba(37,99,235,0.08)] px-2.5 py-1 text-xs font-semibold text-[#2563eb] transition-colors duration-500"
                      : "inline-flex rounded-full px-2.5 py-1 text-xs font-medium text-[#5a6a86] transition-colors duration-500"
                }
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
