"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const rows = [
  ["Format", "DOCX"],
  ["Object", "Vendor Agreement"],
  ["Merge fields", "{Account.Name}"],
  ["Related records", "Contacts"],
  ["Repeating tables", "Line items"],
  ["Conditional sections", "Included"],
] as const;

export function TemplateSheet() {
  const reduced = useReducedMotion();
  const [live, setLive] = useState(0);
  const index = reduced ? rows.length - 1 : live;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setLive((current) => (current + 1) % rows.length);
    }, 1100);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <article
      data-motion={reduced ? "reduced" : "loop"}
      className="doc-surface rise overflow-hidden"
    >
      <div className="px-7 py-8 sm:px-9">
        <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[#cbd5e1]">
          TEMPLATE
        </p>
        <h2 className="mt-5 text-3xl font-bold tracking-[-0.03em] text-[#e2e8f0]">
          Master Services Agreement
        </h2>
        <p className="mt-2 text-sm text-[#cbd5e1]">Preview · Salesforce Files</p>
        <ul className="mt-8 divide-y divide-white/10">
          {rows.map(([label, value], rowIndex) => {
            const on = reduced || rowIndex <= index;
            const current = !reduced && rowIndex === index;
            return (
              <li
                key={label}
                className="flex items-baseline justify-between gap-4 py-3 transition-opacity duration-500"
                style={{ opacity: on ? 1 : 0.28 }}
              >
                <span className="text-sm text-[#cbd5e1]">{label}</span>
                <span
                  className={
                    current
                      ? "rounded-[5px] border border-[rgba(56,189,248,0.32)] bg-[rgba(56,189,248,0.11)] px-1.5 font-mono text-sm font-semibold text-[#7dd3fc]"
                      : "font-mono text-sm text-[#e2e8f0]"
                  }
                >
                  {value}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
