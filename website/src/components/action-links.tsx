import { githubUrl, installUrl, labsUrl } from "@/lib/nav";

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
  label = "Install free from GitHub",
}: {
  className?: string;
  size?: "sm" | "lg";
  label?: string;
}) {
  return (
    <a href={installUrl} className={`btn-pv group ${size === "sm" ? "btn-sm" : ""} ${className}`}>
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

export function GitHubLink({ className = "", tone = "light" }: { className?: string; tone?: Tone }) {
  return (
    <a
      href={githubUrl}
      className={`text-sm font-semibold underline-offset-4 hover:underline ${
        tone === "dark" ? "text-[#7dd3fc]" : "text-[#2563eb]"
      } ${className}`}
    >
      Star Pravadh DocSign on GitHub →
    </a>
  );
}
