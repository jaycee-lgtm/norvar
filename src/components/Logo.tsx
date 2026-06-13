// Norvar logo mark — three fading slashes. Motion, scanning, tiers.

const BRAND_RED = "#8b1a1a";
const SLASH_LIGHT = "#e2e2e0";

type LogoProps = {
  size?: number;
  /** "mark" = red tile + slashes. "icon" = slashes only. "hero" = slashes only, first stroke red. */
  variant?: "mark" | "icon" | "hero";
  className?: string;
};

export default function Logo({ size = 26, variant = "mark", className }: LogoProps) {
  const isHero = variant === "hero";
  const firstStroke = isHero ? BRAND_RED : SLASH_LIGHT;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden
    >
      {variant === "mark" && <rect width="52" height="52" rx="11" fill={BRAND_RED} />}
      <line
        x1="16" y1="38" x2="22" y2="14"
        stroke={firstStroke}
        strokeWidth={isHero ? 4 : 3}
        strokeLinecap="round"
      />
      <line
        x1="24" y1="38" x2="28" y2="14"
        stroke={SLASH_LIGHT}
        strokeWidth={isHero ? 3.5 : 3}
        strokeLinecap="round"
        opacity="0.55"
      />
      <line
        x1="30" y1="38" x2="36" y2="14"
        stroke={SLASH_LIGHT}
        strokeWidth={isHero ? 3.5 : 3}
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}
