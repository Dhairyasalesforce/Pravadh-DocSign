import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";
import { defaultDescription, jsonLd, keywords, ogImage, siteName, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Free Open-Source eSignature for Salesforce | Pravadh DocSign",
    template: "%s · Pravadh DocSign",
  },
  description: defaultDescription,
  keywords,
  applicationName: siteName,
  authors: [{ name: "Pravadh Labs", url: "https://pravadhlabs.com" }],
  publisher: "Pravadh Labs Private Limited",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName,
    url: siteUrl,
    title: "Pravadh DocSign: free, open-source eSignature for Salesforce",
    description: defaultDescription,
    images: [{ url: ogImage, width: 1200, height: 630, alt: "Pravadh DocSign: free, open-source eSignature and document generation for Salesforce" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pravadh DocSign: free, open-source eSignature for Salesforce",
    description: defaultDescription,
    images: [ogImage],
  },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  icons: {
    icon: "/brand/icon-512.png",
    apple: "/brand/icon-512.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <script
          type="application/ld+json"
          // Static, build-time JSON (no user input), so this is safe.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-navy"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="content" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
