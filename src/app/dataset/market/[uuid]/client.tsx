'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Button, Chip, ProgressCircle, Separator } from '@heroui/react';
import { MdCloudDownload, MdLibraryAdd, MdLibraryAddCheck } from 'react-icons/md';
import {
    getDatasetHubDetail,
    subscribeDataset,
    unsubscribeDataset,
    publishDatasetVersion,
    setDatasetVersionAvailability,
    type DatasetHubDetail,
} from '@/app/actions/dataset_hub';
import { formatBytes, formatStamp, shortHash } from '@/lib/datasets/format';

type Props = { uuid: string };

const LINK_BUTTON =
    'inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-sand-300 bg-sand-100 hover:bg-sand-200';

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-foreground-400">{label}</span>
            <span className="text-sm text-foreground break-all">{value}</span>
        </div>
    );
}

export default function Client({ uuid }: Props) {
    const router = useRouter();
    const [stateItem, setStateItem] = useState<DatasetHubDetail | null>(null);
    const [stateError, setStateError] = useState('');
    const [stateLoading, setStateLoading] = useState(true);
    const [stateBusy, setStateBusy] = useState<Set<string>>(new Set());
    const [stateConfirm, setStateConfirm] = useState('');

    useEffect(() => {
        const load = async () => {
            const result = await getDatasetHubDetail(uuid);
            if (result.status === 'success') {
                setStateItem(result.data);
                setStateError('');
            } else {
                setStateError(String(result.error ?? 'Not found'));
            }
            setStateLoading(false);
        };
        load();
    }, [uuid]);

    const toggleSubscribe = async () => {
        if (!stateItem) return;
        const result = stateItem.is_subscribed
            ? await unsubscribeDataset(stateItem.uuid)
            : await subscribeDataset(stateItem.uuid);
        if (result.status === 'success') {
            setStateItem({ ...stateItem, is_subscribed: !stateItem.is_subscribed });
        } else {
            toast.danger(String(result.error ?? 'Action failed'));
        }
    };

    const withVersionBusy = async (key: string, fn: () => Promise<{ status: string; error?: unknown }>) => {
        setStateBusy((prev) => new Set(prev).add(key));
        const result = await fn();
        setStateBusy((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
        return result;
    };

    const publish = async (version: number) => {
        if (!stateItem) return;
        const result = await withVersionBusy(`v${version}:publish`, () => publishDatasetVersion(stateItem.uuid, version));
        if (result.status === 'success') {
            setStateItem({ ...stateItem, current_version: version });
            toast.success(`Published v${version}`);
        } else {
            toast.danger(String(result.error ?? 'Publish failed'));
        }
    };

    const setAvailability = async (version: number, available: boolean) => {
        if (!stateItem) return;
        const op = available ? 'restore' : 'withdraw';
        const result = await withVersionBusy(`v${version}:${op}`, () =>
            setDatasetVersionAvailability(stateItem.uuid, version, available)
        );
        if (result.status === 'success') {
            // INV-17: a takedown never moves the pin, so patch only this row's flag.
            setStateItem({
                ...stateItem,
                versions: stateItem.versions.map((v) => (v.version === version ? { ...v, available: available ? 'Y' : 'N' } : v)),
            });
            toast.success(available ? `Restored v${version}` : `Withdrawn v${version}`);
        } else {
            toast.danger(String(result.error ?? 'Action failed'));
        }
        setStateConfirm('');
    };

    if (stateLoading) {
        return (
            <div className="flex items-center gap-3 py-12 px-4">
                <ProgressCircle size="sm" aria-label="Loading" />
                <span className="text-sm text-foreground-400">Loading dataset…</span>
            </div>
        );
    }

    if (!stateItem) {
        return (
            <div className="flex flex-col gap-3 py-12 px-4 items-start">
                <p className="text-sm text-foreground-500">{stateError || 'Dataset not found'}</p>
                <Button size="sm" variant="ghost" onPress={() => router.push('/dataset/market')}>
                    Back to market
                </Button>
            </div>
        );
    }

    const item = stateItem;
    const downloadable =
        item.is_owner || item.visibility === 'public' || (item.visibility === 'shared' && item.is_subscribed);

    return (
        <div className="flex flex-col w-full mx-auto gap-6 py-8 px-4">
            <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-foreground break-words">{item.name || item.uuid}</h1>
                    <p className="text-xs text-foreground-400 mt-1 break-all">{item.uuid}</p>
                </div>
                <div className="ml-auto flex gap-2 flex-wrap">
                    {downloadable && (
                        <a
                            className={LINK_BUTTON}
                            href={`/api/v1/datasets/${item.uuid}/snapshot`}
                            download={`${item.uuid}.tar.gz`}
                        >
                            <MdCloudDownload size={16} />
                            Download snapshot
                        </a>
                    )}
                    {!item.is_owner && (
                        <Button size="sm" variant={item.is_subscribed ? 'ghost' : 'primary'} onPress={toggleSubscribe}>
                            {item.is_subscribed ? <MdLibraryAddCheck size={16} /> : <MdLibraryAdd size={16} />}
                            {item.is_subscribed ? 'Unsubscribe' : 'Subscribe'}
                        </Button>
                    )}
                    {item.is_owner && (
                        <Button size="sm" variant="ghost" onPress={() => router.push('/dataset/manage')}>
                            Manage
                        </Button>
                    )}
                    {item.is_owner && item.dataset_type === 'card' && (
                        <Button size="sm" variant="outline" onPress={() => router.push(`/dataset/card/${item.uuid}`)}>
                            Edit cards
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex gap-1.5 flex-wrap">
                <Chip size="sm" variant="secondary">
                    {item.dataset_type}
                </Chip>
                <Chip size="sm" variant="tertiary">
                    {item.format}
                </Chip>
                <Chip size="sm" variant="tertiary">
                    spec {item.spec}
                </Chip>
                {item.language && (
                    <Chip size="sm" variant="tertiary">
                        {item.language}
                    </Chip>
                )}
                <Chip size="sm" variant="tertiary">
                    {item.visibility}
                </Chip>
                {item.tags.map((tag) => (
                    <Chip key={tag.uuid} size="sm" variant="tertiary">
                        {tag.name}
                    </Chip>
                ))}
            </div>

            {item.description && <p className="text-sm text-foreground-600">{item.description}</p>}

            <div className="bg-sand-100 border border-sand-300 rounded-xl px-5 py-4 grid gap-4 sm:grid-cols-3">
                <Field label="owner" value={item.is_owner ? 'you' : item.user_id} />
                <Field label="size" value={formatBytes(item.total_bytes)} />
                <Field label="files" value={String(item.file_count)} />
                <Field
                    label={item.dataset_type === 'card' ? 'cards' : 'media'}
                    value={String(item.dataset_type === 'card' ? item.card_count : item.media_count)}
                />
                <Field label="subscribers" value={String(item.subscriber_count)} />
                <Field label="info updated" value={formatStamp(item.info_updated_at)} />
                <Field label="sync cursor (snapshot_seq)" value={item.snapshot_seq} />
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-foreground">Integrity</h2>
                <div className="bg-sand-100 border border-sand-300 rounded-xl px-5 py-4 grid gap-4 sm:grid-cols-2">
                    <Field label="overall_hash" value={shortHash(item.overall_hash)} />
                    <Field label="archive sha256" value={shortHash(item.archive_sha256)} />
                </div>
                <p className="text-xs text-foreground-400">
                    <code>overall_hash</code> covers the non-database files only, so card edits never force a
                    re-download of the media. Followers compare it against their own copy before pulling a snapshot.
                </p>
            </div>

            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-foreground">Hub endpoints</h2>
                <div className="flex flex-col gap-1 text-xs text-foreground-500">
                    <span className="break-all">GET /api/v1/datasets/{item.uuid}/manifest</span>
                    <span className="break-all">GET /api/v1/datasets/{item.uuid}/snapshot</span>
                    <span className="break-all">GET /api/v1/file?dataset={item.uuid}&path=media/…</span>
                    <span className="break-all">GET /api/card/sync/pull?dataset_uuid={item.uuid}&since=…</span>
                    <span className="break-all">POST /api/card/sync/push?dataset_uuid={item.uuid}</span>
                </div>
                <p className="text-xs text-foreground-400">
                    Point the desktop app at this site and these paths serve it; a bearer token or the browser session
                    both authenticate.
                </p>
            </div>

            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-foreground">Versions</h2>
                <div className="flex flex-col gap-2">
                    {item.versions.map((v) => {
                        const isCurrent = v.version === item.current_version;
                        const withdrawn = v.available === 'N';
                        const busy = (op: string) => stateBusy.has(`v${v.version}:${op}`);
                        return (
                            <div
                                key={v.version}
                                className="flex items-center gap-3 bg-sand-100 border border-sand-300 rounded-lg px-4 py-2 text-xs text-foreground-500 flex-wrap"
                            >
                                <span className="font-semibold text-foreground">v{v.version}</span>
                                {isCurrent && (
                                    <Chip size="sm" variant="primary">
                                        current
                                    </Chip>
                                )}
                                {withdrawn && (
                                    <Chip size="sm" variant="tertiary" color="warning">
                                        withdrawn
                                    </Chip>
                                )}
                                <span>{formatBytes(v.total_bytes)}</span>
                                <span>{v.file_count} files</span>
                                <span>{shortHash(v.overall_hash)}</span>
                                <span>{formatStamp(v.info_updated_at)}</span>
                                <span className="ml-auto">uploaded {formatStamp(v.created_at)}</span>
                                {item.is_owner && (
                                    <div className="flex gap-2 items-center flex-wrap">
                                        {!isCurrent && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                isDisabled={busy('publish')}
                                                isPending={busy('publish')}
                                                onPress={() => publish(v.version)}
                                            >
                                                Publish v{v.version}
                                            </Button>
                                        )}
                                        {withdrawn ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                isDisabled={busy('restore')}
                                                isPending={busy('restore')}
                                                onPress={() => setAvailability(v.version, true)}
                                            >
                                                Restore
                                            </Button>
                                        ) : stateConfirm === `withdraw:${v.version}` ? (
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                isDisabled={busy('withdraw')}
                                                isPending={busy('withdraw')}
                                                onPress={() => setAvailability(v.version, false)}
                                            >
                                                Confirm withdraw
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-danger-500"
                                                isDisabled={busy('withdraw')}
                                                onPress={() => setStateConfirm(`withdraw:${v.version}`)}
                                            >
                                                Withdraw
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {item.is_owner && (
                    <p className="text-xs text-foreground-400">
                        Publishing pins the version registry reads resolve to; withdrawing takes it down without
                        rewriting its bytes and never moves the current pin — subscribers keep their installed copies.
                    </p>
                )}
            </div>

            <Button size="sm" variant="ghost" className="self-start" onPress={() => router.push('/dataset/market')}>
                Back to market
            </Button>
        </div>
    );
}
