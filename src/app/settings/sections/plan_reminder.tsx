'use client';

import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import { Section, ErrorNote } from './_shared';

export default function PlanReminderSection() {
    const [enabled, setEnabled] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        getKey('show_plan_reminder').then(v => {
            if (v !== null) setEnabled(v === 'true');
        });
    }, []);

    // Saved immediately on toggle (no separate Save button), matching the
    // original behaviour; reverts the switch if persistence fails.
    const toggle = async (value: boolean) => {
        setEnabled(value);
        setError('');
        const result = await setKey('show_plan_reminder', value ? 'true' : 'false');
        if (result.status !== 'success') {
            setError('Failed to save.');
            setEnabled(!value);
        }
    };

    return (
        <Section
            title="Show Reminder of Plans"
            description="Show the plan reminder popup on the home page."
        >
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                    checked={enabled}
                    onChange={e => toggle(e.target.checked)}
                />
                <span className="font-medium text-text-primary">Show the plan reminder popup on the home page</span>
            </label>
            <ErrorNote message={error} />
        </Section>
    );
}
