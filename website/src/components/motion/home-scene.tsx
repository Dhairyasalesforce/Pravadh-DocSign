"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mark } from "@/components/brand-mark";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const metrics = [
  ["Documents Created", 128],
  ["Documents Sent", 86],
  ["Awaiting Signature", 14],
  ["Completed", 72],
  ["Expired", 3],
  ["Declined", 2],
] as const;

const setup = [
  { label: "Signing Site URL", href: "/settings" },
  { label: "Sender email", href: "/settings" },
  { label: "Expiry and reminders", href: "/settings" },
  { label: "Branding and consent", href: "/settings" },
];

const flowActions = [
  "Generate Document",
  "Send for Signature",
  "Get Signature Status",
  "Cancel",
  "Resend",
];

const recordActions = ["Generate", "Upload", "Prepare", "Send", "Track"];

const compare = [
  ["The product", "Paid", "Free and open source"],
  ["Signing", "Outside Salesforce", "A Salesforce Site page"],
  ["Document tools", "S-Docs, Conga, and Nintex", "Generate and eSign, one app"],
] as const;

export function HomeScene() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [recordBeat, setRecordBeat] = useState(0);
  const beat = reduced ? 8 : tick;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((n) => (n >= 8 ? 8 : n + 1)), 700);
    return () => window.clearInterval(id);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setRecordBeat((n) => (n + 1) % recordActions.length), 1400);
    return () => window.clearInterval(id);
  }, [reduced]);

  const progress = reduced ? 1 : Math.min(1, beat / 4);
  const counts = metrics.map(([, value]) => Math.round(value * progress));
  const envelopeIn = beat >= 3;
  const checks = Math.min(setup.length, Math.max(0, beat - 2));
  const flowOn = Math.min(flowActions.length, Math.max(0, beat - 1));
  const recordIndex = reduced ? recordActions.length - 1 : recordBeat;

  return (
    <div data-motion={reduced ? "reduced" : "play"} className="mt-16 space-y-24">
      <section>
<div className="">
          <p className="eyebrow">Why this, inside Salesforce</p>
          <h2 className="mt-4 text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em] text-[#0b1b3a]">One free app instead of <span className="text-grad-ink">three paid tools.</span></h2>
          <p className="mt-3 max-w-2xl text-base text-[#5a6a86]">Generate and eSign without leaving Salesforce — and without a per-seat bill.</p>
        </div>
        <div className="mt-8 overflow-hidden rounded-[20px] shadow-[var(--sh-sm)] border border-[#e1eaf8] bg-white">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-[#e1eaf8] bg-[#f3f8ff] text-[11px] font-bold tracking-[0.04em] text-[#5a6a86] uppercase sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] sm:text-xs">
            <div className="px-3 py-3 sm:px-4" />
            <div className="px-3 py-3 sm:px-4">Paid tools</div>
            <div className="bg-[rgba(37,99,235,0.08)] px-3 py-3 text-[#2563eb] sm:px-4">
              Pravadh DocSign
            </div>
          </div>
          {compare.map(([label, theirs, ours]) => (
            <div
              key={label}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-[#e1eaf8] last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <div className="px-3 py-4 text-xs font-bold text-[#0b1b3a] sm:px-4 sm:text-sm">{label}</div>
              <div className="px-3 py-4 text-sm text-[#5a6a86] sm:px-4">{theirs}</div>
              <div className="bg-[rgba(37,99,235,0.06)] px-3 py-4 text-sm font-bold text-[#0b1b3a] sm:px-4">
                {ours}
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {[
            "Any standard or custom object",
            "Salesforce Files on the record",
            "No licence to sign",
            "SHA-256 chain, re-checked on every view",
          ].map((item) => (
            <li
              key={item}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0b1b3a] ring-1 ring-[#e1eaf8]"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-8">
        <div className="">
          <p className="eyebrow">Inside your org</p>
          <h2 className="mt-4 text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em] text-[#0b1b3a]">The DocSign app, <span className="text-grad-ink">right in Salesforce.</span></h2>
          <p className="mt-3 max-w-2xl text-base text-[#5a6a86]">Track every document and envelope from one home tab, and finish setup in four steps.</p>
        </div>
      <section className="overflow-hidden rounded-[20px] border border-[#e1eaf8] bg-[#f3f8ff] shadow-[var(--sh-lg)]">
        <div className="flex items-center gap-2 border-b border-[#e1eaf8] bg-white px-4 py-3">
          <Mark size={26} />
          <span className="text-sm font-bold tracking-[-0.02em] text-[#0b1b3a]">
            Pravadh DocSign
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-[#e1eaf8] bg-white px-2">
          {["DocSign Home", "Templates", "DocSign Documents", "DocSign Envelopes", "DocSign Settings"].map(
            (tab) => (
              <span
                key={tab}
                className={
                  tab === "DocSign Home"
                    ? "shrink-0 border-b-2 border-[#2563eb] px-3 py-2.5 text-xs font-bold text-[#2563eb]"
                    : "shrink-0 px-3 py-2.5 text-xs font-medium text-[#5a6a86]"
                }
              >
                {tab}
              </span>
            ),
          )}
        </div>
        <div className="space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map(([label], index) => (
              <div key={label} className="rounded-xl bg-white px-3 py-3 ring-1 ring-[#e1eaf8]">
                <p className="text-2xl font-bold tracking-[-0.04em] text-[#2563eb] tabular-nums">
                  {counts[index]}
                </p>
                <p className="mt-1 text-[11px] leading-snug font-medium text-[#5a6a86]">{label}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl bg-white p-4 ring-1 ring-[#e1eaf8]">
              <h2 className="text-sm font-bold text-[#0b1b3a]">Continue where you left off</h2>
              <p className="mt-3 text-sm font-bold text-[#0b1b3a]">VAN-1044 · PDF</p>
              <p className="mt-1 text-xs text-[#5a6a86]">Tenant · Witness 1</p>
              <p className="mt-3 text-sm font-bold text-[#2563eb]">Resume</p>
            </div>
            <div className="relative rounded-xl bg-white p-4 ring-1 ring-[#e1eaf8]">
              <h2 className="text-sm font-bold text-[#0b1b3a]">Recent envelopes</h2>
              <p
                className="mt-3 text-sm text-[#5a6a86] transition-opacity duration-500"
                style={{ opacity: envelopeIn ? 0 : 1, height: envelopeIn ? 0 : "auto", overflow: "hidden" }}
              >
                No envelopes yet. Add the Pravadh DocSign component to any record page.
              </p>
              <div
                className="overflow-hidden transition-all duration-500"
                style={{ maxHeight: envelopeIn ? 72 : 0, opacity: envelopeIn ? 1 : 0, marginTop: envelopeIn ? 12 : 0 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#0b1b3a]">ENV-2041</p>
                    <p className="text-xs text-[#5a6a86]">Master Services Agreement</p>
                  </div>
                  <span className="rounded-full bg-[#2563eb] px-2.5 py-1 text-xs font-bold text-white">
                    Sent
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-4 ring-1 ring-[#e1eaf8]">
              <h2 className="text-sm font-bold text-[#0b1b3a]">Get started</h2>
              <ol className="mt-3 space-y-1">
                {setup.map((step, index) => {
                  const done = checks > index;
                  return (
                    <li key={step.label}>
                      <Link
                        href={step.href}
                        className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-[#f3f8ff]"
                      >
                        <span
                          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-300"
                          style={{
                            background: done ? "#0f9d6b" : "rgba(15,23,42,0.12)",
                            color: done ? "#fff" : "#5a6a86",
                          }}
                        >
                          {done ? "✓" : index + 1}
                        </span>
                        <span className={done ? "text-[#0b1b3a]" : "text-[#5a6a86]"}>{step.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-[#e1eaf8]">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#5a6a86] uppercase">Built by</p>
            <p className="mt-1 text-sm font-bold text-[#0b1b3a]">Dhairya Shah · Pravadh Labs</p>
          </div>
        </div>
      </section>

      </div>

      <div className="space-y-8">
        <div>
          <p className="eyebrow">Automation</p>
          <h2 className="mt-4 text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em] text-[#0b1b3a]">Built for Flow. <span className="text-grad-ink">Ready for Agentforce.</span></h2>
        </div>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[20px] bg-white p-6 ring-1 ring-[#e1eaf8] shadow-[var(--sh-sm)] lift">
          <p className="eyebrow">Flow</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {flowActions.map((action, index) => {
              const on = flowOn > index;
              return (
                <li
                  key={action}
                  className="rounded-full px-3 py-1.5 text-xs font-bold transition-colors duration-300"
                  style={{
                    background: on ? "#2563eb" : "#f3f8ff",
                    color: on ? "#fff" : "#5a6a86",
                  }}
                >
                  {action}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-[#5a6a86]">A platform event on every envelope change.</p>
          <p className="mt-1 text-sm text-[#5a6a86]">Optional field update when a document is completed.</p>
        </div>
        <div className="rounded-[20px] bg-white p-6 ring-1 ring-[#e1eaf8] shadow-[var(--sh-sm)] lift">
          <p className="eyebrow">
            Agentforce
          </p>
          <ul className="mt-4 space-y-2 text-sm font-semibold text-[#0b1b3a]">
            <li>Find templates</li>
            <li>Summarise signature status</li>
            <li>Check missing data</li>
          </ul>
          <p className="mt-4 text-sm text-[#5a6a86]">On when Agentforce is available. Other AI providers can extend it.</p>
        </div>
      </section>

      </div>

      <section className="grid items-center gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">
            Any record
          </p>
          <h2 className="mt-4 text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-[-0.03em] text-[#0b1b3a]">
            Generate, upload, prepare, send, track.
          </h2>
        </div>
        <div className="grid overflow-hidden rounded-2xl border border-[#e1eaf8] bg-white md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="border-b border-[#e1eaf8] p-5 md:border-r md:border-b-0">
            <p className="text-xs font-semibold text-[#5a6a86]">Vendor Agreement</p>
            <p className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[#0b1b3a]">VAN-1044</p>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#5a6a86]">Account</dt>
                <dd className="font-semibold text-[#0b1b3a]">Northwind Logistics</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#5a6a86]">Status</dt>
                <dd className="font-semibold text-[#0b1b3a]">Open</dd>
              </div>
            </dl>
          </div>
          <div className="bg-[#f3f8ff] p-5">
            <div className="rounded-xl bg-white p-4 ring-1 ring-[#e1eaf8]">
              <div className="flex items-center gap-2">
                <Mark size={20} />
                <p className="text-sm font-bold text-[#0b1b3a]">DocSign</p>
              </div>
              <p className="mt-4 text-lg font-bold tracking-[-0.03em] text-[#2563eb] transition-opacity duration-300">
                {recordActions[recordIndex]}
              </p>
              <p className="mt-2 text-sm text-[#5a6a86]">
                {recordIndex === recordActions.length - 1 ? "MSA.pdf · Salesforce Files" : "On this record"}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
