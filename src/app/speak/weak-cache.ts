const weakCache = new Map(); // key -> WeakRef(blob)
const finalizer = new FinalizationRegistry((key) => {
    // 当 blob 被回收时，这里可以做日志或其它清理，但不要假定一定会运行
    weakCache.delete(key);
});

export function cacheBlobInMemory(key: string, blob: Blob) {
    if (typeof WeakRef === "undefined") return;
    const wr = new WeakRef(blob);
    weakCache.set(key, wr);
    try {
        finalizer.register(blob, key, blob);
    } catch (err) {
        console.log(err);
    }
}

export function getBlobFromWeakCache(key: string): Blob | null {
    const wr = weakCache.get(key);
    if (!wr) return null;
    const blob = wr.deref();
    if (!blob) {
        weakCache.delete(key);
        return null;
    }
    return blob;
}

export function dropWeakCache(key: string) {
    weakCache.delete(key);
}
