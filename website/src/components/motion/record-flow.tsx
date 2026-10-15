"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const stages = 7;

export function RecordFlow() {
  const reduced = useReducedMotion();
  const [live, setLive] = useState(0);
  const stage = reduced ? stages - 1 : live;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setLive((current) => (current + 1) % stages);
    }, 1100);
    return () => window.clearInterval(id);
  }, [reduced]);

  const showDoc = stage >= 2;
  const showSign = stage >= 3;
  const showDate = stage >= 4;
  const showName = stage >= 5;
  const showFile = stage >= 6;

  return (
    <div data-motion={reduced ? "reduced" : "loop"} className="rise">
      <p className="sr-only">
        A Salesforce record becomes a document. Signature, date, and name
        fields land on the page, then the file is stored.
      </p>
      <div className="grid items-center gap-4 md:grid-cols-[1fr_2.5rem_1fr]">
        <article
          className="surface-card p-5 transition-opacity duration-500"
          style={{ opacity: showDoc && !reduced ? 0.45 : 1 }}
        >
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Vendor Agreement
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#0b1b3a]">
            VAN-1044
          </p>
          <p
            className="mt-4 text-sm font-semibold text-[#2563eb] transition-opacity duration-500"
            style={{ opacity: stage >= 1 ? 1 : 0 }}
          >
            Master Services Agreement
          </p>
        </article>
        <div
          aria-hidden
          className="hidden h-px origin-left bg-[#2563eb] transition-transform duration-500 md:block"
          style={{ transform: stage >= 1 ? "scaleX(1)" : "scaleX(0)" }}
        />
        <article
          className="doc-surface relative min-h-56 p-5 transition-all duration-500"
          style={{
            opacity: showDoc ? 1 : 0.15,
            transform: showDoc ? "none" : "translateY(8px)",
          }}
        >
          <p className="text-lg font-bold tracking-[-0.02em] text-[#e2e8f0]">Master Services Agreement</p>
          <p className="mt-3 text-xs text-[#cbd5e1]">Northwind Logistics</p>
          <div className="mt-4 h-px bg-white/10" />
          <div className="mt-4 space-y-2">
            <div className="h-1.5 w-4/5 rounded bg-white/15" />
            <div className="h-1.5 w-3/5 rounded bg-white/15" />
          </div>
          <div className="mt-6 space-y-2">
            <Field show={showSign} label="Signature">
              <svg viewBox="0 0 160 36" className="h-7 w-28" aria-hidden>
                <path
                  d="M4 26 C 18 26, 16 8, 34 14 S 54 30, 72 16 S 98 6, 116 20 S 142 28, 156 10"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  style={{
                    strokeDasharray: 220,
                    strokeDashoffset: showSign ? 0 : 220,
                    transition: reduced ? "none" : "stroke-dashoffset 0.7s ease",
                  }}
                />
              </svg>
            </Field>
            <Field show={showDate} label="Date">
              <span className="text-xs font-medium">1 Oct 2026</span>
            </Field>
            <Field show={showName} label="Name">
              <span className="text-xs font-medium">Alex Chen</span>
            </Field>
          </div>
          <p
            className="mt-4 text-[11px] font-semibold text-[#7dd3fc] transition-opacity duration-500"
            style={{ opacity: showFile ? 1 : 0 }}
          >
            Salesforce Files
          </p>
        </article>
      </div>
    </div>
  );
}

function Field({
  show,
  label,
  children,
}: {
  show: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[5px] border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.11)] px-2 py-1.5 transition-all duration-500"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(-10px)",
      }}
    >
      <span className="text-[10px] font-semibold tracking-wide text-[#7dd3fc] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
