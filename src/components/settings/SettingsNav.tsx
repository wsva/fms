'use client';

import type { ComponentType } from 'react';
import { LayoutGrid } from 'lucide-react';

// ---------------------------------------------------------------------------
// Settings section navigation, styled after the desktop app's SettingsPage
// section sidebar (the CollapsibleSidebar nav): a "Sections" label above icon
// buttons, active = bg-bg-hover + text-text-primary, inactive = text-secondary
// with a hover wash.
//
// The website settings page lives inside the shared AppShell (global Sidebar +
// TopBar) and body-scrolls, so this renders as a sticky left column on desktop
// and a horizontally scrollable chip row below `lg` — no second scroll region,
// and the shell's ThemeSelector/breadcrumb stay available.
// ---------------------------------------------------------------------------

export type SettingsSection = {
    id: string;
    label: string;
    icon: ComponentType<{ size?: number; className?: string }>;
};

export default function SettingsNav({
    sections,
    active,
    onSelect,
}: {
    sections: SettingsSection[];
    active: string;
    onSelect: (id: string) => void;
}) {
    const items: SettingsSection[] = [
        { id: 'all', label: 'All', icon: LayoutGrid },
        ...sections,
    ];

    return (
        <nav
            className="flex gap-1 overflow-x-auto p-2 bg-bg-card border border-border-default rounded-xl lg:flex-col lg:overflow-visible lg:sticky lg:top-16 lg:self-start lg:w-56 lg:shrink-0"
        >
            <div className="hidden lg:block text-xs font-semibold text-text-tertiary uppercase tracking-wide px-2 pt-1 pb-2 mb-1 border-b border-border-light">
                Sections
            </div>
            {items.map((s) => {
                const Icon = s.icon;
                const isActive = active === s.id;
                return (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelect(s.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left cursor-pointer transition-colors whitespace-nowrap shrink-0 ${isActive
                            ? 'bg-bg-hover text-text-primary font-medium'
                            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                            }`}
                    >
                        <Icon size={15} className="shrink-0" />
                        <span className="truncate">{s.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
