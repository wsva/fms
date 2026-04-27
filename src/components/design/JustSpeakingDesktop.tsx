export default function JustSpeakingDesktop() {
    const teal = '#0EA89A'
    const tealLight = '#D6F5F2'
    const tealMid = '#7ADDD6'
    const yellow = '#F5C842'
    const wave = { fill: 'none', stroke: 'rgba(255,255,255,0.22)', strokeWidth: 2.2, strokeLinecap: 'round' as const }
    const script = { fontFamily: "'Edwardian Script ITC','Monotype Corsiva','Apple Chancery',cursive", fontStyle: 'italic' as const }
    const waveLines = [
        [430, 72, 128], [455, 58, 142], [480, 68, 132], [505, 80, 120],
        [530, 62, 138], [555, 50, 150], [580, 65, 135], [605, 75, 125],
        [630, 82, 118], [655, 88, 112],
    ]

    return (
        <svg width="100%" viewBox="0 0 680 200" role="img" xmlns="http://www.w3.org/2000/svg">
            <title>Just Speaking desktop banner</title>
            <rect x="0" y="0" width="680" height="200" rx="24" fill={teal} />

            {waveLines.map(([x, y1, y2]) => (
                <line key={x} x1={x} y1={y1} x2={x} y2={y2} {...wave} />
            ))}

            <line x1="400" y1="38" x2="400" y2="162" stroke={tealMid} strokeWidth="1.2" />

            <text x="200" y="115" {...script} fill="#fff" fontSize="72" textAnchor="middle">Just Speaking</text>
            <text x="200" y="148" fill={tealLight} fontFamily="sans-serif" fontWeight="400" fontSize="13" letterSpacing="3" textAnchor="middle">anytime · anything · anyone</text>

            <polygon fill={yellow} transform="translate(42,42)" points="0,-10 2.5,-2.5 10,0 2.5,2.5 0,10 -2.5,2.5 -10,0 -2.5,-2.5" />
            <polygon fill={yellow} opacity="0.7" transform="translate(368,32)" points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2" />
            <polygon fill={yellow} opacity="0.6" transform="translate(48,168)" points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2" />
        </svg>
    )
}
