'use client';

import { toast, Button, Input, TextField } from "@heroui/react";
import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import Section from './section';

export default function LocalServiceSetting() {
    const [localService, setLocalService] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getKey('local_service').then(v => { if (v) setLocalService(v); });
    }, []);

    const save = async () => {
        setSaving(true);
        const result = await setKey('local_service', localService);
        if (result.status === 'success') {
            toast.success('Saved');
            window.dispatchEvent(new CustomEvent('local-service-changed', { detail: localService }));
        } else {
            toast.danger('Failed to save');
        }
        setSaving(false);
    };

    return (
        <Section title="Local Service">
            <p className="text-xs text-foreground-400">Local address of data sets and Speech-to-Text services, for example: http://localhost:8080</p>
            <div className="flex gap-2 items-end">
                <TextField className="flex-1">
                    <Input
                        className="bg-sand-100 border border-sand-300"
                        value={localService}
                        type="text"
                        onChange={e => setLocalService(e.target.value)}
                    />
                </TextField>
                <Button variant="primary" size="sm" isDisabled={saving} onPress={save}>
                    Save
                </Button>
            </div>
        </Section>
    );
}
