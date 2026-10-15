"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const statuses = [
  "Draft",
  "Sent",
  "Viewed",
  "Partially Signed",
  "Completed",
  "Declined",
  "Expired",
  "Cancelled",
] as const;

const chain = ["Sent", "Viewed", "Signed"] as const;

export function EnvelopeScene() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const beat = reduced ? 6 : tick;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((n) => (n >= 6 ? 6 : n + 1)), 800);
    return () => window.clearInterval(id);
  }, [reduced]);

  const focusDate = beat >= 1;
  const typed = beat >= 2;
  const status =
    beat >= 6 ? "Completed" : beat >= 4 ? "Partially Signed" : beat >= 3 ? "Viewed" : "Sent";
  const sealed = beat >= 5;
  const chainOn = sealed ? chain.length : Math.min(chain.length, Math.max(0, beat - 2));

  return (
    <div data-motion={reduced ? "reduced" : "play"} className="mt-12 space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#e1eaf8] bg-white shadow-[var(--sh-lg)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#e1eaf8] px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-[#5a6a86]">Signing page</p>
              <p className="text-lg font-bold tracking-[-0.03em] text-[#0b1b3a]">Tenant</p>
            </div>
            <span className="rounded-full bg-[rgba(37,99,235,0.1)] px-3 py-1 text-xs font-bold text-[#2563eb]">
              {status}
            </span>
          </div>
          <div className="space-y-3 p-5">
            <div
              className="rounded-xl px-4 py-3 transition-all duration-300"
              style={{
                background: focusDate ? "#f3f8ff" : "rgba(37,99,235,0.1)",
                outline: focusDate ? "1px solid transparent" : "2px solid #2563eb",
              }}
            >
              <p className="text-[11px] font-bold text-[#2563eb]">Tenant</p>
              <div className="mt-2 flex h-14 items-end">
                {typed ? (
                  <p className="text-2xl font-bold tracking-[-0.03em] text-[#0b1b3a] italic">Tenant</p>
                ) : (
                  <svg viewBox="0 0 160 48" className="h-12 w-40" aria-hidden>
                    <path
                      d="M4 32 C 20 8, 28 10, 40 28 S 62 40, 78 18 S 110 6, 150 26"
                      fill="none"
                      stroke="#0b1b3a"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>
            </div>
            <div
              className="rounded-xl px-4 py-3 transition-all duration-300"
              style={{
                background: focusDate ? "rgba(37,99,235,0.1)" : "#f3f8ff",
                outline: focusDate ? "2px solid #2563eb" : "1px solid transparent",
              }}
            >
              <p className="text-[11px] font-bold text-[#2563eb]">Tenant · Date</p>
              <p className="mt-2 text-sm font-semibold text-[#0b1b3a]">1 Oct 2026</p>
            </div>
            <div className="rounded-xl bg-[rgba(15,23,42,0.04)] px-4 py-3 text-[#5a6a86]">
              <p className="text-[11px] font-bold">Witness 1</p>
              <p className="mt-2 text-sm">Signature</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded-xl bg-[#2563eb] px-3 py-2 text-xs font-bold text-white">
                Go to my next field
              </span>
              <span
                className="rounded-xl px-3 py-2 text-xs font-bold"
                style={{
                  background: typed ? "#f3f8ff" : "#0b1b3a",
                  color: typed ? "#0b1b3a" : "#fff",
                }}
              >
                Draw
              </span>
              <span
                className="rounded-xl px-3 py-2 text-xs font-bold"
                style={{
                  background: typed ? "#0b1b3a" : "#f3f8ff",
                  color: typed ? "#fff" : "#0b1b3a",
                }}
              >
                Type
              </span>
              <span className="rounded-xl px-3 py-2 text-xs font-bold text-[#0b1b3a] ring-1 ring-[rgba(15,23,42,0.16)]">
                Decline
              </span>
            </div>
          </div>
          <p className="border-t border-[#e1eaf8] px-5 py-3 text-xs text-[#5a6a86]">
            Single-use link. Optional access code. Expiry and reminders. No Salesforce licence.
          </p>
        </section>

        <section
          className="rounded-2xl border border-[#e1eaf8] bg-white p-5 transition-all duration-500 sm:p-6"
          style={{ opacity: sealed ? 1 : 0.55, transform: sealed ? "none" : "translateY(8px)" }}
        >
          <p className="eyebrow">
            Certificate of Completion
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[#0b1b3a]">ENV-2041</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[
              ["Signer", "Tenant"],
              ["Timeline", "Recorded"],
              ["IP address", "Recorded"],
              ["Device", "Recorded"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-[#5a6a86]">{label}</dt>
                <dd className="font-bold text-[#0b1b3a]">{value}</dd>
              </div>
            ))}
          </dl>
          <ol className="mt-5 space-y-2">
            {chain.map((event, index) => {
              const on = chainOn > index;
              return (
                <li key={event} className="flex items-center gap-3">
                  <span
                    className="size-2.5 rounded-full transition-colors duration-300"
                    style={{ background: on ? "#0f9d6b" : "rgba(15,23,42,0.16)" }}
                  />
                  <span className="text-sm font-semibold text-[#0b1b3a]">{event}</span>
                  <span className="font-mono text-[11px] text-[#5a6a86]">{on ? "SHA-256" : ""}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-sm font-semibold text-[#0f9d6b]">
            {sealed ? "Chain re-checked on this view." : "Each event is chained."}
          </p>
          <p className="mt-2 text-xs text-[#5a6a86]">
            The trail cannot be edited or deleted. A change would break the chain.
          </p>
          <p className="mt-4 text-sm font-bold text-[#0b1b3a]">Signed PDF · fingerprint in Files</p>
          <p className="mt-1 text-xs text-[#5a6a86]">Original upload kept. Completion email attaches both files.</p>
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        {statuses.map((item) => {
          const on = item === status;
          return (
            <span
              key={item}
              className="rounded-full px-3 py-1 text-xs font-bold transition-colors duration-300"
              style={{
                background: on ? "#2563eb" : "#fff",
                color: on ? "#fff" : "#5a6a86",
                boxShadow: on ? "none" : "inset 0 0 0 1px #e1eaf8",
              }}
            >
              {item}
            </span>
          );
        })}
      </div>
      <div className="flex gap-2">
        <span className="rounded-xl bg-[#f3f8ff] px-3 py-2 text-xs font-bold text-[#0b1b3a]">Resend</span>
        <span className="rounded-xl bg-[#f3f8ff] px-3 py-2 text-xs font-bold text-[#0b1b3a]">Cancel</span>
        <span className="rounded-xl bg-[#f3f8ff] px-3 py-2 text-xs font-bold text-[#0b1b3a]">In order</span>
        <span className="rounded-xl px-3 py-2 text-xs font-semibold text-[#5a6a86]">All at once</span>
      </div>
    </div>
  );
}
