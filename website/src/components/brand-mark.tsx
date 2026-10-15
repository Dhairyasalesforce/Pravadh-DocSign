import Image from "next/image";

export function Wordmark({
  height = 36,
  priority = false,
}: {
  height?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/wordmark.png"
      alt="Pravadh DocSign"
      width={1040}
      height={256}
      priority={priority}
      style={{ height, width: "auto" }}
    />
  );
}

export function Mark({
  size = 28,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/icon-512.png"
      alt=""
      width={512}
      height={512}
      priority={priority}
      style={{ height: size, width: size }}
      className="rounded-md"
    />
  );
}

/** Icon + "Pravadh DocSign" text lockup, matching the Pravadh IQ header lockup. */
export function BrandLockup({
  tone = "light",
  priority = false,
}: {
  tone?: "dark" | "light";
  priority?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={34} priority={priority} />
      <span className="flex flex-col leading-none">
        <span
          className={`text-[10px] font-semibold tracking-[0.18em] uppercase ${
            tone === "dark" ? "text-[#b4c2de]" : "text-[#5a6a86]"
          }`}
        >
          Pravadh
        </span>
        <span className={`mt-0.5 text-[17px] font-bold tracking-[-0.02em] ${tone === "dark" ? "text-white" : "text-[#0b1b3a]"}`}>
          Doc<span className={tone === "dark" ? "text-grad" : "text-[#2563eb]"}>Sign</span>
        </span>
      </span>
    </span>
  );
}
