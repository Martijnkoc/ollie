/** Hand-made vector illustration: two people in a videodate with a twenty-minute timer. Decorative. */
export function HeroIllustration() {
  return (
    <svg className="illustration" viewBox="0 0 480 400" role="img" aria-labelledby="hero-ill-title">
      <title id="hero-ill-title">Illustratie: twee mensen in een videogesprek met een timer van twintig minuten</title>
      <rect x="20" y="30" width="440" height="300" rx="28" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <rect x="44" y="56" width="190" height="230" rx="20" fill="#4a1f45" />
      <rect x="246" y="56" width="190" height="230" rx="20" fill="#efe5d6" />
      {/* left person */}
      <circle cx="139" cy="150" r="38" fill="#e9c9a8" />
      <path d="M101 140c4-30 24-44 44-42 22 2 36 18 34 44-10-14-26-22-44-20-14 2-26 8-34 18z" fill="#2a1529" />
      <path d="M79 286c4-52 30-80 60-80s56 28 60 80z" fill="#d4ec7c" />
      {/* right person */}
      <circle cx="341" cy="150" r="38" fill="#c8946c" />
      <path d="M303 150c-6-36 14-56 40-56 28 0 44 22 36 58-6-10-12-18-20-22-18 6-38 8-56 20z" fill="#5f2a59" />
      <path d="M281 286c4-52 30-80 60-80s56 28 60 80z" fill="#4a1f45" />
      {/* timer */}
      <rect x="186" y="304" width="108" height="44" rx="22" fill="#d4ec7c" />
      <text x="240" y="333" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="20" fill="#22101f">
        20:00
      </text>
      {/* speech marks */}
      <circle cx="420" cy="34" r="22" fill="#d4ec7c" />
      <path d="M410 30h20M410 38h12" stroke="#22101f" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
