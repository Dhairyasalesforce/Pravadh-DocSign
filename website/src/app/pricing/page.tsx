import type { Metadata } from "next";
import { InstallFreeLink, ReplacingLink } from "@/components/action-links";
import { ProductLockup } from "@/components/product-lockup";
import { labsUrl } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Pricing",
  description: "The Pravadh DocSign managed package is free. Services are unpriced.",
};

const included = [
  "Unlimited users",
  "Unlimited documents",
  "Unlimited recipients",
  "Unlimited signatures",
  "Any Salesforce object",
  "Templates, PDF and Word",
  "Upload and prepare",
  "Built-in eSign",
  "Salesforce Files",
  "SHA-256 audit chain",
  "Flow",
  "Agentforce when available",
];

const services = [
  ["Installing", "Help putting the free package into your org."],
  ["Configuring", "Templates, the signing site, sender, expiry, reminders."],
  ["Beyond the product", "A document, a flow, or a signing path built with you."],
];

export default function PricingPage() {
  return (
    <>
      <ProductLockup page="pricing" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <div className="mt-12 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <section className="rounded-2xl bg-white p-6 ring-1 ring-[#2563eb] sm:p-8">
          <p className="eyebrow">
            Managed package
          </p>
          <h2 className="mt-3 text-6xl font-bold tracking-[-0.04em] text-[#0b1b3a]">Free</h2>
          <p className="mt-3 text-[#5a6a86]">No caps. There is no paid tier.</p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {included.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm font-semibold text-[#0b1b3a]">
                <span aria-hidden className="font-bold text-[#0f9d6b]">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <InstallFreeLink />
          </div>
        </section>
        <section className="rounded-2xl bg-[#f3f8ff] p-6 ring-1 ring-[#e1eaf8] sm:p-8">
          <p className="eyebrow eyebrow-muted">
            Services
          </p>
          <h2 className="mt-3 text-4xl font-bold tracking-[-0.04em] text-[#0b1b3a]">Unpriced</h2>
          <p className="mt-3 text-sm text-[#5a6a86]">
            Support, installation help, configuration, and work beyond the product.
          </p>
          <ul className="mt-6 space-y-4">
            {services.map(([title, line]) => (
              <li key={title}>
                <h3 className="text-base font-bold text-[#0b1b3a]">{title}</h3>
                <p className="mt-1 text-sm text-[#5a6a86]">{line}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3">
            <a
              href={labsUrl}
              className="btn-pv"
            >
              pravadhlabs.com
            </a>
            <ReplacingLink />
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
