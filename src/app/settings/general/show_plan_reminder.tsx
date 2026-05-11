'use client';

import { toast, Switch, Label } from "@heroui/react";
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
            toast.danger('Failed to save');
            setEnabled(!value);
        }
    };

    return (
        <Section title="Show Reminder of Plans">
            <Switch isSelected={enabled} onChange={toggle}>
                <Switch.Control>
                    <Switch.Thumb />
                </Switch.Control>
                <Switch.Content>
                    <Label>Show the plan reminder popup on the home page</Label>
                </Switch.Content>
            </Switch>
        </Section>
    );
}
