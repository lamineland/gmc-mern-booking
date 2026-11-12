/**
 * Flat SVG illustrations for the landing page (no external images, scale to any width).
 * Players are built from simple shapes; a pose is a set of joint points with feet at y = 0.
 */

const POSES = {
  run: {
    legs: [[[-5, -44], [-14, -24], [-28, -14]], [[5, -44], [9, -22], [4, 0]]],
    arms: [[[-10, -88], [-22, -74], [-14, -60]], [[10, -88], [22, -80], [32, -92]]],
  },
  kick: {
    legs: [[[-5, -44], [-6, -22], [-8, 0]], [[5, -44], [22, -34], [42, -26]]],
    arms: [[[-10, -88], [-28, -82], [-40, -90]], [[10, -88], [26, -94], [36, -104]]],
  },
  shoot: {
    legs: [[[-5, -44], [-10, -24], [-20, -12]], [[5, -44], [8, -22], [2, -4]]],
    arms: [[[-10, -90], [-10, -112], [-3, -128]], [[10, -90], [14, -112], [8, -130]]],
  },
  defend: {
    legs: [[[-5, -44], [-14, -22], [-20, 0]], [[5, -44], [14, -22], [20, 0]]],
    arms: [[[-10, -88], [-26, -104], [-30, -124]], [[10, -88], [26, -104], [30, -124]]],
  },
};

const pts = (list) => list.map(([x, y]) => `${x},${y}`).join(' ');

function Limb({ points, color, width }) {
  return (
    <polyline points={pts(points)} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  );
}

function Player({ x, y, scale = 1, flip = false, pose = 'run', jersey, shorts, skin = '#6B4226', number }) {
  const p = POSES[pose];
  const shade = 'rgba(0,0,0,0.18)';
  const foot = (leg) => leg[leg.length - 1];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      {/* back leg + arm, slightly darker */}
      <Limb points={p.legs[0]} color={skin} width={9} />
      <Limb points={p.legs[0]} color={shade} width={9} />
      <ellipse cx={foot(p.legs[0])[0] + 3} cy={foot(p.legs[0])[1] + 1} rx="7.5" ry="4" fill="#1B1F24" />
      <Limb points={p.arms[0]} color={skin} width={7} />
      <Limb points={p.arms[0]} color={shade} width={7} />
      {/* front leg */}
      <Limb points={p.legs[1]} color={skin} width={9} />
      <ellipse cx={foot(p.legs[1])[0] + 3} cy={foot(p.legs[1])[1] + 1} rx="7.5" ry="4" fill="#1B1F24" />
      {/* body */}
      <rect x="-6" y="-102" width="12" height="10" rx="3" fill={skin} />
      <rect x="-15" y="-96" width="30" height="46" rx="10" fill={jersey} />
      <rect x="-16" y="-57" width="32" height="18" rx="6" fill={shorts} />
      {number && (
        <text x="0" y="-66" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="inherit"
          transform={flip ? 'scale(-1 1)' : undefined}>
          {number}
        </text>
      )}
      {/* front arm + head */}
      <Limb points={p.arms[1]} color={skin} width={7} />
      <circle cx="0" cy="-112" r="12" fill={skin} />
      <path d="M -12 -113 a 12 12 0 0 1 24 0 q -12 -5 -24 0 z" fill="#1B1F24" />
    </g>
  );
}

function SoccerBall({ x, y, r = 11 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#fff" stroke="#1B1F24" strokeWidth="1.5" />
      <polygon points={pts([[0, -r * 0.42], [r * 0.4, -r * 0.13], [r * 0.25, r * 0.36], [-r * 0.25, r * 0.36], [-r * 0.4, -r * 0.13]])} fill="#1B1F24" />
    </g>
  );
}

function Basketball({ x, y, r = 15 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#FF7A1A" />
      <path d={`M ${-r} 0 H ${r} M 0 ${-r} V ${r}`} stroke="#7A3300" strokeWidth="1.6" />
      <path d={`M ${-r * 0.7} ${-r * 0.7} q ${r * 0.55} ${r * 0.7} 0 ${r * 1.4} M ${r * 0.7} ${-r * 0.7} q ${-r * 0.55} ${r * 0.7} 0 ${r * 1.4}`}
        fill="none" stroke="#7A3300" strokeWidth="1.6" />
    </g>
  );
}

