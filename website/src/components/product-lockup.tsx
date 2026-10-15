import { InstallFreeLink, ReplacingLink } from "@/components/action-links";
import { Mark } from "@/components/brand-mark";

type PageKey =
  | "home"
  | "templates"
  | "documents"
  | "envelopes"
  | "settings"
  | "installation"
  | "pricing"
  | "support";

const copy: Record<PageKey, { pill: string; title: string; accent: string; lead: string }> = {
  home: {
    pill: "Free and open source on GitHub · Built natively for Salesforce",
    title: "Any Object. Any Document.",
    accent: "Any Signature.",
    lead: "Pravadh DocSign is document generation and eSignature that lives inside Salesforce. Generate. Sign. Store. Automate. No licence to sign and no paid tier.",
  },
  templates: {
    pill: "Templates",
    title: "Templates on any object.",
    accent: "Built visually.",
    lead: "Design templates for any standard or custom object in the new visual editor, or in HTML. Preview with a real record and see blank merge fields before you send.",
  },
  documents: {
    pill: "Documents",
    title: "Upload a PDF.",
    accent: "Prepare who fills what.",
    lead: "Upload a PDF, detect the blanks, and assign each field to the right signer.",
  },
  envelopes: {
    pill: "Envelopes",
    title: "Signing on a Salesforce Site page.",
    accent: "Proof on every view.",
    lead: "The signing page, then the SHA-256 audit chain and certificate — re-checked every time the document is viewed.",
  },
  settings: {
    pill: "Settings",
    title: "Set it up once.",
    accent: "Then just send.",
    lead: "Signing site, sender, expiry, reminders, branding, and AI status — all in one place.",
  },
  installation: {
    pill: "Installation",
    title: "Install free",
    accent: "in 30 seconds.",
    lead: "Open source under Apache 2.0. Install the managed package (namespace prvd) in one click, or deploy the source from GitHub.",
  },
  pricing: {
    pill: "Pricing",
    title: "100% free.",
    accent: "There is no paid tier.",
    lead: "Unlimited users, documents, recipients, and signatures. Services from Pravadh Labs are unpriced.",
  },
  support: {
    pill: "Support",
    title: "Get help from",
    accent: "Pravadh Labs.",
    lead: "Installation help, configuration, and work beyond the product. The application stays free.",
  },
};

const heroChecks = ["Free and open source", "No licence to sign", "Unlimited signatures", "New: visual template editor"];

const heroStats = [
  ["Any", "Standard or custom object"],
  ["SHA-256", "Audit chain"],
  ["Flow", "Actions + platform events"],
  ["$0", "No paid tier"],
] as const;

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-[#2dd4bf]" fill="none">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SignCard() {
  const signers = [
    ["Priya Sharma", "Northwind Logistics", "Signed"],
    ["Arjun Mehta", "Witness 1", "Signed"],
    ["Legal review", "Internal", "Viewed"],
  ] as const;
  return (
    <div className="relative rounded-[22px] bg-white p-5 text-[#0b1b3a] shadow-[var(--sh-xl)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Mark size={28} />
          <div>
            <p className="text-sm font-semibold">Master Services Agreement</p>
            <p className="text-xs text-[#5a6a86]">ENV-2041 · Opportunity · MSA.pdf</p>
          </div>
        </div>
        <span className="rounded-full bg-[#e7f8f0] px-2.5 py-1 text-[11px] font-semibold text-[#0f9d6b]">Completed</span>
      </div>

      <div className="mt-5 space-y-2.5 rounded-2xl bg-[#f3f8ff] p-4">
        <div className="h-2 w-3/4 rounded-full bg-[#cfdcf2]" />
        <div className="h-2 w-full rounded-full bg-[#e1eaf8]" />
        <div className="h-2 w-5/6 rounded-full bg-[#e1eaf8]" />
        <div className="mt-4 flex items-end justify-between gap-4 border-t border-dashed border-[#bcd0fb] pt-3">
          <div>
            <p className="font-[cursive] text-2xl leading-none text-[#1d4ed8] italic">Priya Sharma</p>
            <p className="mt-1 text-[11px] text-[#5a6a86]">Signed in Salesforce · 25 Sep 2026</p>
          </div>
          <span className="shrink-0 rounded-lg bg-white px-2 py-1 font-mono text-[10px] text-[#5a6a86] ring-1 ring-[#e1eaf8]">
            sha256 · 9f2c…e41a
          </span>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-[#e1eaf8]">
        {signers.map(([name, role, status]) => (
          <li key={name} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-[#e8f0ff] text-[11px] font-semibold text-[#2563eb]">
                {name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </span>
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-[11px] text-[#5a6a86]">{role}</p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                status === "Signed" ? "bg-[#e7f8f0] text-[#0f9d6b]" : "bg-[#e8f0ff] text-[#2563eb]"
              }`}
            >
              {status}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex items-center gap-2 text-xs text-[#5a6a86]">
        <span className="size-1.5 rounded-full bg-[#0f9d6b]" />
        Saved to Salesforce Files on the record
      </p>
    </div>
  );
}

export function ProductLockup({ page = "home" }: { page?: PageKey; size?: "hero" | "page" }) {
  const c = copy[page];
  const home = page === "home";

  return (
    <section className="pv-hero">
      <div
        className={`mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 ${
          home ? "py-16 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center" : "py-14 sm:py-16"
        }`}
      >
        <div className="rise">
          <p className="pill-dark">
            <span className="size-1.5 rounded-full bg-[#2dd4bf] shadow-[0_0_0_3px_rgba(45,212,191,0.2)]" />
            {home ? c.pill : `Pravadh DocSign · ${c.pill}`}
          </p>
          <h1
            className={`mt-5 font-bold tracking-[-0.035em] text-white ${
              home ? "text-[clamp(2.3rem,5vw,3.6rem)] leading-[1.06]" : "text-[clamp(2rem,4vw,3rem)] leading-[1.08]"
            }`}
          >
            {c.title}
            <br />
            <span className="text-grad">{c.accent}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#b4c2de] sm:text-lg">{c.lead}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <InstallFreeLink />
            <ReplacingLink tone="dark" />
          </div>
          {home && (
            <>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[#b4c2de]">
                {heroChecks.map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
              <dl className="glass-dark mt-10 grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4">
                {heroStats.map(([value, label]) => (
                  <div key={label} className="px-5 py-4">
                    <dt className="sr-only">{label}</dt>
                    <dd>
                      <span className="block text-xl font-bold tracking-[-0.02em] text-[#7dd3fc]">{value}</span>
                      <span className="mt-0.5 block text-xs text-[#b4c2de]">{label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
        {home && (
          <div className="rise [animation-delay:120ms]">
            <SignCard />
          </div>
        )}
      </div>
    </section>
  );
}
