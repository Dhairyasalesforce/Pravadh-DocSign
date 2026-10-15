import { githubUrl, labsUrl } from "@/lib/nav";

export const siteUrl = "https://pravadhdocsign.pravadhlabs.com";
export const siteName = "Pravadh DocSign";
export const ogImage = "/brand/og-image.png";

export const defaultDescription =
  "Pravadh DocSign is free, open-source (Apache 2.0) document generation and eSignature built natively for Salesforce. Unlimited users, documents, recipients and signatures. No paid tier.";

export const keywords = [
  "open source eSignature",
  "Salesforce eSignature",
  "free eSignature for Salesforce",
  "Salesforce document generation",
  "free document generation Salesforce",
  "open source document generation",
  "DocuSign alternative",
  "Conga alternative",
  "S-Docs alternative",
  "Nintex alternative",
  "AppExchange eSignature",
  "Apex PDF generation",
  "Pravadh DocSign",
];

/** Structured data for search engines (SoftwareApplication + source code + publisher). */
export const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: siteName,
      url: siteUrl,
      description: defaultDescription,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "eSignature and document generation",
      operatingSystem: "Salesforce",
      isAccessibleForFree: true,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      downloadUrl: githubUrl,
      installUrl: `${githubUrl}#install`,
      softwareHelp: `${siteUrl}/support/`,
      image: `${siteUrl}${ogImage}`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      featureList: [
        "Generate PDF and Word documents from any Salesforce object",
        "Built-in eSignature with no licence needed to sign",
        "Unlimited users, documents, recipients and signatures",
        "SHA-256 audit chain and signing certificate",
        "Flow actions to generate, send, check status, cancel and resend",
      ],
      publisher: { "@id": `${labsUrl}/#organization` },
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${siteUrl}/#source`,
      name: `${siteName} source code`,
      codeRepository: githubUrl,
      programmingLanguage: ["Apex", "JavaScript"],
      runtimePlatform: "Salesforce",
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      targetProduct: { "@id": `${siteUrl}/#software` },
      author: { "@id": `${labsUrl}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${labsUrl}/#organization`,
      name: "Pravadh Labs",
      legalName: "Pravadh Labs Private Limited",
      url: labsUrl,
      logo: `${siteUrl}/brand/icon-512.png`,
      sameAs: [githubUrl, "https://www.linkedin.com/company/pravadhiq", "https://www.youtube.com/@PravadhLabs"],
    },
  ],
};

/** Per-page canonical + social tags. `path` is the route with a trailing slash ("/" for home). */
export function pageMeta(path: string, title: string, description: string) {
  const url = `${siteUrl}${path}`;
  return {
    alternates: { canonical: url },
    openGraph: { url, title, description, siteName, type: "website" as const, images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image" as const, title, description, images: [ogImage] },
  };
}
