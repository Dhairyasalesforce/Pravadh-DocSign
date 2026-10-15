export function PartnerLockup({ tone = "light" }: { tone?: "dark" | "light" }) {
  const dark = tone === "dark";
  return (
    <p
      className={`inline-flex items-baseline gap-2 rounded-full border px-3.5 py-1.5 ${
        dark ? "border-white/15 bg-white/5" : "border-[#e1eaf8] bg-white"
      }`}
    >
      <span className={`text-[11px] font-semibold tracking-[0.14em] uppercase ${dark ? "text-[#b4c2de]" : "text-[#5a6a86]"}`}>
        Salesforce
      </span>
      <span className={`text-sm font-semibold ${dark ? "text-white" : "text-[#0b1b3a]"}`}>ISV Partner</span>
    </p>
  );
}
