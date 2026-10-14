'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Button, Chip, ProgressCircle } from '@heroui/react';
import { MdCloudDownload, MdDelete, MdUpload } from 'react-icons/md';
import {
    listMyTags,
    listMyDatasets,
    setDatasetTags,
    setDatasetVisibility,
    setDatasetAuthority,
    deleteDatasetHub,
} from '@/app/actions/dataset_hub';
import type { DatasetJson, DatasetTagRef } from '@/lib/datasets/access';
import type { ActionResult } from '@/lib/types';
import { VISIBILITIES } from '@/lib/datasets/info';
import { formatBytes, formatStamp } from '@/lib/datasets/format';
import type { dataset_tag } from '@/generated/prisma/client';

type Props = { email: string };

type Row = DatasetJson & { journal_role: string; journal_epoch: number; tags: DatasetTagRef[] };

const LINK_BUTTON =
    'inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-sand-300 bg-sand-100 hover:bg-sand-200';

export default function Client({ email }: Props) {
    const router = useRouter();
    const [stateRows, setStateRows] = useState<Row[]>([]);
    const [stateTags, setStateTags] = useState<dataset_tag[]>([]);
    const [stateLoading, setStateLoading] = useState(true);
    const [stateBusy, setStateBusy] = useState<Set<string>>(new Set());
    const [stateEditing, setStateEditing] = useState('');
    const [stateConfirm, setStateConfirm] = useState('');
    const [stateAuthorityConfirm, setStateAuthorityConfirm] = useState('');

    useEffect(() => {
        if (!email) return;
        const load = async () => {
            const [mine, tags] = await Promise.all([listMyDatasets(), listMyTags()]);
            if (mine.status === 'success') setStateRows(mine.data);
            else toast.danger('Failed to load your datasets');
            if (tags.status === 'success') setStateTags(tags.data);
            setStateLoading(false);
        };
        load();
    }, [email]);

    const withBusy = async (uuid: string, fn: () => Promise<ActionResult<unknown>>) => {
        setStateBusy((prev) => new Set(prev).add(uuid));
        const result = await fn();
        setStateBusy((prev) => {
            const next = new Set(prev);
            next.delete(uuid);
            return next;
        });
        if (result.status !== 'success') toast.danger(String(result.error ?? 'Action failed'));
        return result.status === 'success';
    };

    const changeVisibility = async (uuid: string, visibility: string) => {
        if (await withBusy(uuid, () => setDatasetVisibility(uuid, visibility))) {
            setStateRows((prev) => prev.map((r) => (r.uuid === uuid ? { ...r, visibility } : r)));
        }
    };

    const toggleTag = async (row: Row, tag: dataset_tag) => {
        const has = row.tags.some((t) => t.uuid === tag.uuid);
        const next = has
            ? row.tags.filter((t) => t.uuid !== tag.uuid)
            : [...row.tags, { uuid: tag.uuid, name: tag.tag }];
        if (
            await withBusy(row.uuid, () =>
                setDatasetTags(
                    row.uuid,
                    next.map((t) => t.uuid)
                )
            )
        ) {
            setStateRows((prev) => prev.map((r) => (r.uuid === row.uuid ? { ...r, tags: next } : r)));
        }
    };

    const handover = async (row: Row, role: 'authority' | 'mirror') => {
        setStateBusy((prev) => new Set(prev).add(row.uuid));
        const result = await setDatasetAuthority(row.uuid, role);
        setStateBusy((prev) => {
            const next = new Set(prev);
            next.delete(row.uuid);
            return next;
        });
        setStateAuthorityConfirm('');
        if (result.status === 'success') {
            const d = result.data;
            setStateRows((prev) =>
                prev.map((r) =>
                    r.uuid === row.uuid ? { ...r, journal_role: d.journal_role, journal_epoch: d.journal_epoch } : r
                )
            );
            toast.success(d.changed ? `Authority → ${d.journal_role} · epoch ${d.journal_epoch}` : `Already ${d.journal_role}`);
        } else {
            toast.danger(String(result.error ?? 'Handover failed'));
        }
    };

    const remove = async (uuid: string) => {
        if (await withBusy(uuid, () => deleteDatasetHub(uuid))) {
            setStateRows((prev) => prev.filter((r) => r.uuid !== uuid));
            toast.success('Dataset deleted (archive kept)');
        }
        setStateConfirm('');
    };

    if (!email) {
        return <div className="py-12 px-4 text-sm text-foreground-500">Sign in to manage your datasets.</div>;
    }

    return (
        <div className="flex flex-col w-full mx-auto gap-6 py-8 px-4">
            <div className="flex items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">My Datasets</h1>
                    <p className="text-sm text-foreground-500 mt-0.5">
                        Visibility, tags and deletion — the uploaded bytes are never rewritten
                    </p>
                </div>
                <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="primary" onPress={() => router.push('/dataset/upload')}>
                        <MdUpload size={16} />
                        Upload
                    </Button>
                </div>
                {stateLoading && <ProgressCircle size="sm" aria-label="Loading" />}
            </div>

            {!stateLoading && stateRows.length === 0 && (
                <p className="text-sm text-foreground-400">You have not uploaded any dataset yet.</p>
            )}

            <div className="flex flex-col gap-3">
                {stateRows.map((row) => (
                    <div
                        key={row.uuid}
                        className="flex flex-col gap-2 bg-sand-100 border border-sand-300 rounded-xl px-5 py-4"
                    >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-semibold text-foreground break-all">
                                        {row.name || row.uuid}
                                    </span>
                                    <Chip size="sm" variant="secondary">
                                        {row.dataset_type}
                                    </Chip>
                                    <Chip size="sm" variant="tertiary">
                                        {row.visibility}
                                    </Chip>
                                    <Chip
                                        size="sm"
                                        variant={row.journal_role === 'authority' ? 'primary' : 'tertiary'}
                                        color={row.journal_role === 'authority' ? 'success' : 'default'}
                                    >
                                        {row.journal_role === 'authority' ? 'cloud authority' : 'mirror'} · e
                                        {row.journal_epoch}
                                    </Chip>
                                    {row.status !== 'ready' && (
                                        <Chip size="sm" variant="tertiary" color="warning">
                                            {row.status}
                                        </Chip>
                                    )}
                                </div>
                                <span className="text-xs text-foreground-400 break-all">
                                    {row.uuid} · {formatBytes(row.total_bytes)} · {row.file_count} files ·{' '}
                                    {row.dataset_type === 'card'
                                        ? `${row.card_count} cards`
                                        : `${row.media_count} media`}{' '}
                                    · {formatStamp(row.info_updated_at)}
                                </span>
                                {row.tags.length > 0 && (
                                    <div className="flex gap-1.5 flex-wrap mt-1">
                                        {row.tags.map((tag) => (
                                            <Chip key={tag.uuid} size="sm" variant="tertiary">
                                                {tag.name}
                                            </Chip>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 flex-wrap items-center">
                                <a
                                    className={LINK_BUTTON}
                                    href={`/api/v1/datasets/${row.uuid}/snapshot`}
                                    download={`${row.uuid}.tar.gz`}
                                >
                                    <MdCloudDownload size={14} />
                                    Download
                                </a>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onPress={() => router.push(`/dataset/market/${row.uuid}`)}
                                >
                                    Detail
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    isDisabled={stateBusy.has(row.uuid)}
                                    onPress={() => setStateEditing(stateEditing === row.uuid ? '' : row.uuid)}
                                >
                                    Tags
                                </Button>
                                {stateConfirm === row.uuid ? (
                                    <Button
                                        size="sm"
                                        variant="danger"
                                        isPending={stateBusy.has(row.uuid)}
                                        onPress={() => remove(row.uuid)}
                                    >
                                        Confirm delete
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-danger-500"
                                        isDisabled={stateBusy.has(row.uuid)}
                                        onPress={() => setStateConfirm(row.uuid)}
                                    >
                                        <MdDelete size={16} />
                                        Delete
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-1.5 flex-wrap items-center">
                            <span className="text-xs text-foreground-400">visibility:</span>
                            {VISIBILITIES.map((v) => (
                                <Chip
                                    key={v}
                                    size="sm"
                                    variant={row.visibility === v ? 'primary' : 'secondary'}
                                    className={`select-none ${stateBusy.has(row.uuid) ? '' : 'cursor-pointer'}`}
                                    onClick={() =>
                                        stateBusy.has(row.uuid) ? undefined : changeVisibility(row.uuid, v)
                                    }
                                >
                                    {v}
                                </Chip>
                            ))}
                        </div>

                        <div className="flex gap-1.5 flex-wrap items-center">
                            <span className="text-xs text-foreground-400">journal authority:</span>
                            {stateAuthorityConfirm === row.uuid ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    isPending={stateBusy.has(row.uuid)}
                                    onPress={() =>
                                        handover(row, row.journal_role === 'authority' ? 'mirror' : 'authority')
                                    }
                                >
                                    Confirm hand {row.journal_role === 'authority' ? 'back to hub' : 'to cloud'}
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    isDisabled={stateBusy.has(row.uuid)}
                                    onPress={() => setStateAuthorityConfirm(row.uuid)}
                                >
                                    {row.journal_role === 'authority' ? 'Hand back to hub' : 'Hand to cloud'}
                                </Button>
                            )}
                            {stateAuthorityConfirm === row.uuid && (
                                <span className="text-xs text-foreground-400">
                                    moves this dataset&apos;s journal between the desktop hub and the cloud; the
                                    epoch bumps to {row.journal_epoch + 1} on a real change, so a stale hub write is
                                    then refused — manual only, never automatic.
                                </span>
                            )}
                        </div>

                        {stateConfirm === row.uuid && (
                            <p className="text-xs text-danger-500">
                                Deletes it from the market and moves the live directory into the archive — the uploaded
                                bytes stay on the server.
                            </p>
                        )}

                        {stateEditing === row.uuid && (
                            <div className="flex gap-1.5 flex-wrap items-center border-t border-sand-300 pt-2">
                                <span className="text-xs text-foreground-400">tags:</span>
                                {stateTags.length === 0 && (
                                    <span className="text-xs text-foreground-400 italic">
                                        No tags — create them under Dataset → Tags
                                    </span>
                                )}
                                {stateTags.map((tag) => (
                                    <Chip
                                        key={tag.uuid}
                                        size="sm"
                                        variant={row.tags.some((t) => t.uuid === tag.uuid) ? 'primary' : 'secondary'}
                                        className="cursor-pointer select-none"
                                        onClick={() => toggleTag(row, tag)}
                                    >
                                        {tag.tag}
                                    </Chip>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
