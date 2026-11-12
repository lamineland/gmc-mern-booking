/**
 * Flat top-down drawing of a pitch or court, used as the venue cover until owners upload photos.
 * Width/height come from CSS; the drawing keeps a 16:9 frame.
 */
const FIELDS = {
  football: { bg: '#22B45E', stripe: '#1EA455', line: '#fff' },
  futsal: { bg: '#2B8A6E', stripe: '#287F65', line: '#fff' },
  basketball: { bg: '#E9A25F', stripe: '#DE9752', line: '#fff', paint: '#F28C3B' },
  padel: { bg: '#2F6FD6', stripe: '#2B66C6', line: '#fff' },
};

function Football({ c }) {
  return (
    <>
      {[0, 2, 4, 6].map((i) => <rect key={i} x={i * 40 + 20} y="0" width="40" height="180" fill={c.stripe} />)}
      <g fill="none" stroke={c.line} strokeWidth="2.5" opacity="0.9">
        <rect x="24" y="22" width="272" height="136" rx="2" />
        <line x1="160" y1="22" x2="160" y2="158" />
        <circle cx="160" cy="90" r="22" />
        <rect x="24" y="58" width="34" height="64" />
        <rect x="262" y="58" width="34" height="64" />
      </g>
      <circle cx="160" cy="90" r="3" fill={c.line} />
    </>
  );
}

function Basketball({ c }) {
  return (
    <>
      {[30, 60, 90, 120, 150].map((y) => <line key={y} x1="0" y1={y} x2="320" y2={y} stroke={c.stripe} strokeWidth="2" />)}
      <rect x="24" y="66" width="56" height="48" fill={c.paint} />
      <rect x="240" y="66" width="56" height="48" fill={c.paint} />
      <g fill="none" stroke={c.line} strokeWidth="2.5" opacity="0.95">
        <rect x="24" y="22" width="272" height="136" rx="2" />
        <line x1="160" y1="22" x2="160" y2="158" />
        <circle cx="160" cy="90" r="18" />
        <rect x="24" y="66" width="56" height="48" />
        <rect x="240" y="66" width="56" height="48" />
        <path d="M 24 32 H 44 A 62 62 0 0 1 44 148 H 24" />
        <path d="M 296 32 H 276 A 62 62 0 0 0 276 148 H 296" />
      </g>
    </>
  );
}

function Padel({ c }) {
  return (
    <>
      <rect x="40" y="26" width="240" height="128" fill={c.stripe} />
      <g fill="none" stroke={c.line} strokeWidth="2.5" opacity="0.95">
        <rect x="40" y="26" width="240" height="128" />
        <line x1="90" y1="26" x2="90" y2="154" />
        <line x1="230" y1="26" x2="230" y2="154" />
        <line x1="90" y1="90" x2="230" y2="90" />
      </g>
      <line x1="160" y1="20" x2="160" y2="160" stroke="#0E1B14" strokeWidth="4" />
      <rect x="34" y="20" width="252" height="140" fill="none" stroke="#BFE3FF" strokeWidth="4" opacity="0.7" />
    </>
  );
}

export default function SportCover({ sport = 'football', className = '', ball = true }) {
  const c = FIELDS[sport] ?? FIELDS.football;
  const Field = sport === 'basketball' ? Basketball : sport === 'padel' ? Padel : Football;
  return (
    <svg className={`sport-cover ${className}`} viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="180" fill={c.bg} />
      <Field c={c} />
      {ball && sport === 'basketball' && <circle cx="206" cy="58" r="8" fill="#FF7A1A" stroke="#7A3300" strokeWidth="1.5" />}
      {ball && sport === 'padel' && <circle cx="120" cy="60" r="5" fill="#E4FF3A" />}
      {ball && (sport === 'football' || sport === 'futsal') && <circle cx="196" cy="70" r="6" fill="#fff" stroke="#0E1B14" strokeWidth="1.5" />}
    </svg>
  );
}
