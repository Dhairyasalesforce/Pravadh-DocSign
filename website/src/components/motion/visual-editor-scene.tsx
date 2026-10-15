"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

// A looping walkthrough of the visual template editor: fields are clicked in the tray,
// land on the page as chips, a row repeats per product, a condition appears, signers are placed.
const tray = [
  { badge: "Aa", label: "Account Name", api: "Account.Name" },
  { badge: "$", label: "Amount", api: "Amount" },
  { badge: "Date", label: "Close Date", api: "CloseDate" },
  { badge: "↓", label: "Products", api: "OpportunityLineItems" },
] as const;

const steps = [
  "Click a field. It lands on the page as a chip.",
  "Pick a format. Currency, dates and numbers come from the field type.",
  "Open a related list and insert a table. The row repeats for each record.",
  "Add Show if… to print a section only when a field matches.",
  "Place signer fields. Each signer gets a colour.",
] as const;

const LAST = 6;

function Chip({ path, fmt, on = true }: { path: string; fmt?: string; on?: boolean }) {
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-[5px] border border-[#c3cff6] bg-[#eaf0ff] px-1.5 font-mono text-[11.5px] font-medium leading-[1.6] text-[#1d3596] transition-all duration-500"
      style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(-4px)" }}
    >
      {path}
      {fmt && <span className="rounded-[3px] bg-[#4b63c7] px-1 font-sans text-[9.5px] font-bold text-white">{fmt}</span>}
    </span>
  );
}

function SignBox({ who, what, tone, on }: { who: string; what: string; tone: "amber" | "teal"; on: boolean }) {
  const c = tone === "amber" ? "border-[#b45309] bg-[#fff4e5] text-[#b45309]" : "border-[#0f766e] bg-[#e6f6f3] text-[#0f766e]";
  return (
    <div
      className={`rounded-[5px] border-[1.5px] border-dashed px-2.5 pt-1 pb-1.5 transition-all duration-500 ${c}`}
      style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(6px)" }}
    >
      <p className="text-[9px] font-bold tracking-[0.08em] uppercase">{who}</p>
      <p className="text-[11.5px] font-medium text-[#1b2333]">{what}</p>
    </div>
  );
}

