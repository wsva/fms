export default function NavIcon({ size = 40 }: { size?: number }) {
    const teal = '#0EA89A'
    const tealLight = '#D6F5F2'
    const tealMid = '#A8E8E3'
    const yellow = '#F5C842'
    const stroke = { fill: 'none', stroke: teal, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
    const script = { fontFamily: "'Edwardian Script ITC','Monotype Corsiva','Apple Chancery',cursive", fontWeight: 400, fontStyle: 'italic' as const }

    return (
        <svg width={size} height={size} viewBox="0 0 680 680" xmlns="http://www.w3.org/2000/svg">
            <circle cx="340" cy="340" r="300" fill={teal} />

            {/* Main speech bubble */}
            <rect x="120" y="190" width="400" height="235" rx="36" fill="#fff" />
            <polygon fill="#fff" points="220,423 190,492 310,423" />

            {/* Small smiley bubble */}
            <rect x="472" y="162" width="115" height="76" rx="20" fill={tealLight} />
            <polygon fill={tealLight} points="482,236 472,272 524,236" />
            <circle fill={teal} cx="504" cy="196" r="5.5" />
            <circle fill={teal} cx="534" cy="196" r="5.5" />
            <path {...stroke} strokeWidth="7" d="M496 216 Q519 236 542 216" />

            {/* Fremdsprachen */}
            <text x="320" y="275" {...script} fill={teal} fontSize="44" textAnchor="middle">Fremdsprachen</text>
            <line x1="155" y1="288" x2="485" y2="288" stroke={tealMid} strokeWidth="1.2" />

            {/* Icon 1: ear */}
            <circle cx="185" cy="355" r="27" fill={tealLight} />
            <path {...stroke} strokeWidth="2.2" d="M178 348 Q178 338 185 338 Q196 338 196 350 Q196 358 190 360 Q190 364 185 364 Q181 364 181 361" />
            <path {...stroke} strokeWidth="2.2" d="M183 352 Q183 345 188 345 Q193 345 193 352 Q193 357 189 358" />

            {/* Icon 2: speech + waveform */}
            <circle cx="268" cy="355" r="27" fill={tealLight} />
            <path {...stroke} strokeWidth="2.2" fill="#fff" d="M255 344 Q255 338 268 338 Q281 338 281 344 L281 358 Q281 364 268 364 L261 364 L257 370 L259 364 Q255 364 255 358 Z" />
            <line stroke={teal} strokeWidth="2" strokeLinecap="round" x1="262" y1="348" x2="262" y2="358" />
            <line stroke={teal} strokeWidth="2" strokeLinecap="round" x1="266" y1="345" x2="266" y2="361" />
            <line stroke={teal} strokeWidth="2" strokeLinecap="round" x1="270" y1="349" x2="270" y2="357" />
            <line stroke={teal} strokeWidth="2" strokeLinecap="round" x1="274" y1="352" x2="274" y2="354" />

            {/* Icon 3: diary */}
            <circle cx="352" cy="355" r="27" fill={tealLight} />
            <rect x="337" y="337" width="26" height="32" rx="3" fill="#fff" stroke={teal} strokeWidth="2.2" />
            <rect x="337" y="337" width="5" height="32" rx="2" fill={teal} />
            <line stroke={teal} strokeWidth="1.4" strokeLinecap="round" x1="346" y1="343" x2="360" y2="343" />
            <line stroke={teal} strokeWidth="1.4" strokeLinecap="round" x1="346" y1="348" x2="360" y2="348" />
            <line stroke={teal} strokeWidth="1.4" strokeLinecap="round" x1="346" y1="353" x2="360" y2="353" />
            <line stroke={teal} strokeWidth="1.4" strokeLinecap="round" x1="346" y1="358" x2="354" y2="358" />
            <polygon fill={teal} opacity="0.85" points="358,337 363,337 363,348 360.5,345 358,348" />

            {/* Icon 4: flashcard */}
            <circle cx="435" cy="355" r="27" fill={tealLight} />
            <rect x="424" y="341" width="22" height="16" rx="3" transform="rotate(-8 435 349)" fill={tealMid} stroke={teal} strokeWidth="2.2" />
            <rect x="425" y="348" width="22" height="16" rx="3" fill="#fff" stroke={teal} strokeWidth="2.2" />
            <text x="436" y="360" fill={teal} fontFamily="sans-serif" fontWeight="500" fontSize="10" textAnchor="middle">A?</text>

            {/* Stars */}
            <polygon fill={yellow} opacity="0.7" transform="translate(148,458)" points="0,-8 2,-2 8,0 2,2 0,8 -2,2 -8,0 -2,-2" />
            <polygon fill={yellow} opacity="0.9" transform="translate(525,463)" points="0,-10 2.5,-2.5 10,0 2.5,2.5 0,10 -2.5,2.5 -10,0 -2.5,-2.5" />

            {/* machen Spaß */}
            <text x="400" y="470" {...script} fill="#fff" fontSize="28" textAnchor="middle">machen Spaß</text>

            {/* Top sparkle */}
            <polygon fill={yellow} transform="translate(130,198)" points="0,-14 3,-3 14,0 3,3 0,14 -3,3 -14,0 -3,-3" />
        </svg>
    )
}
