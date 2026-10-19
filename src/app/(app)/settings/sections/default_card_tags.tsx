'use client';

import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import type { dataset_tag } from '@/generated/prisma/client';
import TagSelector from '@/components/datasets/TagSelector';
import { Section, btnPrimary, useSavedFlag, SavedLabel, ErrorNote } from './_shared';

export default function DefaultCardTagsSection({ user_id }: { user_id: string }) {
    const [stateTagSelected, setStateTagSelected] = useState<Map<string, dataset_tag | null>>(new Map());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, flashSaved] = useSavedFlag();

    useEffect(() => {
        getKey('default_card_tags').then(savedTags => {
            if (savedTags) {
                const next: Map<string, dataset_tag | null> = new Map();
                savedTags.split(',').forEach(uuid => next.set(uuid, null));
                setStateTagSelected(next);
            }
        });
    }, [user_id]);

    const save = async () => {
        setSaving(true);
        setError('');
        const result = await setKey('default_card_tags', Array.from(stateTagSelected.keys()).join(','));
        if (result.status === 'success') {
            flashSaved();
        } else {
            setError('Failed to save.');
        }
        setSaving(false);
    };

    return (
        <Section
            title="Default Tags of New Cards"
            description="Tags applied automatically when creating a new card without a tag pre-selected via URL."
            action={
                <>
                    <SavedLabel saved={saved} />
                    <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </>
            }
        >
            <TagSelector user_id={user_id} scope="card" selectionMode="multiple" hideSelector={false} readOnly={false}
                stateSelected={stateTagSelected} setStateSelected={setStateTagSelected}
            />
            <ErrorNote message={error} />
        </Section>
    );
}
