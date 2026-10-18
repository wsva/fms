'use client';

import { Rss } from 'lucide-react';

/**
 * The app's microphone glyph: lucide's `Rss` rotated 45deg clockwise around its
 * center, ported from learning/fms-app/src/components/voice/MicGlyph.tsx so the
 * Read Aloud entry reads the same in both.
 */
export default function MicGlyph({ size, className = '' }: { size?: number; className?: string }) {
    return <Rss size={size} className={`rotate-45 origin-center ${className}`.trim()} />;
}
