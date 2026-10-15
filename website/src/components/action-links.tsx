import { labsUrl } from "@/lib/nav";

type Tone = "dark" | "light";

function Arrow() {
  return (
    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
      →
    </span>
  );
}

export function InstallFreeLink({
  className = "",
  size = "lg",
  label = "Install free in 30 seconds",
}: {
  className?: string;
  size?: "sm" | "lg";
  label?: string;
}) {
  return (
    <a href={labsUrl} className={`btn-pv group ${size === "sm" ? "btn-sm" : ""} ${className}`}>
      {label}
    </a>
  );
}

export function ReplacingLink({ className = "", tone = "light" }: { className?: string; tone?: Tone }) {
  return (
    <a href={labsUrl} className={`${tone === "dark" ? "btn-ghost-dark" : "btn-ghost-light"} group ${className}`}>
      Replacing Conga or S-Docs <Arrow />
    </a>
  );
}

export function ReviewLink({ className = "", tone = "light" }: { className?: string; tone?: Tone }) {
  return (
    <a
      href={labsUrl}
      className={`text-sm font-semibold underline-offset-4 hover:underline ${
        tone === "dark" ? "text-[#7dd3fc]" : "text-[#2563eb]"
      } ${className}`}
    >
      Review on AppExchange →
    </a>
  );
}
