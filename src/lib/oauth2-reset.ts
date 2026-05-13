import { randomBytes } from 'crypto'

interface ResetToken {
    email: string
    expireAt: Date
}

class ResetTokenMap {
    private map = new Map<string, ResetToken>()

    generate(email: string): string {
        const token = randomBytes(32).toString('base64url')
        const expireAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        this.map.set(token, { email, expireAt })
        return token
    }

    consume(token: string): string | null {
        const entry = this.map.get(token)
        if (!entry) return null
        this.map.delete(token)
        if (entry.expireAt < new Date()) return null
        return entry.email
    }
}

const g = global as unknown as { _oauth2ResetMap?: ResetTokenMap }
if (!g._oauth2ResetMap) g._oauth2ResetMap = new ResetTokenMap()
export const resetTokenMap = g._oauth2ResetMap
