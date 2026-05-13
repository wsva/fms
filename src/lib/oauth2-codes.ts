import { createHash } from 'crypto'

export interface CodeInfo {
    scope: string
    clientId: string
    accountId: string
    challenge: string
    code: string
    expireAt: Date
    parentToken: string
    state: string
}

class CodeMap {
    private map = new Map<string, CodeInfo>()

    add(ci: CodeInfo) {
        this.map.set(ci.code, ci)
    }

    verifyChallenge(code: string, verifier: string): CodeInfo | null {
        const info = this.map.get(code)
        if (!info) return null
        this.map.delete(code)
        if (info.expireAt < new Date()) return null

        const hash = createHash('sha256').update(verifier).digest()
        const challenge = hash.toString('base64url').replace(/=/g, '')
        const expected = info.challenge.replace(/=/g, '')
        return challenge === expected ? info : null
    }
}

const g = global as unknown as { _oauth2CodeMap?: CodeMap }
if (!g._oauth2CodeMap) g._oauth2CodeMap = new CodeMap()
export const codeMap = g._oauth2CodeMap
