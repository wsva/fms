'use client';

import { addToast, Button, Input } from "@heroui/react";
import { useState } from 'react';
import { MdOutlineSave } from 'react-icons/md';
import { setKey } from '@/app/actions/settings_general';

type Props = {
    user_id: string;
    initialLocalService: string;
};

export default function Page({ initialLocalService }: Props) {
    const [localService, setLocalService] = useState(initialLocalService);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        const result = await setKey('local_service', localService);
        if (result.status === 'success') {
            addToast({ title: 'Saved', color: 'success' });
        } else {
            addToast({ title: 'Failed to save', color: 'danger' });
        }
        setSaving(false);
    };

    return (
        <div className="flex flex-col gap-8 py-6 px-4 md:px-0 max-w-xl">
            <div className="border-b-2 border-sand-300 pb-4">
                <h1 className="text-2xl font-semibold text-sand-900">General</h1>
                <p className="text-sm text-foreground-500 mt-1">General settings</p>
            </div>

            <div className="flex flex-col gap-3">
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground-400 mb-1">Local Service</h2>
                    <p className="text-xs text-foreground-400 mb-2">Local address of data sets and Speech-to-Text services, for example: http://localhost:8080</p>
                </div>
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
            </div>
        </div>
    );
}
