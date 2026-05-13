'use client';

import { toast, Button } from "@heroui/react";
import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import { dataset_tag } from "@/generated/prisma/client";
import Section from './section';
import TagSelector from "@/app/dataset/tag/selector";

export default function DefaultCardTagsSetting({ user_id }: { user_id: string }) {
    const [stateTagSelected, setStateTagSelected] = useState<Map<string, dataset_tag | null>>(new Map());
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        Promise.all([
            getKey('default_card_tags'),
        ]).then(([savedTags]) => {
            if (savedTags) {
                const next: Map<string, dataset_tag | null> = new Map()
                savedTags.split(',').forEach(uuid => next.set(uuid, null))
                setStateTagSelected(next)
            }
        });
    }, [user_id]);

    const save = async () => {
        setSaving(true);
        const result = await setKey('default_card_tags', Array.from(stateTagSelected.keys()).join(','));
        if (result.status === 'success') {
            toast.success('Saved');
        } else {
            toast.danger('Failed to save');
        }
        setSaving(false);
    };

    return (
        <Section title="Default Tags of New Cards">
            <p className="text-xs text-foreground-400">Tags applied automatically when creating a new card without a tag pre-selected via URL.</p>
            <TagSelector user_id={user_id} scope="card" selectionMode="multiple" hideSelector={false} readOnly={false}
                stateSelected={stateTagSelected} setStateSelected={setStateTagSelected}
            />
            <div className="flex justify-end">
                <Button variant="primary" size="sm" isDisabled={saving} onPress={save}>
                    Save
                </Button>
            </div>
        </Section>
    );
}
