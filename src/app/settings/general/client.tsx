'use client';

import { addToast, Button, Input } from "@heroui/react";
import { useState } from 'react';
import { MdOutlineSave, MdOutlineVisibility, MdOutlineVisibilityOff } from 'react-icons/md';
import { setKey } from '@/app/actions/settings_general';

type Props = {
    user_id: string;
    initialGeminiKey: string;
    initialOpenaiKey: string;
};

function KeyField({ label, value, onChange, onSave, saving }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onSave: () => void;
    saving: boolean;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="flex gap-2 items-end">
            <Input
                label={label}
                value={value}
                type={visible ? 'text' : 'password'}
                onChange={e => onChange(e.target.value)}
                classNames={{ inputWrapper: "bg-sand-100 border border-sand-300", base: "flex-1" }}
                endContent={
                    <button type="button" className="text-foreground-400 hover:text-foreground-600" onClick={() => setVisible(v => !v)}>
                        {visible ? <MdOutlineVisibilityOff size={18} /> : <MdOutlineVisibility size={18} />}
                    </button>
                }
            />
            <Button variant="bordered" size="md" isLoading={saving}
                startContent={!saving && <MdOutlineSave size={16} />}
                onPress={onSave}
                className="mb-0.5"
            >
                Save
            </Button>
        </div>
    );
}

export default function Page({ initialGeminiKey, initialOpenaiKey }: Props) {
    const [geminiKey, setGeminiKey] = useState(initialGeminiKey);
    const [openaiKey, setOpenaiKey] = useState(initialOpenaiKey);
    const [savingGemini, setSavingGemini] = useState(false);
    const [savingOpenai, setSavingOpenai] = useState(false);

    const save = async (key: string, value: string, setLoading: (v: boolean) => void) => {
        setLoading(true);
        const result = await setKey(key, value);
        if (result.status === 'success') {
            addToast({ title: 'Saved', color: 'success' });
        } else {
            addToast({ title: 'Failed to save', color: 'danger' });
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col gap-8 py-6 px-4 md:px-0 max-w-xl">
            <div className="border-b-2 border-sand-300 pb-4">
                <h1 className="text-2xl font-semibold text-sand-900">General</h1>
                <p className="text-sm text-foreground-500 mt-1">API keys and other general settings</p>
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-400">API Keys</h2>
                <KeyField
                    label="Gemini API Key"
                    value={geminiKey}
                    onChange={setGeminiKey}
                    onSave={() => save('GEMINI_API_KEY', geminiKey, setSavingGemini)}
                    saving={savingGemini}
                />
                <KeyField
                    label="OpenAI API Key"
                    value={openaiKey}
                    onChange={setOpenaiKey}
                    onSave={() => save('OPENAI_API_KEY', openaiKey, setSavingOpenai)}
                    saving={savingOpenai}
                />
            </div>
        </div>
    );
}
