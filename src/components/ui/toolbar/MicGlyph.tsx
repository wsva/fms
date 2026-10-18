"use client";

import { Rss } from "lucide-react";

type MicGlyphProps = {
  size?: number;
  width?: number;
  height?: number;
  className?: string;
};

/**
 * The app's microphone glyph: lucide's `Rss` icon rotated 45deg clockwise
 * (a positive CSS angle is clockwise) around its center. Used everywhere a
 * microphone is depicted so the metaphor stays consistent.
 *
 * Accepts the same `size` / `width` / `height` / `className` props lucide
 * icons do. Only the props that are actually set are forwarded: lucide spreads
 * caller props last, so passing an explicit `width={undefined}` would clobber
 * its computed size.
 */
export function MicGlyph({ size, width, height, className = "" }: MicGlyphProps) {
  const dims =
    width != null || height != null ? { width, height } : { size };
  return (
    <Rss {...dims} className={`rotate-45 origin-center ${className}`.trim()} />
  );
}

export default MicGlyph;
