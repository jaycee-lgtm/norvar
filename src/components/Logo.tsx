// Norvar logo mark — three fading slashes. Motion, scanning, tiers.

type LogoProps = {
  size?: number;
  /** "mark" = red tile + slashes (sidebar, etc.). "icon" = slashes only for inline hero use. */
  variant?: "mark" | "icon";
};

export default function Logo({ size = 26, variant = "mark" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden
    >
      {variant === "mark" && <rect width="52" height="52" rx="11" fill="#8b1a1a" />}
      <line x1="16" y1="38" x2="22" y2="14" stroke="#e2e2e0" strokeWidth="3" strokeLinecap="round" />
      <line x1="24" y1="38" x2="28" y2="14" stroke="#e2e2e0" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <line x1="30" y1="38" x2="36" y2="14" stroke="#e2e2e0" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}
