export default function GujaratPoliceLogo({ size = 48, style = {} }) {
  return (
    <svg
      viewBox="0 0 200 240"
      width={size}
      height={size * 1.2}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Shield shape */}
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a237e" />
          <stop offset="100%" stopColor="#0d1442" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd54f" />
          <stop offset="100%" stopColor="#f9a825" />
        </linearGradient>
      </defs>

      {/* Shield outline */}
      <path
        d="M100 8 L180 40 L180 120 Q180 200 100 232 Q20 200 20 120 L20 40 Z"
        fill="url(#shieldGrad)"
        stroke="#283593"
        strokeWidth="4"
      />

      {/* Inner shield border */}
      <path
        d="M100 16 L172 44 L172 118 Q172 194 100 224 Q28 194 28 118 L28 44 Z"
        fill="none"
        stroke="#5c6bc0"
        strokeWidth="1.5"
        opacity="0.5"
      />

      {/* Ashoka Emblem (simplified) at top */}
      <g transform="translate(100, 52)">
        {/* Capital */}
        <ellipse cx="0" cy="-8" rx="14" ry="6" fill="#c8a415" />
        <rect x="-10" y="-8" width="20" height="10" fill="#c8a415" rx="2" />
        {/* Pillar */}
        <rect x="-5" y="2" width="10" height="14" fill="#c8a415" rx="1" />
        {/* Base */}
        <rect x="-12" y="16" width="24" height="4" fill="#c8a415" rx="1" />
        {/* Lions (simplified as shapes) */}
        <circle cx="-6" cy="-14" r="4" fill="#c8a415" />
        <circle cx="6" cy="-14" r="4" fill="#c8a415" />
        <circle cx="0" cy="-16" r="5" fill="#c8a415" />
      </g>

      {/* Ashoka Chakra (24 spokes) */}
      <g transform="translate(100, 115)">
        <circle cx="0" cy="0" r="32" fill="none" stroke="#90caf9" strokeWidth="2.5" />
        <circle cx="0" cy="0" r="6" fill="#90caf9" />
        <circle cx="0" cy="0" r="3" fill="#1a237e" />
        {/* 24 spokes */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 15 * Math.PI) / 180;
          const x1 = Math.cos(angle) * 6;
          const y1 = Math.sin(angle) * 6;
          const x2 = Math.cos(angle) * 30;
          const y2 = Math.sin(angle) * 30;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#90caf9"
              strokeWidth="1.2"
            />
          );
        })}
      </g>

      {/* Tricolor wings - Left (saffron, white, green) */}
      <g transform="translate(100, 115)">
        {/* Left saffron */}
        <path d="M-38 -15 Q-55 -5 -42 15 Q-35 5 -38 -15Z" fill="#ff9933" opacity="0.9" />
        {/* Left white */}
        <path d="M-40 0 Q-58 12 -42 28 Q-35 18 -40 0Z" fill="#ffffff" opacity="0.9" />
        {/* Left green */}
        <path d="M-38 18 Q-52 30 -38 42 Q-30 32 -38 18Z" fill="#138808" opacity="0.9" />

        {/* Right saffron */}
        <path d="M38 -15 Q55 -5 42 15 Q35 5 38 -15Z" fill="#ff9933" opacity="0.9" />
        {/* Right white */}
        <path d="M40 0 Q58 12 42 28 Q35 18 40 0Z" fill="#ffffff" opacity="0.9" />
        {/* Right green */}
        <path d="M38 18 Q52 30 38 42 Q30 32 38 18Z" fill="#138808" opacity="0.9" />
      </g>

      {/* Banner */}
      <path
        d="M40 175 Q100 165 160 175 L155 195 Q100 185 45 195 Z"
        fill="#fdd835"
        stroke="#f9a825"
        strokeWidth="1"
      />
      {/* Banner text - Gujarati */}
      <text
        x="100"
        y="189"
        textAnchor="middle"
        fill="#1a237e"
        fontSize="14"
        fontWeight="700"
        fontFamily="sans-serif"
      >
        સેવા સુરક્ષા શાંતિ
      </text>

      {/* GUJARAT POLICE text */}
      <text
        x="100"
        y="218"
        textAnchor="middle"
        fill="#fdd835"
        fontSize="16"
        fontWeight="800"
        fontFamily="sans-serif"
        letterSpacing="2"
      >
        GUJARAT POLICE
      </text>
    </svg>
  );
}
