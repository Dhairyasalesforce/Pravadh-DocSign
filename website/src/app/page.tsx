import type { Metadata } from "next";
import { HomeScene } from "@/components/motion/home-scene";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: { absolute: "Pravadh DocSign — Document generation & eSignature for Salesforce" },
  description: "Document generation & eSignature, built natively for Salesforce. Free managed package, no paid tier.",
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
