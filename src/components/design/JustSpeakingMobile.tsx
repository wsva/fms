export default function JustSpeakingMobile() {
    const teal = '#0EA89A'
    const tealLight = '#D6F5F2'
    const tealMid = '#7ADDD6'
    const yellow = '#F5C842'
    const script = { fontFamily: "'Edwardian Script ITC','Monotype Corsiva','Apple Chancery',cursive", fontStyle: 'italic' as const }

    return (
        <svg width="100%" viewBox="0 0 400 220" role="img" xmlns="http://www.w3.org/2000/svg">
            <title>Just Speaking mobile banner</title>
            <rect x="0" y="0" width="400" height="220" rx="24" fill={teal} />

            <line x1="50" y1="158" x2="350" y2="158" stroke={tealMid} strokeWidth="1" />

            <text x="200" y="118" {...script} fill="#fff" fontSize="68" textAnchor="middle">Just Speaking</text>
            <text x="200" y="183" fill={tealLight} fontFamily="sans-serif" fontWeight="400" fontSize="13" letterSpacing="2" textAnchor="middle">anytime · anything · anyone</text>

            <polygon fill={yellow} transform="translate(36,36)" points="0,-10 2.5,-2.5 10,0 2.5,2.5 0,10 -2.5,2.5 -10,0 -2.5,-2.5" />
            <polygon fill={yellow} opacity="0.8" transform="translate(364,36)" points="0,-8 2,-2 8,0 2,2 0,8 -2,2 -8,0 -2,-2" />
            <polygon fill={yellow} opacity="0.6" transform="translate(364,184)" points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2" />
        </svg>
    )
}
