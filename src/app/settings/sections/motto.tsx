'use client';

import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import { Section, btnPrimary, inputCls, useSavedFlag, SavedLabel, ErrorNote } from './_shared';

export default function MottoSection() {
    const [motto, setMotto] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, flashSaved] = useSavedFlag();

    useEffect(() => {
        getKey('motto').then(v => { if (v) setMotto(v); });
    }, []);

    const save = async () => {
        setSaving(true);
        setError('');
        const result = await setKey('motto', motto);
        if (result.status === 'success') {
            flashSaved();
        } else {
            setError('Failed to save.');
        }
        setSaving(false);
    };

    return (
        <Section
            title="Motto"
            description="A motivational message shown as a popup when you open the website."
            action={
                <>
                    <SavedLabel saved={saved} />
                    <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </>
            }
        >
            <textarea
                className={`${inputCls} max-w-xl resize-y`}
                value={motto}
                rows={3}
                placeholder="Enter your motto..."
                onChange={e => setMotto(e.target.value)}
            />
            <ErrorNote message={error} />
        </Section>
    );
}
