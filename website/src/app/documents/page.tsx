import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { DocumentScene } from "@/components/motion/document-scene";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: "Upload a PDF and prepare it for signing",
  description: "Upload any PDF to Salesforce, auto-detect blanks and assign who fills what. Free, open-source eSignature with Pravadh DocSign.",
  ...pageMeta("/documents/", "Upload a PDF and prepare it for signing", "Upload any PDF to Salesforce, auto-detect blanks and assign who fills what. Free, open-source eSignature with Pravadh DocSign."),
};

export default function DocumentsPage() {
  return (
    <>
      <ProductLockup page="documents" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <DocumentScene />
    </div>
    </>
  );
}
