/**
 * A lightweight IndexedDB blob store utility written in TypeScript.
 * Provides basic CRUD operations for storing and retrieving Blob data.
 */

const DB_NAME = "audio-store";
const STORE_NAME = "blobs";
const DB_VERSION = 1;

export interface BlobRecord {
    uuid: string;
    audioBlob: Blob;
    createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "uuid" });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

/**
 * Save a Blob to IndexedDB
 */
export async function saveBlobToIndexedDB(uuid: string, audioBlob: Blob): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const record: BlobRecord = {
            uuid: uuid,
            audioBlob: audioBlob,
            createdAt: Date.now(),
        };

        const request = store.put(record);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get a Blob by ID
 */
export async function getBlobFromIndexedDB(uuid: string): Promise<Blob | null> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(uuid);

        request.onsuccess = () => {
            const result = request.result as BlobRecord | undefined;
            resolve(result ? result.audioBlob : null);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a Blob by ID
 */
export async function deleteBlobFromIndexedDB(uuid: string): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(uuid);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all records (for debugging / management)
 */
export async function listAllBlobs(): Promise<BlobRecord[]> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const result = request.result as BlobRecord[];
            resolve(result);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clear all blobs
 */
export async function clearAllBlobs(): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
