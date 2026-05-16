'use client';

import { toast, Button, TextArea } from "@heroui/react";
import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import Section from './section';

export default function MottoSetting() {
    const [motto, setMotto] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getKey('motto').then(v => { if (v) setMotto(v); });
    }, []);

    const save = async () => {
        setSaving(true);
        const result = await setKey('motto', motto);
        if (result.status === 'success') {
            toast.success('Saved');
        } else {
            toast.danger('Failed to save');
        }
        setSaving(false);
    };

    return (
        <Section title="Motto">
            <p className="text-xs text-foreground-400">A motivational message shown as a popup when you open the website.</p>
            <div className="flex flex-col gap-2">
                <TextArea
                    className="bg-sand-100 border border-sand-300"
                    value={motto}
                    rows={3}
                    placeholder="Enter your motto..."
                    onChange={e => setMotto(e.target.value)}
                />
                <div className="flex justify-end">
                    <Button variant="primary" size="sm" isDisabled={saving} onPress={save}>
                        Save
                    </Button>
                </div>
            </div>
        </Section>
    );
}
