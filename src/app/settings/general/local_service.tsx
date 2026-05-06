'use client';

import { addToast, Button, Input } from "@heroui/react";
import { useState, useEffect } from 'react';
import { MdOutlineSave } from 'react-icons/md';
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
            addToast({ title: 'Saved', color: 'success' });
            window.dispatchEvent(new CustomEvent('local-service-changed', { detail: localService }));
        } else {
            addToast({ title: 'Failed to save', color: 'danger' });
        }
        setSaving(false);
    };

    return (
        <Section title="Local Service">
            <p className="text-xs text-foreground-400">Local address of data sets and Speech-to-Text services, for example: http://localhost:8080</p>
            <div className="flex gap-2 items-end">
                <Input
                    label="Local service"
                    value={localService}
                    type="text"
                    onChange={e => setLocalService(e.target.value)}
                    classNames={{ inputWrapper: "bg-sand-100 border border-sand-300", base: "flex-1" }}
                />
                <Button variant="bordered" size="md" isLoading={saving}
                    startContent={!saving && <MdOutlineSave size={16} />}
                    onPress={save}
                    className="mb-0.5"
                >
                    Save
                </Button>
            </div>
        </Section>
    );
}
