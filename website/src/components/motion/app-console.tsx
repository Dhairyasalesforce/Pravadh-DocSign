"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mark } from "@/components/brand-mark";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const tabs = [
  "DocSign Home",
  "Templates",
  "DocSign Documents",
  "DocSign Envelopes",
  "DocSign Settings",
];

const metrics = [
  ["Documents Created", 18],
  ["Documents Sent", 11],
  ["Awaiting Signature", 4],
  ["Completed", 7],
  ["Expired", 1],
  ["Declined", 1],
] as const;

const statuses = ["Sent", "Viewed", "Signed", "Completed"] as const;

const setup = [
  { label: "Create a template", href: "/templates" },
  { label: "Enable external signing", href: "/settings" },
  { label: "Choose a sender address", href: "/settings" },
  { label: "Turn on reminders", href: "/settings" },
];

export function AppConsole() {
  const reduced = useReducedMotion();
  const [counts, setCounts] = useState<number[]>(metrics.map(() => 0));
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const duration = 1400;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setCounts(metrics.map(([, value]) => Math.round(value * eased)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setStatusIndex((current) => (current + 1) % statuses.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, [reduced]);

  const shown = reduced ? metrics.map(([, value]) => value) : counts;
  const status = statuses[reduced ? statuses.length - 1 : statusIndex];

  return (
    <div
      data-motion={reduced ? "reduced" : "loop"}
      className="surface-card overflow-hidden shadow-[0_24px_48px_-16px_rgba(15,23,42,0.18)]"
    >
      <div className="flex items-center gap-2 border-b border-line bg-white px-3 py-2.5">
        <Mark size={26} />
        <span className="text-sm font-semibold">Pravadh DocSign</span>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line bg-white px-2">
        {tabs.map((tab) => (
          <span
            key={tab}
            className={
              tab === "DocSign Home"
                ? "shrink-0 border-b-2 border-[#2563eb] px-3 py-2.5 text-xs font-bold text-[#2563eb]"
                : "shrink-0 px-3 py-2.5 text-xs font-medium text-muted-foreground"
            }
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map(([label], index) => (
            <div key={label} className="rounded-lg bg-white px-3 py-3 ring-1 ring-line">
              <p className="text-2xl font-bold tracking-[-0.04em] text-[#2563eb] tabular-nums">
                {shown[index]}
              </p>
              <p className="mt-1 text-[11px] leading-snug font-medium text-muted-foreground">
                {label}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-line">
          <h2 className="text-sm font-semibold">Recent envelopes</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            No envelopes yet. Add the Pravadh DocSign component to any record
            page.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="text-sm font-semibold">ENV-2041</p>
              <p className="text-xs text-muted-foreground">
                Master Services Agreement
              </p>
            </div>
            <span className="rounded-full bg-[#2563eb] px-2.5 py-1 text-xs font-bold text-white">
              {status}
            </span>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="rounded-xl bg-white p-4 ring-1 ring-line">
            <h2 className="text-sm font-semibold">Get started</h2>
            <ol className="mt-3 space-y-1">
              {setup.map((step, index) => (
                <li key={step.label}>
                  <Link
                    href={step.href}
                    className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-mist"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[rgba(37,99,235,0.08)] font-mono text-[11px] font-semibold text-[#2563eb]">
                      {index + 1}
                    </span>
                    {step.label}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["Generate", "Any object. Sequential or parallel."],
              ["Automate", "Flow actions and platform events."],
              ["Store", "Salesforce Files and audit trail."],
            ].map(([title, line]) => (
              <article key={title} className="rounded-xl bg-white p-4 ring-1 ring-line">
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {line}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
