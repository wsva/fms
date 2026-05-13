class LoginAudit {
    private accountMap = new Map<string, Map<number, number>>()
    private ipMap = new Map<string, Map<number, number>>()

    private record(map: Map<string, Map<number, number>>, key: string) {
        if (!key) return
        const ts = Date.now()
        if (!map.has(key)) map.set(key, new Map())
        const inner = map.get(key)!
        inner.set(ts, (inner.get(ts) ?? 0) + 1)
    }

    addFailed(account: string, ip: string) {
        this.record(this.accountMap, account)
        this.record(this.ipMap, ip)
    }

    isAbnormal(account: string, ip: string): boolean {
        let count = 0
        for (const v of this.accountMap.get(account)?.values() ?? []) count += v
        for (const v of this.ipMap.get(ip)?.values() ?? []) count += v
        return count > 10
    }

    cleanup() {
        const deadline = Date.now() - 24 * 60 * 60 * 1000
        for (const inner of this.accountMap.values())
            for (const ts of inner.keys())
                if (ts < deadline) inner.delete(ts)
        for (const inner of this.ipMap.values())
            for (const ts of inner.keys())
                if (ts < deadline) inner.delete(ts)
    }
}

const g = global as unknown as { _oauth2Audit?: LoginAudit }
if (!g._oauth2Audit) g._oauth2Audit = new LoginAudit()
export const loginAudit = g._oauth2Audit
