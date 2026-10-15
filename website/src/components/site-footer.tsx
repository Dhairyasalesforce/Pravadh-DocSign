import Link from "next/link";
import { InstallFreeLink, GitHubLink } from "@/components/action-links";
import { BrandLockup } from "@/components/brand-mark";
import { PartnerLockup } from "@/components/partner-lockup";
import { appNav, labsUrl, linkedInUrl, pravadhIqUrl, secondaryNav } from "@/lib/nav";

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-[linear-gradient(#06122b,#040b1d)] text-[#b4c2de]">
      <div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <BrandLockup tone="dark" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed">
              Document generation &amp; eSignature, built natively for Salesforce. S-Docs, Conga, and Nintex are
              paid. DocSign is free and open source: unlimited users, documents, recipients, and signatures.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PartnerLockup tone="dark" />
              <GitHubLink tone="dark" />
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] text-white uppercase">Product</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {appNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] text-white uppercase">Get started</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {secondaryNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-[0.14em] text-white uppercase">Pravadh Labs</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href={labsUrl} className="hover:text-white">
                  pravadhlabs.com
                </a>
              </li>
              <li>
                <a href={pravadhIqUrl} className="hover:text-white">
                  Pravadh IQ
                </a>
              </li>
              <li>
                <a href={linkedInUrl} className="hover:text-white">
                  Dhairya Shah on LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-[20px] border border-white/10 bg-white/[0.04] p-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-2xl font-bold tracking-[-0.03em] text-white">
              100% free. <span className="text-grad">There is no paid tier.</span>
            </p>
            <p className="mt-1 text-sm">Any Salesforce object · Salesforce Files · Templates · Flow · Built-in eSign · No caps.</p>
          </div>
          <InstallFreeLink />
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[#1c2f57] pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Pravadh Labs. Pravadh Labs is a Salesforce ISV Partner.</p>
          <p>Built by Dhairya Shah, Founder &amp; CEO, Pravadh Labs · Salesforce Principal Architect</p>
        </div>
      </div>
    </footer>
  );
}
