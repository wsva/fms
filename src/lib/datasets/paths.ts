/**
 * Dataset storage paths — the only module that touches the filesystem with a
 * uuid. Every entry point re-validates the uuid charset and the type against
 * the fixed enum (defense in depth against path traversal from any caller).
 *
 * Layout (DATASET_ROOT, default /fms_datasets):
 *   <type>/<uuid>/                 extracted LIVE copy = authoritative content
 *   _archive/<type>/<uuid>/v<N>.tar.gz   immutable uploads
 *   _tmp/<upload-uuid>/            extraction sandbox
 */
import path from 'path';
import { DATASET_TYPES, UUID_RE, type DatasetType } from './info';

export const DATASET_ROOT = process.env.DATASET_ROOT || '/fms_datasets';
export const MAX_UPLOAD_MB = Number(process.env.MAX_DATASET_UPLOAD_MB || 512);

export function assertValidUuid(uuid: string): void {
    if (!UUID_RE.test(uuid)) {
        throw new Error(`invalid dataset uuid: ${JSON.stringify(uuid.slice(0, 40))}`);
    }
}

export function assertValidType(type: string): asserts type is DatasetType {
    if (!(DATASET_TYPES as readonly string[]).includes(type)) {
        throw new Error(`invalid dataset type: ${JSON.stringify(type.slice(0, 40))}`);
    }
}

export function datasetDir(type: string, uuid: string): string {
    assertValidUuid(uuid);
    assertValidType(type);
    return path.join(DATASET_ROOT, type, uuid);
}

export function archiveDir(type: string, uuid: string): string {
    return path.join(DATASET_ROOT, '_archive', type, uuid);
}

export function archivePath(type: string, uuid: string, version: number): string {
    assertValidUuid(uuid);
    assertValidType(type);
    if (!Number.isInteger(version) || version < 1) throw new Error('invalid dataset version');
    return path.join(archiveDir(type, uuid), `v${version}.tar.gz`);
}

export function tmpDir(uploadUuid: string): string {
    assertValidUuid(uploadUuid);
    return path.join(DATASET_ROOT, '_tmp', uploadUuid);
}

export function deletedDir(type: string, uuid: string): string {
    return path.join(DATASET_ROOT, '_archive', type, uuid, 'deleted');
}
