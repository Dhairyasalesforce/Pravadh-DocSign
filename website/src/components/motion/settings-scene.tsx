"use client";

import { useEffect, useState } from "react";
import { ReviewLink } from "@/components/action-links";
import { PartnerLockup } from "@/components/partner-lockup";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const rows = [
  ["Signing Site URL", "Salesforce Site"],
  ["Sender email", "Set"],
  ["Expiry", "Default"],
  ["Reminders", "Default"],
  ["Branding and consent", "Shown to signers"],
  ["AI status", "Agentforce, when available"],
] as const;

export function SettingsScene() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const beat = reduced ? rows.length : tick;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((n) => (n >= rows.length ? rows.length : n + 1)), 650);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div data-motion={reduced ? "reduced" : "play"} className="mx-auto mt-12 max-w-xl">
      <form className="divide-y divide-[#e1eaf8] overflow-hidden rounded-2xl border border-[#e1eaf8] bg-white">
        {rows.map(([label, detail], index) => {
          const on = beat > index;
          return (
            <div key={label} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-base font-bold tracking-[-0.02em] text-[#0b1b3a]">{label}</p>
                <p
                  className="mt-1 text-sm text-[#2563eb] transition-opacity duration-500"
                  style={{ opacity: on ? 1 : 0 }}
                >
                  {detail}
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
      </form>
      <p className="mt-4 text-sm text-[#5a6a86]">Other AI providers can extend it.</p>
      <div className="mt-10 space-y-3 text-sm leading-relaxed text-[#33425f]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PartnerLockup />
          <ReviewLink />
        </div>
        <p>Pravadh Labs is a Salesforce ISV Partner.</p>
        <p className="font-bold text-[#0b1b3a]">100% free.</p>
        <p className="font-bold">There is no paid tier.</p>
      </div>
    </div>
  );
}
