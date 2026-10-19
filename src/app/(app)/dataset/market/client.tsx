'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast, Button, Chip, ProgressCircle } from '@heroui/react';
import { MdCloudDownload, MdLibraryAdd, MdLibraryAddCheck } from 'react-icons/md';
import { listMarketDatasets, subscribeDataset, unsubscribeDataset } from '@/app/actions/dataset_hub';
import type { DatasetListItem, DatasetTagRef } from '@/lib/datasets/access';
import { DATASET_TYPES } from '@/lib/datasets/info';
import { formatBytes, formatStamp } from '@/lib/datasets/format';

type Props = { email: string; initialTag?: string; initialType?: string };

/** What the browser may fetch without another round-trip — the hub gates on the same rule. */
function canDownload(item: DatasetListItem): boolean {
    return item.is_owner || item.visibility === 'public' || (item.visibility === 'shared' && item.is_subscribed);
}

const VISIBILITY_COLOR = { private: 'danger', shared: 'warning', public: 'success' } as const;
const LINK_BUTTON =
    'inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-border-default bg-bg-card hover:bg-bg-hover';

export default function Client({ email, initialTag, initialType }: Props) {
    const router = useRouter();
    const [stateItems, setStateItems] = useState<DatasetListItem[]>([]);
    // A deep link from the tag page (/dataset/market?tag=…) starts the filter on.
    const [stateTypes, setStateTypes] = useState<string[]>(initialType ? [initialType] : []);
    const [stateTag, setStateTag] = useState(initialTag ?? '');
    const [stateTagOptions, setStateTagOptions] = useState<DatasetTagRef[]>([]);
    const [stateLoading, setStateLoading] = useState(true);
    const [stateBusy, setStateBusy] = useState<Set<string>>(new Set());

    useEffect(() => {
        const load = async () => {
            const result = await listMarketDatasets(stateTypes, stateTag ? [stateTag] : []);
            if (result.status === 'success') {
                setStateItems(result.data);
                // Tag options accumulate: filtering must not make the filter vanish.
                setStateTagOptions((prev) => {
                    const byUuid = new Map(prev.map((t) => [t.uuid, t] as const));
                    for (const tag of result.data.flatMap((d) => d.tags)) byUuid.set(tag.uuid, tag);
                    return [...byUuid.values()];
                });
            } else {
                toast.danger('Failed to load datasets');
            }
            setStateLoading(false);
        };
        load();
    }, [stateTypes, stateTag]);

    const toggleSubscribe = async (item: DatasetListItem) => {
        setStateBusy((prev) => new Set(prev).add(item.uuid));
        const result = item.is_subscribed ? await unsubscribeDataset(item.uuid) : await subscribeDataset(item.uuid);
        if (result.status === 'success') {
            setStateItems((prev) =>
                prev.map((d) => (d.uuid === item.uuid ? { ...d, is_subscribed: !d.is_subscribed } : d))
            );
        } else {
            toast.danger(String(result.error ?? 'Action failed'));
        }
        setStateBusy((prev) => {
            const next = new Set(prev);
            next.delete(item.uuid);
            return next;
        });
    };

    const toggleType = (type: string) => {
        setStateLoading(true);
        setStateTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
    };

    const toggleTagFilter = (uuid: string) => {
        setStateLoading(true);
        setStateTag(stateTag === uuid ? '' : uuid);
    };

    return (
        <div className="flex flex-col w-full mx-auto gap-6 py-8 px-4">
            <div className="flex items-center gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Dataset Hub</h1>
                    <p className="text-sm text-foreground-500 mt-0.5">
                        Subscribe to and download whole dataset directories
                    </p>
                </div>
                <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="ghost" onPress={() => router.push('/dataset/manage')}>
                        My Datasets
                    </Button>
                </div>
                {stateLoading && <ProgressCircle size="sm" aria-label="Loading" />}
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex gap-1.5 flex-wrap items-center">
                    {DATASET_TYPES.map((type) => (
                        <Chip
                            key={type}
                            size="sm"
                            variant={stateTypes.includes(type) ? 'primary' : 'secondary'}
                            className="cursor-pointer select-none"
                            onClick={() => toggleType(type)}
                        >
                            {type}
                        </Chip>
                    ))}
                    {stateTypes.length > 0 && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onPress={() => {
                                setStateLoading(true);
                                setStateTypes([]);
                            }}
                        >
                            Clear types
                        </Button>
                    )}
                </div>
                {stateTagOptions.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap items-center">
                        <span className="text-xs text-foreground-400">tag:</span>
                        {stateTagOptions.map((tag) => (
                            <Chip
                                key={tag.uuid}
                                size="sm"
                                variant={stateTag === tag.uuid ? 'primary' : 'secondary'}
                                className="cursor-pointer select-none"
                                onClick={() => toggleTagFilter(tag.uuid)}
                            >
                                {tag.name}
                            </Chip>
                        ))}
                    </div>
                )}
            </div>

            {!stateLoading && stateItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-foreground-400">
                    <MdCloudDownload size={48} className="opacity-30" />
                    <p className="text-sm">No datasets here yet</p>
                    <p className="text-xs">Upload one from the desktop app, or ask an owner to share theirs.</p>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {stateItems.map((item) => (
                    <div
                        key={item.uuid}
                        className="flex flex-col gap-2 bg-bg-card border border-border-default rounded-xl px-5 py-4"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <Link
                                href={`/dataset/market/${item.uuid}`}
                                className="text-base font-semibold text-foreground hover:underline min-w-0 break-words"
                            >
                                {item.name || item.uuid}
                            </Link>
                            <Chip
                                size="sm"
                                variant="tertiary"
                                color={VISIBILITY_COLOR[item.visibility as keyof typeof VISIBILITY_COLOR] ?? 'default'}
                            >
                                {item.visibility}
                            </Chip>
                        </div>

                        <div className="flex gap-1.5 flex-wrap">
                            <Chip size="sm" variant="secondary">
                                {item.dataset_type}
                            </Chip>
                            {item.language && (
                                <Chip size="sm" variant="tertiary">
                                    {item.language}
                                </Chip>
                            )}
                            {item.tags.map((tag) => (
                                <Chip key={tag.uuid} size="sm" variant="tertiary">
                                    {tag.name}
                                </Chip>
                            ))}
                        </div>

                        {item.description && (
                            <p className="text-sm text-foreground-600 line-clamp-2">{item.description}</p>
                        )}

                        <div className="text-xs text-foreground-400 flex flex-wrap gap-x-3 gap-y-1">
                            <span>{formatBytes(item.total_bytes)}</span>
                            <span>{item.file_count} files</span>
                            <span>
                                {item.dataset_type === 'card'
                                    ? `${item.card_count} cards`
                                    : `${item.media_count} media`}
                            </span>
                            <span>{formatStamp(item.info_updated_at)}</span>
                        </div>
                        <div className="text-xs text-foreground-400">
                            {item.is_owner ? 'by you' : `by ${item.user_id}`}
                        </div>

                        <div className="flex gap-2 mt-1 items-center">
                            {canDownload(item) ? (
                                <a
                                    className={LINK_BUTTON}
                                    href={`/api/v1/datasets/${item.uuid}/snapshot`}
                                    download={`${item.uuid}.tar.gz`}
                                >
                                    <MdCloudDownload size={16} />
                                    Download
                                </a>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    isDisabled={!email}
                                    isPending={stateBusy.has(item.uuid)}
                                    onPress={() => toggleSubscribe(item)}
                                >
                                    {!stateBusy.has(item.uuid) && <MdLibraryAdd size={16} />}
                                    Subscribe
                                </Button>
                            )}
                            {item.is_subscribed && !item.is_owner && (
                                <Button size="sm" variant="ghost" onPress={() => toggleSubscribe(item)}>
                                    <MdLibraryAddCheck size={16} />
                                    Unsubscribe
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto"
                                onPress={() => router.push(`/dataset/market/${item.uuid}`)}
                            >
                                Details
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {!email && (
                <p className="text-xs text-foreground-400">
                    Sign in to subscribe to shared datasets or to upload your own.
                </p>
            )}
        </div>
    );
}
