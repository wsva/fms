'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Button, Chip, Select, ListBox, Label } from '@heroui/react';
import { MdCloudUpload, MdCheck } from 'react-icons/md';
import { listMyTags } from '@/app/actions/dataset_hub';
import { VISIBILITIES } from '@/lib/datasets/info';
import { formatBytes } from '@/lib/datasets/format';
import type { dataset_tag } from '@/generated/prisma/client';

type Props = { email: string };

type UploadResult = {
    dataset: { uuid: string; name: string; dataset_type: string; visibility: string; total_bytes: string };
    version: number;
    archive_sha256: string;
    archive_size: string;
};

export default function Client({ email }: Props) {
    const router = useRouter();
    const stateFile = useRef<File | null>(null);
    const [stateName, setStateName] = useState('');
    const [stateSize, setStateSize] = useState('');
    const [stateVisibility, setStateVisibility] = useState('private');
    const [stateTags, setStateTags] = useState<dataset_tag[]>([]);
    const [stateSelected, setStateSelected] = useState<string[]>([]);
    const [stateProgress, setStateProgress] = useState(0);
    const [stateBusy, setStateBusy] = useState(false);
    const [stateResult, setStateResult] = useState<UploadResult | null>(null);
    const [stateError, setStateError] = useState('');

    useEffect(() => {
        listMyTags().then((r) => {
            if (r.status === 'success') setStateTags(r.data);
        });
    }, []);

    const onPick = (file: File | undefined) => {
        stateFile.current = file ?? null;
        setStateName(file?.name ?? '');
        setStateSize(file ? formatBytes(file.size) : '');
        setStateResult(null);
        setStateError('');
    };

    const submit = async () => {
        const file = stateFile.current;
        if (!file) {
            toast.warning('Choose a dataset archive (.tar.gz) first');
            return;
        }
        setStateBusy(true);
        setStateError('');
        setStateProgress(0);

        const form = new FormData();
        form.set('file', file);
        form.set('visibility', stateVisibility);
        if (stateSelected.length > 0) form.set('tag_uuids', stateSelected.join(','));

        await new Promise<void>((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/dataset/upload');
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) setStateProgress(Math.round((event.loaded / event.total) * 100));
            };
            xhr.onload = () => {
                let parsed: Record<string, unknown>;
                try {
                    parsed = JSON.parse(xhr.responseText) as Record<string, unknown>;
                } catch {
                    parsed = {};
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    setStateProgress(100);
                    setStateResult(parsed as unknown as UploadResult);
                    toast.success(`Uploaded v${parsed.version}`);
                } else {
                    setStateError(String(parsed.error ?? `upload failed (${xhr.status})`));
                    toast.danger('Upload failed');
                }
                resolve();
            };
            xhr.onerror = () => {
                setStateError('Network error — the upload did not reach the server');
                toast.danger('Upload failed');
                resolve();
            };
            xhr.send(form);
        });

        setStateBusy(false);
    };

    return (
        <div className="flex flex-col w-full mx-auto gap-6 py-8 px-4 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Upload a dataset</h1>
                <p className="text-sm text-foreground-500 mt-0.5">
                    A dataset directory packed as tar.gz — <code>info.json</code> plus its media, waveform and
                    <code>data.sqlite3</code>.
                </p>
            </div>

            {!email && <p className="text-sm text-danger-500">Sign in to upload a dataset.</p>}

            <div className="flex flex-col gap-4 bg-sand-100 border border-sand-300 rounded-xl px-5 py-4">
                <label className="flex flex-col gap-2">
                    <span className="text-sm text-foreground-600">Archive (.tar.gz)</span>
                    <input
                        type="file"
                        accept=".tar.gz,.tgz,application/gzip"
                        className="text-sm"
                        onChange={(e) => onPick(e.target.files?.[0])}
                    />
                    {stateName && (
                        <span className="text-xs text-foreground-400">
                            {stateName} · {stateSize}
                        </span>
                    )}
                </label>

                <Select
                    className="w-full"
                    value={stateVisibility}
                    onChange={(v) => setStateVisibility(v ? String(v) : 'private')}
                >
                    <Label>Visibility (new datasets only)</Label>
                    <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                        <ListBox>
                            {VISIBILITIES.map((v) => (
                                <ListBox.Item id={v} key={v} textValue={v}>
                                    {v}
                                </ListBox.Item>
                            ))}
                        </ListBox>
                    </Select.Popover>
                </Select>

                {stateTags.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <span className="text-sm text-foreground-600">Tags (grouping only)</span>
                        <div className="flex gap-1.5 flex-wrap">
                            {stateTags.map((tag) => {
                                const checked = stateSelected.includes(tag.uuid);
                                return (
                                    <Chip
                                        key={tag.uuid}
                                        size="sm"
                                        variant={checked ? 'primary' : 'secondary'}
                                        className="cursor-pointer select-none"
                                        onClick={() =>
                                            setStateSelected((prev) =>
                                                checked ? prev.filter((u) => u !== tag.uuid) : [...prev, tag.uuid]
                                            )
                                        }
                                    >
                                        {tag.tag}
                                    </Chip>
                                );
                            })}
                        </div>
                    </div>
                )}

                {stateBusy && (
                    <div className="h-1.5 w-full rounded bg-sand-300 overflow-hidden">
                        <div className="h-full bg-primary-500 transition-all" style={{ width: `${stateProgress}%` }} />
                    </div>
                )}

                {stateError && <p className="text-sm text-danger-500 break-words">{stateError}</p>}

                <Button
                    size="sm"
                    variant="primary"
                    className="self-start"
                    isDisabled={!email || !stateName}
                    isPending={stateBusy}
                    onPress={submit}
                >
                    {!stateBusy && <MdCloudUpload size={16} />}
                    Upload
                </Button>
            </div>

            {stateResult && (
                <div className="flex flex-col gap-2 bg-success-50 border border-success-200 rounded-xl px-5 py-4">
                    <div className="flex items-center gap-2">
                        <MdCheck size={18} className="text-success-500" />
                        <span className="text-sm font-semibold text-foreground">
                            {stateResult.dataset.name || stateResult.dataset.uuid} · v{stateResult.version}
                        </span>
                        <Chip size="sm" variant="tertiary">
                            {stateResult.dataset.visibility}
                        </Chip>
                    </div>
                    <div className="text-xs text-foreground-500 flex flex-wrap gap-x-3">
                        <span className="break-all">uuid: {stateResult.dataset.uuid}</span>
                        <span>type: {stateResult.dataset.dataset_type}</span>
                        <span>archive: {formatBytes(stateResult.archive_size)}</span>
                        <span className="break-all">sha256: {stateResult.archive_sha256.slice(0, 16)}…</span>
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="self-start"
                        onPress={() => router.push(`/dataset/market/${stateResult.dataset.uuid}`)}
                    >
                        Open detail
                    </Button>
                </div>
            )}

            <p className="text-xs text-foreground-400">
                Re-uploading a known uuid creates a new version and keeps the visibility you set on the website. The
                values inside <code>info.json.sharing</code> are ignored — ownership and visibility are decided here.
            </p>
        </div>
    );
}
