'use client';

import { useState } from 'react';
import {
    Settings as SettingsIcon,
    PanelLeftClose,
    PanelLeftOpen,
    Server,
    Quote,
    Bell,
    Tag,
    KeyRound,
    Terminal,
} from 'lucide-react';
import SettingsNav, { type SettingsSection } from '@/components/settings/SettingsNav';
import LocalServiceSection from './sections/local_service';
import MottoSection from './sections/motto';
import PlanReminderSection from './sections/plan_reminder';
import DefaultCardTagsSection from './sections/default_card_tags';
import ApiKeysSection from './sections/api_keys';
import ApiReferenceSection from './sections/api_reference';

// The page's sections double as the nav entries: picking one shows only that
// section, "All" restores the stacked view — the desktop app's SettingsPage
// model (src/components/settings/SettingsPage.tsx).
const SECTIONS: SettingsSection[] = [
    { id: 'local_service', label: 'Local Service', icon: Server },
    { id: 'motto', label: 'Motto', icon: Quote },
    { id: 'plan_reminder', label: 'Plan Reminder', icon: Bell },
    { id: 'card_tags', label: 'Default Card Tags', icon: Tag },
    { id: 'api_keys', label: 'API Keys', icon: KeyRound },
    { id: 'api_reference', label: 'API Reference', icon: Terminal },
];

export default function SettingsClient({ user_id, initial_section }: { user_id: string; initial_section?: string }) {
    // Deep link: /settings?section=api_reference opens straight on a section
    // (the nav menu and the old /settings/api route use it). The server page
    // reads and passes the param, so the SSR HTML already shows the right
    // section — no client-only flash, and no setState inside an effect.
    const [active, setActive] = useState(
        initial_section && SECTIONS.some(x => x.id === initial_section) ? initial_section : 'all'
    );
    const [navVisible, setNavVisible] = useState(true);

    // Sections stay mounted and are hidden with a class, so form state and the
    // inline "Saved!" flash survive switching between sections (app behaviour).
    const show = (id: string) => active === 'all' || active === id;

    return (
        <div className="flex flex-col gap-4">
            {/* Header bar — icon + title + section-nav toggle, matching the app. */}
            <div className="flex items-center gap-3 pb-3 border-b border-border-default">
                <h1 className="text-lg font-semibold flex items-center gap-2 text-text-primary">
                    <SettingsIcon size={20} /> Settings
                </h1>
                <button
                    type="button"
                    onClick={() => setNavVisible(v => !v)}
                    className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
                    title={navVisible ? 'Hide sections' : 'Show sections'}
                    aria-label={navVisible ? 'Hide sections' : 'Show sections'}
                    aria-expanded={navVisible}
                >
                    {navVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                </button>
            </div>

            <div className="flex gap-4 items-start">
                {navVisible && (
                    <SettingsNav sections={SECTIONS} active={active} onSelect={setActive} />
                )}

                <div className="flex-1 min-w-0">
                    <div className={show('local_service') ? '' : 'hidden'}><LocalServiceSection /></div>
                    <div className={show('motto') ? '' : 'hidden'}><MottoSection /></div>
                    <div className={show('plan_reminder') ? '' : 'hidden'}><PlanReminderSection /></div>
                    <div className={show('card_tags') ? '' : 'hidden'}><DefaultCardTagsSection user_id={user_id} /></div>
                    <div className={show('api_keys') ? '' : 'hidden'}><ApiKeysSection user_id={user_id} /></div>
                    <div className={show('api_reference') ? '' : 'hidden'}><ApiReferenceSection /></div>
                </div>
            </div>
        </div>
    );
}
