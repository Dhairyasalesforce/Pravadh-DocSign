import type { Metadata } from "next";
import { SettingsScene } from "@/components/motion/settings-scene";
import { ProductLockup } from "@/components/product-lockup";

export const metadata: Metadata = {
  title: "Settings",
  description: "Signing site, sender, expiry, reminders, branding, and AI status.",
};

export default function SettingsPage() {
  return (
    <>
      <ProductLockup page="settings" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 [&>*]:max-w-3xl">
      <SettingsScene />
    </div>
    </>
  );
}
