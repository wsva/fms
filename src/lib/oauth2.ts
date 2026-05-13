import { SignJWT, jwtVerify, importPKCS8, importSPKI, exportJWK } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from './prisma'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'

const ISSUER = 'wsva_oauth2'
const TOKEN_SECONDS = 7 * 24 * 3600

// Cache keys in global to survive hot-reload in dev
const g = global as unknown as {
    _oauth2PrivateKey?: CryptoKey
    _oauth2PublicKey?: CryptoKey
}

async function getPrivateKey(): Promise<CryptoKey> {
    if (g._oauth2PrivateKey) return g._oauth2PrivateKey
    const path = process.env.OAUTH2_RSA_KEY_FILE
    if (!path) throw new Error('OAUTH2_RSA_KEY_FILE not configured')
    const pem = readFileSync(path, 'utf8')
    g._oauth2PrivateKey = await importPKCS8(pem, 'RS256')
    return g._oauth2PrivateKey
}

async function getPublicKey(): Promise<CryptoKey> {
    if (g._oauth2PublicKey) return g._oauth2PublicKey
    const path = process.env.OAUTH2_RSA_PUB_FILE
    if (!path) throw new Error('OAUTH2_RSA_PUB_FILE not configured')
    const pem = readFileSync(path, 'utf8')
    g._oauth2PublicKey = await importSPKI(pem, 'RS256')
    return g._oauth2PublicKey
}

export async function getPublicKeyJwk() {
    const key = await getPublicKey()
    return exportJWK(key)
}

export async function generateTokens(userId: string, clientId: string) {
    const privateKey = await getPrivateKey()
    const now = Math.floor(Date.now() / 1000)

    const accessToken = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(ISSUER)
        .setSubject(userId)
        .setAudience(clientId)
        .setIssuedAt(now)
        .setNotBefore(now)
        .setExpirationTime(now + TOKEN_SECONDS)
        .setJti(uuidv4())
        .sign(privateKey)

    const refreshToken = randomBytes(32).toString('base64url').toUpperCase()
    return { accessToken, refreshToken }
}

export async function verifyJwt(token: string) {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER })
    return payload
}

export function getClientIP(request: NextRequest): string {
    return (
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        '127.0.0.1'
    )
}

export function parseTokenFromRequest(request: NextRequest): string | null {
    const cookie = request.cookies.get('access_token')?.value
    if (cookie) return cookie
    const auth = request.headers.get('authorization') ?? ''
    if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7)
    return null
}

export interface TokenRecord {
    accessToken: string
    refreshToken: string
    clientId: string
    userId: string
    ip: string
    parent: string | null
}

export interface AuthResult {
    authorized: boolean
    token?: TokenRecord
    name?: string
    email?: string
}

export async function checkAuthorization(
    request: NextRequest,
    checkIp = false,
): Promise<AuthResult> {
    const tokenString = parseTokenFromRequest(request)
    if (!tokenString) return { authorized: false }

    try {
        await verifyJwt(tokenString)
    } catch {
        return { authorized: false }
    }

    const tokenRow = await prisma.oauth2_token.findUnique({
        where: { access_token: tokenString },
    })
    if (!tokenRow) return { authorized: false }

    if (checkIp && process.env.OAUTH2_CHECK_IP === 'true') {
        if (tokenRow.ip !== getClientIP(request)) return { authorized: false }
    }

    const userRow = await prisma.oauth2_user.findUnique({
        where: { user_id: tokenRow.user_id },
    })
    if (!userRow || userRow.is_active !== 'Y') return { authorized: false }

    return {
        authorized: true,
        token: {
            accessToken: tokenRow.access_token,
            refreshToken: tokenRow.refresh_token,
            clientId: tokenRow.client_id,
            userId: tokenRow.user_id,
            ip: tokenRow.ip,
            parent: tokenRow.parent ?? null,
        },
        name: userRow.nickname ?? tokenRow.user_id,
        email: tokenRow.user_id,
    }
}

export async function deleteTokens(
    accessToken?: string,
    userId?: string,
    ip?: string,
) {
    const orConditions: Record<string, string>[] = []
    if (accessToken) orConditions.push({ access_token: accessToken })
    if (userId && ip) orConditions.push({ user_id: userId, ip })
    if (orConditions.length === 0) return

    const found = await prisma.oauth2_token.findMany({
        where: { OR: orConditions },
        select: { access_token: true, parent: true },
    })
    if (found.length === 0) return

    const tokens = [
        ...new Set(found.flatMap((r) => [r.access_token, r.parent ?? '']).filter(Boolean)),
    ]

    await prisma.oauth2_token.deleteMany({
        where: {
            OR: [{ access_token: { in: tokens } }, { parent: { in: tokens } }],
        },
    })
}

export function setTokenCookies(
    response: NextResponse,
    accessToken: string,
    refreshToken: string,
) {
    const maxAge = TOKEN_SECONDS
    const opts = { httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge, path: '/' }
    response.cookies.set('access_token', accessToken, opts)
    response.cookies.set('refresh_token', refreshToken, opts)
}

export function clearTokenCookies(response: NextResponse) {
    response.cookies.set('access_token', '', { maxAge: 0, path: '/' })
    response.cookies.set('refresh_token', '', { maxAge: 0, path: '/' })
}

export const respondOk = (data?: unknown) =>
    NextResponse.json(data !== undefined ? data : { success: true })

export const respondErr = (msg: string | unknown) =>
    NextResponse.json({ success: false, errMsg: String(msg) })
