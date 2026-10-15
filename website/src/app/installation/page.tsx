import type { Metadata } from "next";
import { InstallFreeLink, ReplacingLink } from "@/components/action-links";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: "Installation",
  description: "Pravadh DocSign is free and open source. Install the managed package or deploy the source from GitHub.",
};

export default function InstallationPage() {
  return (
    <>
      <ProductLockup page="installation" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 [&>*]:max-w-3xl">
      <section className="mt-12 rounded-2xl bg-white px-6 py-8 ring-1 ring-[#e1eaf8] sm:px-8">
        <p className="eyebrow">
          Open source · Apache 2.0
        </p>
        <h2 className="mt-3 text-4xl font-bold tracking-[-0.035em] text-[#0b1b3a]">Free. On GitHub.</h2>
        <p className="mt-4 text-lg font-semibold text-[#0b1b3a]">Managed package, namespace prvd, version 1.0.0.</p>
        <p className="mt-2 text-[#5a6a86]">
          Or deploy the source with the Salesforce CLI. Install links, setup steps and release notes are in the
          repository.
        </p>
        <p className="mt-6 rounded-xl bg-[#f3f8ff] px-4 py-3 text-sm leading-relaxed text-[#33425f] ring-1 ring-[#e1eaf8]">
          When the managed package is installed or upgraded, it emails Pravadh Labs (inquire@pravadhlabs.com) the
          installer&apos;s name, email, phone, title, company and address and the org&apos;s name, Id, edition and
          address, so we can offer onboarding and support. Your documents and records are never sent. Source deploys
          send nothing.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <InstallFreeLink />
          <ReplacingLink />
        </div>
      </section>
    </div>
    </>
  );
}
