/**
 * WinPitch logo: a green tile with a white "W" whose middle peak lifts an orange ball.
 * `variant="light"` is for dark backgrounds (footer).
 */
export function LogoMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--brand)" />
      <polyline
        points="8.5,13 14,30 20,18.5 26,30 31.5,13"
        fill="none"
        stroke="#fff"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="10" r="3.6" fill="var(--accent)" />
    </svg>
  );
}

export default function Logo({ size = 36, variant = 'dark' }) {
  return (
    <span className={`logo logo-${variant}`}>
      <LogoMark size={size} />
      <span className="logo-word">
        Win<span>Pitch</span>
      </span>
    </span>
  );
}
