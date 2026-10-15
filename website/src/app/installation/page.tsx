import type { Metadata } from "next";
import { InstallFreeLink, ReplacingLink } from "@/components/action-links";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: "Installation",
  description: "Pravadh DocSign is a free managed package, namespace prvd, separate from Pravadh IQ.",
};

export default function InstallationPage() {
  return (
    <>
      <ProductLockup page="installation" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 [&>*]:max-w-3xl">
      <section className="mt-12 rounded-2xl bg-white px-6 py-8 ring-1 ring-[#e1eaf8] sm:px-8">
        <p className="eyebrow">
          Managed package
        </p>
        <h2 className="mt-3 text-4xl font-bold tracking-[-0.035em] text-[#0b1b3a]">Free.</h2>
        <p className="mt-4 text-lg font-semibold text-[#0b1b3a]">Namespace prvd.</p>
        <p className="mt-2 text-[#5a6a86]">Separate from Pravadh IQ.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <InstallFreeLink />
          <ReplacingLink />
        </div>
      </section>
    </div>
    </>
  );
}
