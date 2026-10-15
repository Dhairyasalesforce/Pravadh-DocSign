import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { EnvelopeScene } from "@/components/motion/envelope-scene";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: "Envelopes, signing and the audit certificate",
  description: "Send envelopes for signature from Salesforce, track every step and get a SHA-256 audit chain and completion certificate. Free and open source.",
  ...pageMeta("/envelopes/", "Envelopes, signing and the audit certificate", "Send envelopes for signature from Salesforce, track every step and get a SHA-256 audit chain and completion certificate. Free and open source."),
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
