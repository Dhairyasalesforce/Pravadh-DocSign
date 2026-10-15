import type { Metadata } from "next";
import { DocumentScene } from "@/components/motion/document-scene";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: "Documents",
  description: "Upload a PDF, detect blanks, and prepare who fills what.",
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
