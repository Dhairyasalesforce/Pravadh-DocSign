import type { Metadata } from "next";
import { EnvelopeScene } from "@/components/motion/envelope-scene";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: "Envelopes",
  description: "The signing page, then the SHA-256 audit chain and certificate.",
};

export default function EnvelopesPage() {
  return (
    <>
      <ProductLockup page="envelopes" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <EnvelopeScene />
    </div>
    </>
  );
}
