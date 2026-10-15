import type { Metadata } from "next";
import { TemplateScene } from "@/components/motion/template-scene";
import { ProductLockup } from "@/components/product-lockup";
import { VisualEditorScene } from "@/components/motion/visual-editor-scene";

export const metadata: Metadata = {
  title: "Templates",
  description: "Templates on any object, built in a visual editor or HTML, with live preview and blank merge fields.",
};

export default function TemplatesPage() {
  return (
    <>
      <ProductLockup page="templates" />
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <TemplateScene />
      <VisualEditorScene />
    </div>
    </>
  );
}
