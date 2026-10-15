"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const stages = 7;

export function LiveDocument() {
  const reduced = useReducedMotion();
  const [live, setLive] = useState(0);
  const stage = reduced ? stages - 1 : live;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setLive((current) => (current + 1) % stages);
    }, 1200);
    return () => window.clearInterval(id);
  }, [reduced]);

  const resolved = stage >= 2;
  const showSign = stage >= 3;
  const showDate = stage >= 4;
  const showName = stage >= 5;
  const showFile = stage >= 6;

  return (
    <div data-motion={reduced ? "reduced" : "loop"} className="rise">
      <p className="sr-only">
        A template resolves into a signed agreement and is stored in Salesforce
        Files.
      </p>
      <article className="doc-surface overflow-hidden">
        <div className="px-7 py-8 sm:px-9 sm:py-10">
          <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-4">
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[#cbd5e1]">
              AGREEMENT
            </p>
            <p className="font-mono text-[11px] tracking-[0.16em] text-[#cbd5e1]">
              {resolved ? "PDF" : "TEMPLATE"}
            </p>
          </div>
          <p className="mt-8 font-mono text-[11px] tracking-[0.14em] text-[#94a3b8] uppercase">
            Prepared for
          </p>
          <div className="mt-2 grid">
            <p
              className="col-start-1 row-start-1 font-mono text-sm font-semibold text-[#7dd3fc] transition-opacity duration-500"
              style={{ opacity: resolved ? 0 : 1 }}
            >
              {"{Account.Name}"}
            </p>
            <p
              className="col-start-1 row-start-1 text-[1.65rem] leading-none font-bold tracking-[-0.03em] text-[#e2e8f0] transition-opacity duration-500"
              style={{ opacity: resolved ? 1 : 0 }}
            >
              Northwind Logistics
            </p>
          </div>
          <div className="mt-8 grid">
            <p
              className="col-start-1 row-start-1 font-mono text-sm text-[#7dd3fc] transition-opacity duration-500"
              style={{ opacity: resolved ? 0 : 1 }}
            >
              {"{Agreement.Name}"} · {"{Agreement.Number}"}
            </p>
            <div
              className="col-start-1 row-start-1 transition-opacity duration-500"
              style={{ opacity: resolved ? 1 : 0 }}
            >
              <p className="text-xl font-bold tracking-[-0.02em] text-[#e2e8f0]">
                Master Services Agreement
              </p>
              <p className="mt-1 font-mono text-xs text-[#cbd5e1]">VAN-1044</p>
            </div>
          </div>
          <div className="mt-8 h-px bg-white/10" />
          <div className="mt-6 space-y-2.5">
            <SheetField show={showSign} label="Signature">
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
            </SheetField>
            <SheetField show={showDate} label="Date">
              <span className="text-sm font-semibold text-[#e2e8f0]">1 Oct 2026</span>
            </SheetField>
            <SheetField show={showName} label="Name">
              <span className="text-sm font-semibold text-[#e2e8f0]">Alex Chen</span>
            </SheetField>
          </div>
          <p
            className="mt-6 font-mono text-[11px] tracking-[0.16em] text-[#7dd3fc] uppercase transition-opacity duration-500"
            style={{ opacity: showFile ? 1 : 0 }}
          >
            Salesforce Files
          </p>
        </div>
      </article>
    </div>
  );
}

function SheetField({
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
      className="flex items-center justify-between gap-3 rounded-[5px] border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.11)] px-3 py-2 transition-all duration-500"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(-8px)",
      }}
    >
      <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[#7dd3fc] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
