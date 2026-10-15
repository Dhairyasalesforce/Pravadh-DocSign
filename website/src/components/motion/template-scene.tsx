"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const library = [
  ["Master Services Agreement", "Vendor Agreement"],
  ["Order Form", "Opportunity"],
  ["Resolution Letter", "Case"],
] as const;

const rows = [
  ["Implementation", "1"],
  ["Support", "12"],
] as const;

export function TemplateScene() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const beat = reduced ? 6 : tick;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((n) => (n >= 6 ? 6 : n + 1)), 800);
    return () => window.clearInterval(id);
  }, [reduced]);

  const nameIn = beat >= 1;
  const eachIn = beat >= 2;
  const rowCount = eachIn ? Math.min(rows.length, beat - 1) : 0;
  const showIf = beat >= 4;
  const previewReady = beat >= 5;

  return (
    <div
      data-motion={reduced ? "reduced" : "play"}
      className="mt-12 overflow-hidden rounded-2xl border border-[#e1eaf8] bg-white shadow-[var(--sh-lg)]"
    >
      <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-[#e1eaf8] bg-[#f3f8ff] p-4 lg:border-r lg:border-b-0">
          <p className="px-2 eyebrow eyebrow-muted">
            Any object
          </p>
          <ul className="mt-3 space-y-1">
            {library.map(([name, object]) => (
              <li key={name}>
                <div
                  className={
                    name.startsWith("Master")
                      ? "rounded-lg bg-white px-3 py-2.5 ring-1 ring-[#2563eb]"
                      : "rounded-lg px-3 py-2.5"
                  }
                >
                  <p className="text-sm font-bold text-[#0b1b3a]">{name}</p>
                  <p className="text-xs text-[#5a6a86]">{object}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-white px-3 py-3 ring-1 ring-[#e1eaf8]">
            <p className="text-[11px] font-bold tracking-[0.12em] text-[#5a6a86] uppercase">Blank merge fields</p>
            <p className="mt-2 font-mono text-xs text-[#2563eb]">{"{{Account.Owner.Email}}"}</p>
          </div>
        </aside>
        <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow eyebrow-muted">
                Live preview · VAN-1044
              </p>
              <p className="mt-1 text-sm text-[#5a6a86]">Northwind Logistics</p>
            </div>
            <p className="text-xs font-bold text-[#0b1b3a]">PDF or Word</p>
          </div>
          <article className="doc-surface mt-4 px-6 py-6">
            <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#cbd5e1]">TEMPLATE</p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#e2e8f0]">
              Master Services Agreement
            </h2>
            <p className="mt-4 grid text-sm">
              <span
                className="col-start-1 row-start-1 font-mono text-[#7dd3fc] transition-opacity duration-400"
                style={{ opacity: nameIn ? 0 : 1 }}
              >
                {"{{Account.Name}}"}
              </span>
              <span
                className="col-start-1 row-start-1 font-semibold text-[#e2e8f0] transition-opacity duration-400"
                style={{ opacity: nameIn ? 1 : 0 }}
              >
                Northwind Logistics
              </span>
            </p>
            <div className="mt-5 overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)]">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="font-mono text-[11px] text-[#7dd3fc]">{"{{#each}}"}</span>
                <span className="text-[11px] text-[#94a3b8]">One row per related record</span>
              </div>
              {rows.map((row, index) => (
                <div
                  key={row[0]}
                  className="grid grid-cols-2 border-t border-[rgba(255,255,255,0.08)] px-3 py-2 text-sm transition-all duration-400"
                  style={{ opacity: rowCount > index ? 1 : 0, maxHeight: rowCount > index ? 40 : 0, paddingTop: rowCount > index ? 8 : 0, paddingBottom: rowCount > index ? 8 : 0 }}
                >
                  <span>{row[0]}</span>
                  <span className="text-right font-semibold">{row[1]}</span>
                </div>
              ))}
            </div>
            <p
              className="mt-4 text-sm transition-all duration-500"
              style={{ opacity: showIf ? 1 : 0.35 }}
            >
              <span className="font-mono text-[#7dd3fc]">{"{{#if}}"}</span>{" "}
              <span className="text-[#e2e8f0]">{showIf ? "Term is on the record." : "Hidden until the condition is true."}</span>
            </p>
          </article>
          <p
            className="mt-4 text-sm font-semibold text-[#0f9d6b] transition-opacity duration-500"
            style={{ opacity: previewReady ? 1 : 0 }}
          >
            Saved to Salesforce Files, on the source record.
          </p>
          <p className="mt-2 text-xs text-[#5a6a86]">
            Parent fields to five levels. Currency, dates, numbers. Today, current user, company name. Images.
          </p>
        </div>
      </div>
    </div>
  );
}
