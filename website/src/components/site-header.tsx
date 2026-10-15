"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InstallFreeLink } from "@/components/action-links";
import { BrandLockup } from "@/components/brand-mark";
import { appNav, labsUrl, secondaryNav, githubUrl } from "@/lib/nav";

const allNav = [...appNav, ...secondaryNav];

function navClass(active: boolean) {
  return active
    ? "block rounded-xl bg-[#e8f0ff] px-3 py-2 text-[13.5px] font-semibold whitespace-nowrap text-[#2563eb]"
    : "block rounded-xl px-3 py-2 text-[13.5px] font-medium whitespace-nowrap text-[#33425f] transition-colors hover:bg-[#f2f7ff] hover:text-[#0b1b3a]";
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <>
      <div className="bg-[linear-gradient(90deg,#06122b,#0b2a63)] text-[#dbe8ff]">
        <p className="mx-auto max-w-7xl px-4 py-2 text-center text-xs sm:px-6 sm:text-[13px]">
          <span className="font-semibold text-white">Free and open source</span>
          <span className="hidden sm:inline"> · Unlimited users, documents, recipients and signatures · No paid tier.</span>{" "}
          <a href={githubUrl} className="font-semibold text-[#7dd3fc] hover:underline">
            Get it on GitHub →
          </a>
        </p>
      </div>
      <header className="sticky top-0 z-40 border-b border-[#e1eaf8] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Pravadh DocSign home" className="shrink-0">
            <BrandLockup priority />
          </Link>
          <nav aria-label="Primary" className="ml-4 hidden flex-1 lg:block">
            <ul className="flex items-center gap-0.5">
              {allNav.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={active ? "page" : undefined} className={navClass(active)}>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <a
              href={labsUrl}
              className="hidden text-[13.5px] font-medium text-[#33425f] hover:text-[#0b1b3a] xl:inline"
            >
              Pravadh Labs →
            </a>
            <InstallFreeLink size="sm" label="Install free" />
          </div>
        </div>
        <nav aria-label="Primary" className="border-t border-[#e1eaf8] lg:hidden">
          <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-1.5 [scrollbar-width:none] sm:px-5">
            {allNav.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={navClass(active)}>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
    </>
  );
}
