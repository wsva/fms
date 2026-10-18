'use client';

/**
 * The dataset tile used by every dataset-picker grid (Cards, Wiki, Dictation,
 * Read a Book). Mirrors the app's CardsPage dataset card exactly — same box,
 * same visibility-chip colors, same type scale — so the pickers read as the
 * app's own. The app's `hover:border-accent-blue/40` is a dead utility there
 * (no accent-blue token exists in either codebase); the website resolves it to
 * the real accent token.
 */

export type DatasetCardProps = {
    name: string;
    description?: string | null;
    /** Catalog visibility string: 'public' | 'shared' | 'private' (rendered verbatim). */
    visibility: string;
    /** Small count line under the description, e.g. "12 cards" / "34 files". */
    footer?: string;
    onClick: () => void;
};

export function visibilityChipClass(visibility: string): string {
    return visibility === 'public'
        ? 'bg-green-500/10 text-green-600'
        : visibility === 'shared'
            ? 'bg-amber-500/10 text-amber-600'
            : 'bg-mid-gray/20 text-text-tertiary';
}

export default function DatasetCard({ name, description, visibility, footer, onClick }: DatasetCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-left p-4 rounded-xl border border-border-default bg-bg-card hover:border-accent/40 transition-colors cursor-pointer flex flex-col gap-1"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{name}</span>
                <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${visibilityChipClass(visibility)}`}
                >
                    {visibility}
                </span>
            </div>
            {description && (
                <p className="text-xs text-text-secondary line-clamp-2">{description}</p>
            )}
            {footer && <span className="text-xs text-text-tertiary">{footer}</span>}
        </button>
    );
}
