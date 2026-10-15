import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-static";

const routes: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/installation/", priority: 0.9, changeFrequency: "monthly" },
  { path: "/templates/", priority: 0.8, changeFrequency: "monthly" },
  { path: "/documents/", priority: 0.8, changeFrequency: "monthly" },
  { path: "/envelopes/", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pricing/", priority: 0.7, changeFrequency: "monthly" },
  { path: "/settings/", priority: 0.5, changeFrequency: "monthly" },
  { path: "/support/", priority: 0.5, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return routes.map((r) => ({ url: `${siteUrl}${r.path}`, lastModified, changeFrequency: r.changeFrequency, priority: r.priority }));
}
