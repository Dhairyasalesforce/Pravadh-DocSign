import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { ProductLockup } from "@/components/product-lockup";
import { labsUrl } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Pravadh DocSign, the free open-source eSignature and document generation app for Salesforce.",
  ...pageMeta("/support/", "Support", "Get help with Pravadh DocSign, the free open-source eSignature and document generation app for Salesforce."),
};

const ways = [
  "Installing the application",
  "Configuring templates, signing, or reminders",
  "Building something beyond the product",
];

export default function SupportPage() {
  return (
    <>
      <ProductLockup page="support" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 [&>*]:max-w-3xl">
      <section className="mt-12 rounded-2xl bg-white px-6 py-8 ring-1 ring-[#e1eaf8] sm:px-8">
        <h2 className="text-3xl font-bold tracking-[-0.035em] text-[#0b1b3a]">
          How we can help
        </h2>
        <p className="mt-3 text-[#5a6a86]">Unpriced. The application stays free.</p>
        <ul className="mt-6 space-y-3">
          {ways.map((way) => (
            <li key={way} className="text-base font-semibold text-[#33425f]">
              {way}
            </li>
          ))}
        </ul>
        <a
          href={labsUrl}
          className="mt-8 btn-pv"
        >
          pravadhlabs.com
        </a>
      </section>
    </div>
    </>
  );
}
