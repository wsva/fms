'use client';

import { addToast, Button, Checkbox, CheckboxGroup } from "@heroui/react";
import { useState, useEffect } from 'react';
import { MdOutlineSave } from 'react-icons/md';
import { getKey, setKey } from '@/app/actions/settings_general';
import { getTagAll } from '@/app/actions/card';
import { settings_tag } from "@/generated/prisma/client";
import Section from './section';

export default function DefaultCardTagsSetting({ user_id }: { user_id: string }) {
    const [tagList, setTagList] = useState<settings_tag[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        Promise.all([
            getTagAll(user_id),
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
            addToast({ title: 'Saved', color: 'success' });
        } else {
            addToast({ title: 'Failed to save', color: 'danger' });
        }
        setSaving(false);
    };

    return (
        <Section title="Default Tags of New Cards">
            <p className="text-xs text-foreground-400">Tags applied automatically when creating a new card without a tag pre-selected via URL.</p>
            <CheckboxGroup
                color="success"
                value={selected}
                onValueChange={setSelected}
                orientation="horizontal"
            >
                {tagList.map(t => (
                    <Checkbox key={t.uuid} value={t.uuid}>{t.tag}</Checkbox>
                ))}
            </CheckboxGroup>
            {tagList.length === 0 && (
                <p className="text-sm text-foreground-400">No tags found.</p>
            )}
            <div className="flex justify-end">
                <Button variant="bordered" size="sm" isLoading={saving}
                    startContent={!saving && <MdOutlineSave size={16} />}
                    onPress={save}
                >
                    Save
                </Button>
            </div>
        </Section>
    );
}
