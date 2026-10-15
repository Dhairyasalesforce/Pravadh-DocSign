import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { HomeScene } from "@/components/motion/home-scene";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: { absolute: "Free Open-Source eSignature for Salesforce | Pravadh DocSign" },
  description: "Pravadh DocSign is free, open-source (Apache 2.0) document generation and eSignature built natively for Salesforce. Unlimited users, documents, recipients and signatures.",
  ...pageMeta("/", "Free Open-Source eSignature for Salesforce | Pravadh DocSign", "Pravadh DocSign is free, open-source (Apache 2.0) document generation and eSignature built natively for Salesforce. Unlimited users, documents, recipients and signatures."),
};

export default function HomePage() {
  return (
    <>
      <ProductLockup page="home" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <HomeScene />
      </div>
    </>
  );
}
