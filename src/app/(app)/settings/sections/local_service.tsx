'use client';

import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import { Section, btnPrimary, inputCls, useSavedFlag, SavedLabel, ErrorNote } from './_shared';

export default function LocalServiceSection() {
    const [value, setValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, flashSaved] = useSavedFlag();

    useEffect(() => {
        getKey('local_service').then(v => { if (v) setValue(v); });
    }, []);

    const save = async () => {
        setSaving(true);
        setError('');
        const result = await setKey('local_service', value);
        if (result.status === 'success') {
            flashSaved();
            window.dispatchEvent(new CustomEvent('local-service-changed', { detail: value }));
        } else {
            setError('Failed to save.');
        }
        setSaving(false);
    };

    return (
        <Section
            title="Local Service"
            description="Local address of data sets and Speech-to-Text services, for example: http://localhost:8080"
            action={
                <>
                    <SavedLabel saved={saved} />
                    <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </>
            }
        >
            <input
                className={inputCls}
                type="text"
                value={value}
                placeholder="http://localhost:8080"
                onChange={e => setValue(e.target.value)}
            />
            <ErrorNote message={error} />
        </Section>
    );
}
