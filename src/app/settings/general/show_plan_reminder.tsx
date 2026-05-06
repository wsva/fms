'use client';

import { addToast, Switch } from "@heroui/react";
import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import Section from './section';

export default function ShowPlanReminderSetting() {
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        getKey('show_plan_reminder').then(v => {
            if (v !== null) setEnabled(v === 'true');
        });
    }, []);

    const toggle = async (value: boolean) => {
        setEnabled(value);
        const result = await setKey('show_plan_reminder', value ? 'true' : 'false');
        if (result.status !== 'success') {
            addToast({ title: 'Failed to save', color: 'danger' });
            setEnabled(!value);
        }
    };

    return (
        <Section title="Show Reminder of Plans">
            <Switch isSelected={enabled} onValueChange={toggle}>
                Show the plan reminder popup on the home page
            </Switch>
        </Section>
    );
}