export function VisualEditorScene() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const beat = reduced ? LAST : tick;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((n) => (n >= LAST + 2 ? 0 : n + 1)), 1400);
    return () => window.clearInterval(id);
  }, [reduced]);

  const shown = Math.min(beat, LAST);
  const active = shown === 0 ? -1 : shown <= 2 ? shown - 1 : shown === 3 ? 3 : -1;
  const step = Math.max(0, Math.min(steps.length - 1, shown - 1));
  const inspector =
    shown <= 1
      ? { eyebrow: "Merge field", title: "Account Name", rows: [["Format", "As stored"], ["If empty", "Nothing"]] }
      : shown === 2
        ? { eyebrow: "Merge field", title: "Amount", rows: [["Format", "Currency"], ["Sample", "$48,562.50"]] }
        : shown === 3
          ? { eyebrow: "Table row", title: "Repeats for each product", rows: [["Related list", "OpportunityLineItems"], ["Sort by", "SortOrder"]] }
          : shown === 4
            ? { eyebrow: "Show if", title: "Conditional content", rows: [["When", "Amount > 40000"], ["Sample", "Shown"]] }
            : { eyebrow: "PDF check", title: "Ready to send", rows: [["Layout", "Renders in Salesforce"], ["Signers", "2, each with a signature"]] };

  return (
    <section aria-labelledby="visual-editor-title" className="mt-20">
      <div className="max-w-2xl">
        <p className="eyebrow">New in DocSign 1.0</p>
        <h2 id="visual-editor-title" className="mt-4 text-[clamp(1.6rem,3vw,2.25rem)] font-bold tracking-[-0.03em] text-[#0b1b3a]">
          Build templates visually. No HTML needed.
        </h2>
        <p className="mt-3 text-base leading-relaxed text-[#5a6a86]">
          The template editor now has a visual mode. Pick fields from your own objects, drop in repeating tables and
          conditions, and place signer fields on a real A4 page. It saves the same DocSign template underneath, so you can
          switch to HTML at any time.
        </p>
      </div>

      <div
        data-motion={reduced ? "reduced" : "loop"}
        className="mt-8 overflow-hidden rounded-2xl border border-[#e1eaf8] bg-white shadow-[var(--sh-lg)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1eaf8] bg-[#f7f9fc] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-[#5a6a86]">
            <span className="font-semibold text-[#0b1b3a]">Sales Quote</span>
            <span aria-hidden>·</span>
            <span>Opportunity</span>
          </div>
          <div className="inline-flex rounded-md border border-[#e1eaf8] bg-white p-0.5 text-xs font-semibold">
            <span className="rounded bg-[#2563eb] px-2.5 py-1 text-white">Visual</span>
            <span className="px-2.5 py-1 text-[#5a6a86]">HTML</span>
          </div>
        </div>

        <div className="grid md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[210px_minmax(0,1fr)_230px]">
          <aside className="hidden border-r border-[#e1eaf8] bg-[#f7f9fc] p-3 md:block">
            <p className="px-1 text-[10.5px] font-bold tracking-[0.1em] text-[#5a6a86] uppercase">Fields</p>
            <ul className="mt-2 space-y-1">
              {tray.map((f, i) => (
                <li
                  key={f.api}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-300 ${
                    active === i ? "bg-white ring-1 ring-[#2563eb]" : ""
                  }`}
                >
                  <span
                    className={`grid h-6 w-8 shrink-0 place-items-center rounded-[5px] text-[10px] font-bold ${
                      f.badge === "↓" ? "bg-[#f1ecfd] text-[#6d4ac9]" : "bg-[#e5eafb] text-[#2440b3]"
                    }`}
                  >
                    {f.badge}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-[#0b1b3a]">{f.label}</span>
                    <span className="block truncate font-mono text-[10.5px] text-[#5a6a86]">{f.api}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 px-1 text-[10.5px] font-bold tracking-[0.1em] text-[#5a6a86] uppercase">Signers</p>
            <div className="mt-2 flex flex-wrap gap-1.5 px-1">
              <span className="rounded-[5px] border border-dashed border-[#b45309] bg-[#fff4e5] px-2 py-0.5 text-[11px] font-medium text-[#b45309]">Signer 1</span>
              <span className="rounded-[5px] border border-dashed border-[#0f766e] bg-[#e6f6f3] px-2 py-0.5 text-[11px] font-medium text-[#0f766e]">Signer 2</span>
            </div>
          </aside>

          <div className="min-w-0 bg-[#e7eaf1] p-3 sm:p-5">
            <div className="mx-auto max-w-[560px] rounded-sm bg-white px-5 py-6 text-[#1b2333] shadow-[0_1px_2px_rgba(20,30,60,0.08),0_8px_28px_rgba(20,30,60,0.1)] sm:px-8 sm:py-8">
              <p className="text-xl font-bold tracking-[-0.01em]">Quotation</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-1 text-[13px]">
                Prepared for <Chip path="Account.Name" on={shown >= 1} />
              </p>
              <p className="mt-1 flex flex-wrap items-baseline gap-1 text-[13px]">
                Total <Chip path="Amount" fmt="$" on={shown >= 2} />
              </p>

              <div
                className="mt-4 overflow-x-auto transition-opacity duration-500"
                style={{ opacity: shown >= 3 ? 1 : 0.25 }}
              >
                <table className="w-full min-w-[300px] border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#eef1f6]">
                      <th className="border border-[#c9ced8] px-2 py-1 text-left font-bold">Product</th>
                      <th className="border border-[#c9ced8] px-2 py-1 text-right font-bold">Qty</th>
                      <th className="border border-[#c9ced8] px-2 py-1 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-[#f4f6ff]">
                      <td className="border border-[#c9ced8] px-2 py-1 shadow-[inset_3px_0_0_#2440b3]">
                        <Chip path="Product2.Name" on={shown >= 3} />
                      </td>
                      <td className="border border-[#c9ced8] px-2 py-1 text-right">
                        <Chip path="Quantity" on={shown >= 3} />
                      </td>
                      <td className="border border-[#c9ced8] px-2 py-1 text-right">
                        <Chip path="TotalPrice" fmt="$" on={shown >= 3} />
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1 text-[10.5px] font-semibold text-[#2440b3]">↻ Repeats for each product</p>
              </div>

              <div
                className="mt-4 rounded-md border border-[#ddd0fb] border-l-[3px] border-l-[#6d4ac9] bg-[#f7f3ff] px-3 pt-2 pb-2 transition-all duration-500"
                style={{ opacity: shown >= 4 ? 1 : 0, transform: shown >= 4 ? "none" : "translateY(6px)" }}
              >
                <p className="font-mono text-[10.5px] text-[#5b38b5]">Show if Amount &gt; 40000</p>
                <p className="mt-1 text-[12.5px]">Includes a named onboarding manager for 90 days.</p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <SignBox who="Signer 1" what="✍ Signature" tone="amber" on={shown >= 5} />
                  <SignBox who="Signer 1" what="Date signed" tone="amber" on={shown >= 5} />
                </div>
                <div className="space-y-1.5">
                  <SignBox who="Signer 2" what="✍ Signature" tone="teal" on={shown >= 5} />
                  <SignBox who="Signer 2" what="Date signed" tone="teal" on={shown >= 5} />
                </div>
              </div>
            </div>
          </div>

          <aside className="hidden border-l border-[#e1eaf8] bg-[#f7f9fc] p-4 lg:block">
            <p className="text-[10.5px] font-bold tracking-[0.1em] text-[#5a6a86] uppercase">{inspector.eyebrow}</p>
            <p className="mt-1 text-[15px] font-bold text-[#0b1b3a]">{inspector.title}</p>
            <dl className="mt-3 space-y-2">
              {inspector.rows.map(([k, v]) => (
                <div key={k} className="rounded-lg border border-[#e1eaf8] bg-white px-3 py-2">
                  <dt className="text-[10.5px] text-[#5a6a86]">{k}</dt>
                  <dd className="truncate text-[12.5px] font-semibold text-[#0b1b3a]">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>

        <p className="border-t border-[#e1eaf8] px-4 py-3 text-sm text-[#0b1b3a]" aria-live="off">
          <span className="mr-2 font-mono text-xs text-[#2563eb]">
            {step + 1}/{steps.length}
          </span>
          {steps[step]}
        </p>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Your fields, live", "The field list comes from your org: any standard or custom object, parent records up to five levels, and related lists."],
          ["Logic you can see", "Repeating rows and Show if… blocks are boxes on the page, not tags you have to type and close."],
          ["Checked before you send", "The editor flags layout the Salesforce PDF renderer can’t draw and signers with no signature field."],
          ["HTML when you want it", "Switch any template to HTML. Existing templates keep working, and you can convert them when you’re ready."],
        ].map(([t, d]) => (
          <li key={t} className="surface-card p-5">
            <p className="text-[15px] font-bold text-[#0b1b3a]">{t}</p>
            <p className="mt-2 text-sm leading-relaxed text-[#5a6a86]">{d}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
