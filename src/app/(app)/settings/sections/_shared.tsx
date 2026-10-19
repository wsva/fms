'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Shared primitives for the settings page.
//
// These mirror the desktop app's SettingsPage (src/components/settings/
// SettingsPage.tsx) so the website settings match it visually: same section
// header (h2 + description), same button/field class fragments, same inline
// "Saved!" feedback.
//
// Only theme-aware tokens are used (bg-bg-*, text-text-*, border-border-*,
// accent-*, success/error). HeroUI component variants are deliberately avoided
// here: they render from HeroUI's own palette and do NOT follow the app's
// data-theme switching (solarized/gruvbox would show foreign colors), whereas
// these Tailwind utilities live in @layer utilities and resolve via globals.css.
// ---------------------------------------------------------------------------

export const btnPrimary =
    'px-4 py-2 rounded-md font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-accent-bg text-white hover:bg-accent-bg-hover';

export const btnGhost =
    'px-3 py-1.5 text-xs rounded-md border border-border-light hover:bg-bg-hover cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const inputCls =
    'w-full max-w-md px-3 py-2 border border-border-light rounded-md bg-bg-input text-text-primary focus:outline-none focus:border-accent';

/**
 * Always-visible settings section: an h2 title with an optional right-aligned
 * action slot (Save button + "Saved!" label), an optional description, then the
 * controls. Section filtering (All vs. one) is handled by the page shell, which
 * wraps each section in a `hidden`-toggled container rather than unmounting it,
 * so form state survives switching sections — same as the app.
 */
export function Section({
    title,
    description,
    action,
    children,
}: {
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="mb-8">
            <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-[1.3em] font-semibold text-text-primary">{title}</h2>
                {action ? <div className="flex items-center gap-2">{action}</div> : null}
            </div>
            {description ? (
                <p className="text-text-secondary text-sm mb-4">{description}</p>
            ) : null}
            {children}
        </section>
    );
}

/** Inline "Saved!" flash, matching the app's per-section save feedback. */
export function useSavedFlag(timeout = 2000) {
    const [saved, setSaved] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flash = useCallback(() => {
        setSaved(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setSaved(false), timeout);
    }, [timeout]);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    return [saved, flash] as const;
}

export function SavedLabel({ saved }: { saved: boolean }) {
    return saved ? <span className="text-sm text-success-text">Saved!</span> : null;
}

/** Small inline error line, shown when a save/load fails. */
export function ErrorNote({ message }: { message: string }) {
    return message ? <p className="text-sm text-error-text mt-2">{message}</p> : null;
}
