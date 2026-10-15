import type { NextConfig } from "next";

// Static export: `npm run build` writes a plain HTML/CSS/JS site to ./out,
// served by nginx at pravadhdocsign.pravadhlabs.com (see deploy/nginx-pravadhdocsign.conf).
// Old-path redirects (/product, /signatures, /automation, /security, /about) live in that nginx config,
// because Next.js redirects() are not supported with output: "export".
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // The dev server is bound to 0.0.0.0. Allow the hosts browsers actually use.
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.29.121"],
};

export default nextConfig;
