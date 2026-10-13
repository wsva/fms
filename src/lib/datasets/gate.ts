/**
 * Small in-process semaphore. Bounds concurrent snapshot packs (each one
 * freezes a DB and streams a tar.gz — expensive) so many downloads can't
 * saturate the server.
 */
const DEFAULT_LIMIT = Number(process.env.MAX_CONCURRENT_SNAPSHOTS || 2);

export class Gate {
    private running = 0;
    private waiting: (() => void)[] = [];

    constructor(private limit: number = DEFAULT_LIMIT) {}

    async acquire(): Promise<void> {
        if (this.running < this.limit) {
            this.running += 1;
            return;
        }
        await new Promise<void>((resolve) => this.waiting.push(resolve));
        this.running += 1;
    }

    release(): void {
        this.running -= 1;
        this.waiting.shift()?.();
    }

    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

export const snapshotGate = new Gate();