export function FootballScene({ className }) {
  return (
    <svg className={className} viewBox="0 0 640 480" role="img" aria-label="Joueurs de football sur un terrain">
      <defs>
        <clipPath id="fb-clip"><rect width="640" height="480" rx="28" /></clipPath>
      </defs>
      <g clipPath="url(#fb-clip)">
        <rect width="640" height="480" fill="#DDF1FF" />
        <circle cx="540" cy="78" r="38" fill="#FFE08A" />
        {/* hills and stands */}
        <path d="M0 250 Q 120 190 250 235 T 520 215 T 640 230 V 300 H 0 Z" fill="#9BDDB4" />
        <rect x="0" y="252" width="640" height="34" fill="#0E1B14" opacity="0.85" />
        {Array.from({ length: 16 }, (_, i) => (
          <rect key={i} x={12 + i * 40} y="262" width="24" height="6" rx="3" fill={i % 3 === 0 ? '#FF7A1A' : '#2E4A3C'} />
        ))}
        {/* floodlights */}
        {[70, 600].map((px) => (
          <g key={px}>
            <rect x={px - 3} y="70" width="6" height="185" fill="#8AA0B4" />
            <rect x={px - 24} y="52" width="48" height="22" rx="5" fill="#2E4A3C" />
            {[-14, 0, 14].map((d) => <circle key={d} cx={px + d} cy="63" r="5" fill="#FFF6C9" />)}
          </g>
        ))}
        {/* pitch with mowing stripes */}
        <rect x="0" y="286" width="640" height="194" fill="#22B45E" />
        {[0, 2, 4, 6].map((i) => <rect key={i} x={i * 107} y="286" width="107" height="194" fill="#1EA455" />)}
        <line x1="0" y1="300" x2="640" y2="300" stroke="#fff" strokeWidth="3" opacity="0.85" />
        <line x1="320" y1="300" x2="320" y2="480" stroke="#fff" strokeWidth="3" opacity="0.85" />
        <ellipse cx="320" cy="392" rx="120" ry="34" fill="none" stroke="#fff" strokeWidth="3" opacity="0.85" />
        {/* goal */}
        <g opacity="0.95">
          {Array.from({ length: 7 }, (_, i) => (
            <line key={`v${i}`} x1={572 + i * 11} y1="218" x2={572 + i * 11} y2="356" stroke="#fff" strokeWidth="1.2" opacity="0.6" />
          ))}
          {Array.from({ length: 12 }, (_, i) => (
            <line key={`h${i}`} x1="566" y1={226 + i * 11} x2="640" y2={226 + i * 11} stroke="#fff" strokeWidth="1.2" opacity="0.6" />
          ))}
          <rect x="560" y="212" width="8" height="146" rx="3" fill="#fff" />
          <rect x="560" y="212" width="80" height="8" rx="3" fill="#fff" />
        </g>
        {/* players */}
        <Player x={150} y={340} scale={0.7} pose="run" jersey="#FF7A1A" shorts="#0E1B14" skin="#8D5A3B" />
        <Player x={470} y={402} scale={1.08} flip pose="run" jersey="#2B59C3" shorts="#fff" skin="#4A2C1A" number="4" />
        <Player x={290} y={430} scale={1.28} pose="kick" jersey="#FF7A1A" shorts="#0E1B14" skin="#6B4226" number="10" />
        {/* ball flight */}
        <path d="M 350 392 Q 420 320 506 300" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
        <SoccerBall x={514} y={298} r={12} />
      </g>
    </svg>
  );
}

export function BasketballScene({ className }) {
  return (
    <svg className={className} viewBox="0 0 640 480" role="img" aria-label="Joueur de basketball qui tire au panier">
      <defs>
        <clipPath id="bb-clip"><rect width="640" height="480" rx="28" /></clipPath>
      </defs>
      <g clipPath="url(#bb-clip)">
        <rect width="640" height="480" fill="#FFE9D6" />
        {/* wall panels */}
        {[40, 170, 300].map((px) => <rect key={px} x={px} y="46" width="100" height="150" rx="14" fill="#FFF6EE" />)}
        <rect x="0" y="300" width="640" height="34" fill="#12A150" />
        {/* wooden floor */}
        <rect x="0" y="334" width="640" height="146" fill="#E9A25F" />
        {[364, 398, 436].map((py) => <line key={py} x1="0" y1={py} x2="640" y2={py} stroke="#D98C45" strokeWidth="2" />)}
        {[[90, 334, 364], [260, 364, 398], [130, 398, 436], [330, 436, 480], [520, 334, 364]].map(([px, a, b]) => (
          <line key={`${px}-${a}`} x1={px} y1={a} x2={px} y2={b} stroke="#D98C45" strokeWidth="2" />
        ))}
        {/* paint + court lines */}
        <polygon points="430,334 640,334 640,430 390,430" fill="#F28C3B" />
        <polyline points="430,334 390,430" fill="none" stroke="#fff" strokeWidth="4" />
        <line x1="390" y1="430" x2="640" y2="430" stroke="#fff" strokeWidth="4" />
        <ellipse cx="410" cy="382" rx="44" ry="20" fill="none" stroke="#fff" strokeWidth="4" />
        <path d="M 0 470 Q 180 330 380 340" fill="none" stroke="#fff" strokeWidth="4" />
        {/* hoop */}
        <rect x="602" y="118" width="12" height="216" rx="4" fill="#33424F" />
        <rect x="552" y="150" width="56" height="9" rx="3" fill="#33424F" />
        <rect x="540" y="96" width="14" height="104" rx="4" fill="#fff" stroke="#33424F" strokeWidth="3" />
        <polyline points="482,192 490,232 498,194 506,234 514,194 522,232 530,192" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
        <line x1="488" y1="214" x2="526" y2="214" stroke="#fff" strokeWidth="2" />
        <ellipse cx="506" cy="190" rx="28" ry="6" fill="none" stroke="#FF5A1F" strokeWidth="5" />
        {/* players */}
        <Player x={470} y={446} scale={1.2} flip pose="defend" jersey="#2B59C3" shorts="#fff" skin="#4A2C1A" number="7" />
        <Player x={330} y={428} scale={1.38} pose="shoot" jersey="#12A150" shorts="#0B7A3B" skin="#6B4226" number="23" />
        {/* ball flight */}
        <path d="M 342 236 Q 410 100 496 168" fill="none" stroke="#C25A12" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
        <Basketball x={420} y={132} r={16} />
      </g>
    </svg>
  );
}
