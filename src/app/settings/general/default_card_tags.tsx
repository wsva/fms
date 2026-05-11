'use client';

import { toast, Button, Checkbox, CheckboxGroup, Label } from "@heroui/react";
import { useState, useEffect } from 'react';
import { getKey, setKey } from '@/app/actions/settings_general';
import { getTagAllOwned } from '@/app/actions/dataset';
import { dataset_tag } from "@/generated/prisma/client";
import Section from './section';

export default function DefaultCardTagsSetting({ user_id }: { user_id: string }) {
    const [tagList, setTagList] = useState<dataset_tag[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        Promise.all([
            getTagAllOwned(user_id, "card"),
            getKey('default_card_tags'),
        ]).then(([tagsResult, savedTags]) => {
            if (tagsResult.status === 'success') setTagList(tagsResult.data);
            if (savedTags) setSelected(savedTags.split(',').filter(Boolean));
        });
    }, [user_id]);

    const save = async () => {
        setSaving(true);
        const result = await setKey('default_card_tags', selected.join(','));
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
            <CheckboxGroup
                value={selected}
                onChange={(v) => setSelected(v)}
                className="flex flex-row flex-wrap gap-2"
            >
                {tagList.map(t => (
                    <Checkbox key={t.uuid} value={t.uuid}>
                        <Checkbox.Control>
                            <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Checkbox.Content>
                            <Label>{t.tag}</Label>
                        </Checkbox.Content>
                    </Checkbox>
                ))}
            </CheckboxGroup>
            {tagList.length === 0 && (
                <p className="text-sm text-foreground-400">No tags found.</p>
            )}
            <div className="flex justify-end">
                <Button variant="primary" size="sm" isDisabled={saving} onPress={save}>
                    Save
                </Button>
            </div>
        </Section>
    );
}
