"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const stages = ["Downloading", "Preparing pages", "Saving"] as const;

const detected = [
  { kind: "Signature line", who: "Tenant", color: "#2563eb" },
  { kind: "Form field · Date", who: "Tenant", color: "#2563eb" },
  { kind: "Checkbox", who: "Witness 1", color: "#0d9488" },
  { kind: "Signature line", who: "Employee", color: "#0f9d6b" },
] as const;

export function DocumentScene() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const beat = reduced ? 8 : tick;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((n) => (n >= 8 ? 8 : n + 1)), 700);
    return () => window.clearInterval(id);
  }, [reduced]);

  const stageIndex = Math.min(stages.length - 1, Math.floor(beat / 3));
  const progress = reduced ? 100 : Math.min(100, 18 + beat * 11);
  const found = Math.min(detected.length, Math.max(0, beat - 1));
  const barIn = beat >= 3;
  const hintIn = beat >= 4;
  const undoOn = beat === 5 || beat >= 7;
  const saved = beat >= 7;
  const selected = Math.min(detected.length - 1, Math.max(0, found - 1));

  return (
    <div data-motion={reduced ? "reduced" : "play"} className="mt-12">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="eyebrow eyebrow-muted">
          Upload · PDF · 100 pages · 50 MB
        </p>
        <p className="text-xs font-bold text-[#2563eb]">{saved ? "Saved" : stages[stageIndex]}</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e1eaf8]">
        <div
          className="h-full rounded-full bg-[#2563eb] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="rounded-2xl border border-[#e1eaf8] bg-white p-5 sm:p-6">
          <p className="text-xs font-semibold text-[#5a6a86]">VAN-1044 · uploaded PDF</p>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[#0b1b3a]">
            Detected on the page
          </h2>
          <ul className="mt-5 space-y-3">
            {detected.map((field, index) => {
              const on = found > index;
              const focus = on && index === selected;
              return (
                <li
                  key={`${field.who}-${field.kind}`}
                  className="relative rounded-xl px-4 py-3 transition-all duration-400"
                  style={{
                    opacity: on ? 1 : 0.28,
                    background: focus ? "rgba(37,99,235,0.08)" : "#f3f8ff",
                    outline: focus ? "2px solid #2563eb" : "1px solid transparent",
                  }}
                >
                  {focus ? (
                    <span className="absolute -top-1 -right-1 size-2.5 rounded-sm border border-[#2563eb] bg-white" />
                  ) : null}
                  <p className="text-sm font-bold text-[#0b1b3a]">{field.kind}</p>
                  <p className="mt-1 text-xs font-bold" style={{ color: field.color }}>
                    {field.who}
                  </p>
                </li>
              );
            })}
          </ul>
        </article>

        <aside className="space-y-3">
          <div
            className="rounded-2xl bg-white p-4 ring-1 ring-[#e1eaf8] transition-opacity duration-500"
            style={{ opacity: barIn ? 1 : 0.4 }}
          >
            <p className="text-xs font-bold text-[#0b1b3a]">Who fills what</p>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
              <div className="h-full" style={{ width: "46%", background: "#2563eb" }} />
              <div className="h-full" style={{ width: "32%", background: "#0d9488" }} />
              <div className="h-full" style={{ width: "22%", background: "#0f9d6b" }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-bold">
              <span style={{ color: "#2563eb" }}>Tenant</span>
              <span style={{ color: "#0d9488" }}>Witness 1</span>
              <span style={{ color: "#0f9d6b" }}>Employee</span>
            </div>
          </div>

          <div
            className="rounded-2xl bg-white p-4 ring-1 ring-[#e1eaf8] transition-all duration-500"
            style={{ opacity: hintIn ? 1 : 0, transform: hintIn ? "none" : "translateY(8px)" }}
          >
            <p className="text-xs font-bold text-[#0b1b3a]">Date</p>
            <p className="mt-1 text-xs text-[#5a6a86]">Example · 1 Oct 2026</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[rgba(37,99,235,0.1)] px-2.5 py-1 text-[11px] font-bold text-[#2563eb]">
                Agreement start
              </span>
              <span className="rounded-full bg-[rgba(37,99,235,0.1)] px-2.5 py-1 text-[11px] font-bold text-[#2563eb]">
                Today
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className="rounded-xl px-3 py-2 text-xs font-bold transition-colors duration-300"
              style={{
                background: undoOn ? "#2563eb" : "#f3f8ff",
                color: undoOn ? "#fff" : "#0b1b3a",
              }}
            >
              Undo · Ctrl+Z
            </span>
            <span className="rounded-xl bg-[#f3f8ff] px-3 py-2 text-xs font-bold text-[#0b1b3a]">Redo</span>
            <span className="rounded-xl bg-[#f3f8ff] px-3 py-2 text-xs font-bold text-[#0b1b3a]">Re-detect</span>
          </div>

          <p className="text-sm font-semibold text-[#0b1b3a]" style={{ opacity: saved ? 1 : 0.4 }}>
            {saved ? "Saved. Resume from the record, DocSign Home, or the document." : "Autosave"}
          </p>
        </aside>
      </div>
    </div>
  );
}
